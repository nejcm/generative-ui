import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { RunEvent } from '../src/lib/ndjson.ts'
import type { Provider } from '../src/models.ts'

export type CliProvider = Extract<Provider, 'claude-code' | 'codex' | 'opencode'>

export const isCli = (provider: Provider): provider is CliProvider => provider === 'claude-code' || provider === 'codex' || provider === 'opencode'

const bins: Record<CliProvider, string> = { 'claude-code': 'claude', codex: 'codex', opencode: 'opencode' }

// Allowlist: inherited vars such as ANTHROPIC_API_KEY or CLAUDE_CODE_EFFORT_LEVEL would change billing or the request.
const envKeys = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TZ', 'TERM',
  'CODEX_CA_CERTIFICATE', 'ALL_PROXY', 'all_proxy',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS',
  'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'ProgramData',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
])
const cliEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => envKeys.has(k) || k.startsWith('LC_')))

// Private config dir and HOME drop the user's global config, ~/.agents and ~/.claude; data dirs stay put because auth lives there.
const opencodeEnv = (dir: string) => ({
  HOME: join(dir, 'home'),
  XDG_CONFIG_HOME: join(dir, 'config'),
  XDG_DATA_HOME: process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
  XDG_STATE_HOME: process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  OPENCODE_DISABLE_PROJECT_CONFIG: '1',
  OPENCODE_DISABLE_CLAUDE_CODE: '1',
  OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1',
  OPENCODE_DISABLE_AUTOUPDATE: '1',
})

const denyAll = [{ action: '*', resource: '*', effect: 'deny' }]

const opencodeConfig = (system: string) => ({
  $schema: 'https://opencode.ai/config.json',
  permissions: denyAll,
  agents: { playground: { mode: 'primary', system, permissions: denyAll } },
  mcp: {},
  plugins: [],
  instructions: [],
  share: 'disabled',
  snapshots: false,
  websearch: false,
})

// Managed config loads after ours and can re-grant tools, so its presence blocks runs (paths from opencode's config discovery).
const managedOpencodeConfig = () =>
  (process.platform === 'darwin'
    ? ['/Library/Application Support/opencode', `/Library/Managed Preferences/${userInfo().username}/ai.opencode.managed.plist`, '/Library/Managed Preferences/ai.opencode.managed.plist']
    : process.platform === 'win32'
      ? [join(cliEnv().ProgramData || 'C:\\ProgramData', 'opencode')]
      : ['/etc/opencode']
  ).find((path) => existsSync(path))

// opencode substitutes {env:…} and {file:…} in raw config text; a JSON \u escape survives that and parses back to "{".
export const opencodeConfigText = (system: string) => JSON.stringify(opencodeConfig(system)).replace(/\{(?=(env|file):)/g, '\\u007b')

const codexOff = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'hooks', 'multi_agent', 'image_generation', 'browser_use', 'computer_use', 'view_image', 'tool_suggest', 'skill_search', 'goals', 'sleep_tool', 'code_mode_host']

type Job = { modelName: string; system: string; prompt: string; effort?: string; schema?: Record<string, unknown> }

export function cliArgs(provider: CliProvider, { modelName, system, effort, schema }: Job, dir: string): string[] {
  if (provider === 'opencode')
    return ['run', '--standalone', '--format', 'json', '--agent', 'playground', '--title', 'playground', '-m', effort ? `${modelName}#${effort}` : modelName]
  if (provider === 'claude-code')
    return [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--system-prompt', system,
      '--tools', '',
      '--strict-mcp-config',
      '--setting-sources', '',
      '--safe-mode',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--model', modelName,
      ...(effort ? ['--effort', effort] : []),
    ]
  return [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--ignore-user-config',
    '--ignore-rules',
    '-s', 'read-only',
    '-C', join(dir, 'cwd'),
    '-m', modelName,
    '-c', `model_instructions_file=${JSON.stringify(join(dir, 'system.md'))}`,
    '-c', 'include_permissions_instructions=false',
    '-c', 'include_environment_context=false',
    '-c', 'include_apps_instructions=false',
    '-c', 'include_collaboration_mode_instructions=false',
    '-c', 'web_search="disabled"',
    '-c', 'forced_login_method="chatgpt"',
    '-c', 'project_doc_max_bytes=0',
    '-c', 'skills.include_instructions=false',
    '-c', 'memories.use_memories=false',
    '-c', 'memories.generate_memories=false',
    ...codexOff.flatMap((feature) => ['--disable', feature]),
    ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
    ...(schema ? ['--output-schema', join(dir, 'schema.json')] : []),
    '-',
  ]
}

type CliEvent = {
  type: string
  event?: { type: string; delta?: { type: string; text?: string } }
  parent_tool_use_id?: string | null
  is_error?: boolean
  result?: string
  subtype?: string
  usage?: Record<string, number>
  item?: { type: string; text?: string }
  part?: { text?: string; reason?: string; tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } } }
  message?: string
  error?: { message: string }
}

// Codex wraps upstream errors as a JSON string.
const unwrap = (message: string) => {
  try {
    return String(JSON.parse(message).error?.message ?? message)
  } catch {
    return message
  }
}

const mapEvent: Record<Exclude<CliProvider, 'opencode'>, (e: CliEvent) => RunEvent | undefined> = {
  'claude-code': (e) => {
    if (e.type === 'stream_event' && !e.parent_tool_use_id && e.event?.type === 'content_block_delta' && e.event.delta?.type === 'text_delta')
      return { t: 'delta', text: e.event.delta.text ?? '' }
    if (e.type !== 'result') return
    if (e.is_error) return { t: 'error', message: e.result || e.subtype || 'claude failed' }
    const u = e.usage ?? {}
    return {
      t: 'usage',
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
    }
  },
  codex: (e) => {
    // shortcut: codex exec --json emits the reply only as a completed item, so the whole text arrives as one delta.
    if (e.type === 'item.completed' && e.item?.type === 'agent_message') return { t: 'delta', text: e.item.text ?? '' }
    if (e.type === 'turn.failed') return { t: 'error', message: unwrap(e.error?.message ?? 'codex failed') }
    if (e.type === 'error') return { t: 'error', message: unwrap(e.message ?? 'codex failed') }
    if (e.type !== 'turn.completed') return
    const u = e.usage ?? {}
    return {
      t: 'usage',
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cachedInputTokens: u.cached_input_tokens,
      cacheWriteTokens: u.cache_write_input_tokens,
    }
  },
}

function opencodeEvents() {
  const total = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 }
  return (e: CliEvent): RunEvent | undefined => {
    // shortcut: --format json emits each text part whole, not token deltas.
    if (e.type === 'text') return { t: 'delta', text: e.part?.text ?? '' }
    if (e.type === 'error') return { t: 'error', message: e.error?.message ?? 'opencode failed' }
    if (e.type !== 'step_finish' || !e.part?.tokens) return
    const { input, output, reasoning, cache } = e.part.tokens
    total.inputTokens += input + cache.read + cache.write
    total.outputTokens += output + reasoning
    total.cachedInputTokens += cache.read
    total.cacheWriteTokens += cache.write
    // shortcut: v2.0.32 exits before the final step_finish, so usage is usually absent rather than partial.
    if (e.part.reason !== 'tool-calls') return { t: 'usage', ...total }
  }
}

export const eventMapper = (provider: CliProvider) => (provider === 'opencode' ? opencodeEvents() : mapEvent[provider])

const parse = (line: string): CliEvent | undefined => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

const active = new Set<() => void>()

// For server shutdown: detached CLIs would otherwise outlive it.
export const killAllClis = () => active.forEach((kill) => kill())

// opencode's --standalone server runs in its own process group, so it is found by parent pid.
// shortcut: Linux /proc only, and a server already orphaned by its CLI is missed; elsewhere only the group is killed.
function descendants(root: number): number[] {
  const children = new Map<number, number[]>()
  try {
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
        children.set(ppid, [...(children.get(ppid) ?? []), Number(name)])
      } catch {
        // exited while scanning
      }
    }
  } catch {
    return []
  }
  const found: number[] = []
  for (let i = -1; i < found.length; i++) found.push(...(children.get(i < 0 ? root : found[i]) ?? []))
  return found
}

// Detached so the whole process group (the CLI and anything it spawned) can be killed, even after the leader exits.
function spawnCli(bin: string, args: string[], dir: string) {
  const env = { ...cliEnv(), ...(bin === 'opencode' && opencodeEnv(dir)) }
  const child = spawn(bin, args, { cwd: join(dir, 'cwd'), env, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
  child.stdin.on('error', () => {})
  const kill = () => {
    if (!child.pid) return
    const tree = child.exitCode === null && child.signalCode === null ? descendants(child.pid) : []
    for (const target of [-child.pid, ...tree])
      try {
        process.kill(target, 'SIGKILL')
      } catch {
        // ESRCH: already gone
      }
  }
  active.add(kill)
  let spawnError: Error | undefined
  child.on('error', (e) => (spawnError = e))
  const exit = new Promise<number | null>((resolve) => child.on('close', resolve))
  const dispose = async () => {
    kill()
    active.delete(kill)
    await exit
  }
  return { child, kill, dispose, exit, spawnError: () => spawnError }
}

const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'playground-cli-'))
  await mkdir(join(dir, 'cwd')).catch(async (error) => {
    await rm(dir, { recursive: true, force: true })
    throw error
  })
  return dir
}

export function runCli(provider: CliProvider, job: Job, signal: AbortSignal, timeoutMs = 10 * 60_000): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => signal.aborted || controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      let dir: string | undefined
      let proc: ReturnType<typeof spawnCli> | undefined
      let timer: NodeJS.Timeout | undefined
      let failed = false
      try {
        dir = await tempDir()
        // Auth can change after the startup probe; codex instead gets forced_login_method.
        if (provider === 'claude-code' && !(await loggedIn['claude-code'](10_000).catch(() => false))) {
          failed = true
          send({ t: 'error', message: 'claude is not logged in with a Claude subscription (claude.ai); run `claude auth login`' })
          return
        }
        const managed = provider === 'opencode' && managedOpencodeConfig()
        if (managed) {
          failed = true
          send({ t: 'error', message: `opencode runs are refused while managed config ${managed} exists: it could re-enable tools` })
          return
        }
        const started = performance.now()
        if (provider === 'codex') await writeFile(join(dir, 'system.md'), job.system)
        if (provider === 'opencode') {
          await mkdir(join(dir, 'config', 'opencode'), { recursive: true })
          await writeFile(join(dir, 'config', 'opencode', 'opencode.json'), opencodeConfigText(job.system))
        }
        if (job.schema) await writeFile(join(dir, 'schema.json'), JSON.stringify(job.schema))
        const p = (proc = spawnCli(bins[provider], cliArgs(provider, job, dir), dir))
        let timedOut = false
        timer = setTimeout(() => ((timedOut = true), p.kill()), timeoutMs)
        signal.addEventListener('abort', p.kill, { once: true })
        if (signal.aborted) p.kill()
        p.child.stdin.end(job.prompt)
        let stderr = ''
        p.child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-1000)))

        let ttftMs: number | null = null
        const map = eventMapper(provider)
        for await (const line of createInterface({ input: p.child.stdout })) {
          const parsed = parse(line)
          const event = parsed && map(parsed)
          if (!event || (event.t === 'error' && failed)) continue
          if (event.t === 'delta') ttftMs ??= performance.now() - started
          if (event.t === 'error') failed = true
          send(event)
        }
        const code = await p.exit
        if (failed) return
        const spawnError = p.spawnError()
        if (timedOut) send({ t: 'error', message: `${bins[provider]} timed out after ${timeoutMs / 1000}s` })
        else if (spawnError) send({ t: 'error', message: spawnError.message })
        else if (code !== 0) send({ t: 'error', message: stderr.trim() || `${bins[provider]} exited with code ${code}` })
        else send({ t: 'done', ttftMs, totalMs: performance.now() - started })
      } catch (error) {
        if (!failed) send({ t: 'error', message: error instanceof Error ? error.message : String(error) })
      } finally {
        clearTimeout(timer)
        if (proc) signal.removeEventListener('abort', proc.kill)
        await proc?.dispose()
        if (dir) await rm(dir, { recursive: true, force: true })
        if (!signal.aborted) controller.close()
      }
    },
  })
}

async function probe(bin: string, args: string[], timeoutMs: number) {
  const dir = await tempDir()
  const proc = spawnCli(bin, args, dir)
  const timer = setTimeout(proc.kill, timeoutMs)
  try {
    proc.child.stdin.end()
    let stdout = ''
    let stderr = ''
    proc.child.stdout.on('data', (d) => (stdout += d))
    proc.child.stderr.on('data', (d) => (stderr += d))
    return { code: await proc.exit, stdout, stderr }
  } finally {
    clearTimeout(timer)
    await proc.dispose()
    await rm(dir, { recursive: true, force: true })
  }
}

// Subscription logins only: API-key logins would be billed per token but shown as "subscription".
const loggedIn: Record<CliProvider, (timeoutMs: number) => Promise<boolean>> = {
  'claude-code': async (timeoutMs) => {
    const { code, stdout } = await probe('claude', ['auth', 'status', '--json'], timeoutMs)
    const status = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string }
    return code === 0 && status.loggedIn === true && status.authMethod === 'claude.ai'
  },
  codex: async (timeoutMs) => {
    const { code, stdout, stderr } = await probe('codex', ['login', 'status'], timeoutMs)
    return code === 0 && `${stdout}${stderr}`.includes('Logged in using ChatGPT')
  },
  opencode: async (timeoutMs) => {
    const { code, stdout } = await probe('opencode', ['auth', 'list', '--standalone', '--format', 'json'], timeoutMs)
    const integrations = JSON.parse(stdout) as { id: string; connections?: unknown[] }[]
    return code === 0 && integrations.some((i) => i.id === 'opencode-go' && Boolean(i.connections?.length))
  },
}

// Installed and logged in; spawn failures (not on PATH) and timeouts count as unavailable.
export async function probeClis(timeoutMs = 10_000): Promise<CliProvider[]> {
  if (process.env.PLAYGROUND_CLI === 'off') return []
  const providers = Object.keys(loggedIn) as CliProvider[]
  const ok = await Promise.all(providers.map((p) => loggedIn[p](timeoutMs).catch(() => false)))
  return providers.filter((_, i) => ok[i])
}
