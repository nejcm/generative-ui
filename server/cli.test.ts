import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { readNdjson, type RunEvent } from '../src/lib/ndjson.ts'
import { cliArgs, eventMapper, killAllClis, opencodeConfigText, probeClis, runCli, type CliProvider } from './cli.ts'

// Each spawn runs a real node child that plays the given script, so pipes, exit codes and process groups are real.
const fake = vi.hoisted(() => ({
  scripts: {} as Record<string, string>,
  calls: [] as { bin: string; args: string[]; opts: SpawnOptions; child: ChildProcess }[],
}))
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  return {
    ...real,
    spawn: (bin: string, args: string[], opts: SpawnOptions) => {
      const child = real.spawn(process.execPath, ['-e', fake.scripts[bin] ?? 'process.exit(127)', '--', ...args], opts)
      fake.calls.push({ bin, args, opts, child })
      return child
    },
  }
})

const managed = vi.hoisted(() => new Set<string>())
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, existsSync: (path: string) => managed.has(path) || real.existsSync(path) }
})

afterEach(() => {
  managed.clear()
  fake.scripts = {}
  fake.calls = []
  vi.unstubAllEnvs()
})

const fixture = (name: string) => new URL(`./fixtures/${name}.jsonl`, import.meta.url)
const replay = (name: string) => `process.stdout.write(require('fs').readFileSync(${JSON.stringify(fixture(name).pathname)}))`
const lines = (name: string) => readFileSync(fixture(name), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const mapped = (provider: CliProvider, name: string) => lines(name).map(eventMapper(provider)).filter(Boolean)

const job = { modelName: 'm', system: 'sys', prompt: 'hi' }
const claudeAuth = (method: string, run: string) =>
  `if(process.argv.includes('auth'))console.log(JSON.stringify({loggedIn:true,authMethod:'${method}'}));else{${run}}`
const lastRun = () => fake.calls.at(-1)!
const collect = async (body: ReadableStream<Uint8Array>) => {
  const events: RunEvent[] = []
  for await (const e of readNdjson(body)) events.push(e)
  return events
}

test('maps claude stream-json text deltas and result usage', () => {
  expect(mapped('claude-code', 'claude-text')).toEqual([
    { t: 'delta', text: 'Hello there,' },
    { t: 'delta', text: ' friend!' },
    { t: 'usage', inputTokens: 810, outputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 808 },
  ])
  expect(mapped('claude-code', 'claude-error')).toEqual([{ t: 'error', message: expect.stringContaining('issue with the selected model') }])
})

test('maps codex --json messages, usage and errors', () => {
  expect(mapped('codex', 'codex-text')).toEqual([
    { t: 'delta', text: 'PINEAPPLE' },
    { t: 'usage', inputTokens: 9226, outputTokens: 7, cachedInputTokens: 3200, cacheWriteTokens: 0 },
  ])
  expect(mapped('codex', 'codex-json')[0]).toEqual({ t: 'delta', text: '{"n":0}' })
  expect(mapped('codex', 'codex-error')[0]).toEqual({ t: 'error', message: "The 'no-such-model' model is not supported when using Codex with a ChatGPT account." })
})

test('maps opencode --format json text parts and errors; usage stays absent without the final step_finish', () => {
  expect(mapped('opencode', 'opencode-text')).toEqual([
    { t: 'delta', text: 'I can call a tool. Let me list the files:' },
    { t: 'delta', text: expect.stringContaining('NO TOOLS') },
  ])
  expect(mapped('opencode', 'opencode-error')).toEqual([{ t: 'error', message: 'Variant unavailable for opencode-go/kimi-k3: low' }])
})

test('opencode usage sums every step once the final step_finish arrives', () => {
  const tokens = { input: 300, output: 20, reasoning: 5, cache: { read: 100, write: 10 } }
  const final = { type: 'step_finish', part: { reason: 'stop', tokens } }
  expect([...lines('opencode-text'), final].map(eventMapper('opencode')).filter((e) => e?.t === 'usage')).toEqual([
    { t: 'usage', inputTokens: 326 + 410, outputTokens: 89 + 44 + 25, cachedInputTokens: 100, cacheWriteTokens: 10 },
  ])
})

test('opencode config keeps {env:} and {file:} in the system prompt literal', () => {
  const system = 'a {env:HOME} b {file:/etc/hostname} c'
  const text = opencodeConfigText(system)
  expect(text).not.toMatch(/\{(env|file):/)
  expect(JSON.parse(text).agents.playground.system).toBe(system)
})

test('opencode runs standalone with a private deny-all config, the system prompt as its agent and the effort as #variant', async () => {
  expect(cliArgs('opencode', { ...job, modelName: 'opencode-go/kimi-k3', effort: 'max' }, '/tmp/x')).toEqual(
    expect.arrayContaining(['run', '--standalone', '--format', 'json', '--agent', 'playground', '-m', 'opencode-go/kimi-k3#max']),
  )
  expect(cliArgs('opencode', { ...job, modelName: 'opencode-go/kimi-k3' }, '/tmp/x').at(-1)).toBe('opencode-go/kimi-k3')
  const deny = [{ action: '*', resource: '*', effect: 'deny' }]
  expect(JSON.parse(opencodeConfigText('sys'))).toMatchObject({ permissions: deny, agents: { playground: { system: 'sys', permissions: deny } }, mcp: {}, plugins: [] })
  vi.stubEnv('XDG_CONFIG_HOME', '/home/u/.config')
  fake.scripts.opencode = `const c=JSON.parse(require('fs').readFileSync(process.env.XDG_CONFIG_HOME+'/opencode/opencode.json','utf8'));if(c.agents.playground.system!=='sys'||c.permissions[0].effect!=='deny')process.exit(5);${replay('opencode-text')}`
  const events = await collect(runCli('opencode', job, new AbortController().signal))
  expect(events.map((e) => e.t)).toEqual(['delta', 'delta', 'done'])
  const { opts } = lastRun()
  expect(opts.env).toMatchObject({
    HOME: expect.stringContaining('playground-cli-'),
    XDG_CONFIG_HOME: expect.stringContaining('playground-cli-'),
    XDG_DATA_HOME: expect.not.stringContaining('playground-cli-'),
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
  })
})

test('opencode refuses to run while a managed config, which could re-grant tools, exists', async () => {
  const fixture = { darwin: '/Library/Application Support/opencode', win32: join(process.env.ProgramData || 'C:\\ProgramData', 'opencode') }
  managed.add(fixture[process.platform as keyof typeof fixture] ?? '/etc/opencode')
  fake.scripts.opencode = replay('opencode-text')
  const events = await collect(runCli('opencode', job, new AbortController().signal))
  expect(events).toEqual([{ t: 'error', message: expect.stringContaining('managed config') }])
  expect(fake.calls).toEqual([])
})

test('on Windows the managed-config guard checks the ProgramData the child receives', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { value: 'win32' })
  try {
    vi.stubEnv('ProgramData', 'D:\\PD')
    managed.add(join('D:\\PD', 'opencode'))
    const events = await collect(runCli('opencode', job, new AbortController().signal))
    expect(events).toEqual([{ t: 'error', message: expect.stringContaining(join('D:\\PD', 'opencode')) }])
  } finally {
    Object.defineProperty(process, 'platform', platform)
  }
  managed.clear()
  vi.stubEnv('ProgramData', 'D:\\PD')
  fake.scripts.opencode = replay('opencode-text')
  await collect(runCli('opencode', job, new AbortController().signal))
  expect(lastRun().opts.env).toHaveProperty('ProgramData', 'D:\\PD')
})

test('runs claude in a removed temp dir with no tools, an allowlisted env and the prompt on stdin', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
  vi.stubEnv('CLAUDE_CODE_EFFORT_LEVEL', 'max')
  vi.stubEnv('CODEX_CA_CERTIFICATE', '/ca.pem')
  vi.stubEnv('ALL_PROXY', 'socks5://p')
  vi.stubEnv('all_proxy', 'socks5://p')
  fake.scripts.claude = claudeAuth('claude.ai', `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{if(s!=='hi')process.exit(3);${replay('claude-text')}})`)
  const events = await collect(runCli('claude-code', { ...job, effort: 'low' }, new AbortController().signal))
  expect(events.slice(0, 3).map((e) => e.t)).toEqual(['delta', 'delta', 'usage'])
  expect(events[3]).toMatchObject({ t: 'done', ttftMs: expect.any(Number) })
  const { args, opts } = lastRun()
  expect(args).toEqual(expect.arrayContaining(['--tools', '', '--strict-mcp-config', '--setting-sources', '', '--effort', 'low']))
  expect(opts.env).not.toHaveProperty('ANTHROPIC_API_KEY')
  expect(opts.env).not.toHaveProperty('CLAUDE_CODE_EFFORT_LEVEL')
  expect(opts.env).toMatchObject({ CODEX_CA_CERTIFICATE: '/ca.pem', ALL_PROXY: 'socks5://p', all_proxy: 'socks5://p' })
  expect(opts.env).toHaveProperty('PATH')
  expect(opts).toMatchObject({ detached: true })
  expect(existsSync(opts.cwd as string)).toBe(false)
})

test('codex gets the system prompt and schema as files inside its temp dir', async () => {
  const args = cliArgs('codex', { ...job, schema: { type: 'integer' } }, '/tmp/x')
  expect(args).toEqual(expect.arrayContaining(['-s', 'read-only', '-C', '/tmp/x/cwd', '-c', 'model_instructions_file="/tmp/x/system.md"', '--output-schema', '/tmp/x/schema.json']))
  fake.scripts.codex = `const fs=require('fs');if(fs.readFileSync('../system.md','utf8')!=='sys'||!fs.readFileSync('../schema.json','utf8').includes('integer'))process.exit(4);${replay('codex-json')}`
  const events = await collect(runCli('codex', { ...job, schema: { type: 'integer' } }, new AbortController().signal))
  expect(events.map((e) => e.t)).toEqual(['delta', 'usage', 'done'])
})

test('claude refuses to run when its login switched away from the subscription after the probe', async () => {
  fake.scripts.claude = claudeAuth('console', replay('claude-text'))
  const events = await collect(runCli('claude-code', job, new AbortController().signal))
  expect(events).toEqual([{ t: 'error', message: expect.stringContaining('not logged in with a Claude subscription') }])
  expect(fake.calls.map((c) => c.args[0])).toEqual(['auth'])
  expect(existsSync(fake.calls[0].opts.cwd as string)).toBe(false)
})

test('a CLI error yields one error event, even with a non-zero exit', async () => {
  fake.scripts.codex = `${replay('codex-error')};process.exitCode=1`
  const events = await collect(runCli('codex', job, new AbortController().signal))
  expect(events).toEqual([{ t: 'error', message: expect.stringContaining('not supported') }])
})

test('a non-zero exit without an error event reports stderr', async () => {
  fake.scripts.claude = claudeAuth('claude.ai', `process.stderr.write('bad flag');process.exit(2)`)
  expect(await collect(runCli('claude-code', job, new AbortController().signal))).toEqual([{ t: 'error', message: 'bad flag' }])
})

test('aborting kills the child process group and removes the temp dir', async () => {
  fake.scripts.claude = claudeAuth('claude.ai', `console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'partial'}}}));setInterval(()=>{},1000)`)
  const client = new AbortController()
  const events = readNdjson(runCli('claude-code', job, client.signal))
  expect((await events.next()).value).toEqual({ t: 'delta', text: 'partial' })
  client.abort()
  const { child, opts } = lastRun()
  await vi.waitFor(() => expect(child.signalCode).toBe('SIGKILL'))
  await vi.waitFor(() => expect(existsSync(opts.cwd as string)).toBe(false))
})

test('abort still kills a descendant that outlives the CLI and holds its stdout', async () => {
  const delta = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } } })
  fake.scripts.claude = claudeAuth('claude.ai', `require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','ignore']}).unref();console.log(${JSON.stringify(delta)})`)
  const client = new AbortController()
  const events = readNdjson(runCli('claude-code', job, client.signal))
  expect((await events.next()).value).toEqual({ t: 'delta', text: 'x' })
  const { child } = lastRun()
  await vi.waitFor(() => expect(child.exitCode).toBe(0))
  client.abort()
  await vi.waitFor(() => expect(() => process.kill(-child.pid!, 0)).toThrow())
})

test('abort also kills a descendant in its own process group, like opencode --standalone', async () => {
  fake.scripts.opencode = `const s=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(JSON.stringify({type:'text',part:{text:String(s.pid)}}));setInterval(()=>{},1000)`
  const client = new AbortController()
  const events = readNdjson(runCli('opencode', job, client.signal))
  const server = Number(((await events.next()).value as { text: string }).text)
  expect(() => process.kill(server, 0)).not.toThrow()
  client.abort()
  await vi.waitFor(() => expect(() => process.kill(server, 0)).toThrow())
})

test('killAllClis kills running CLIs on server shutdown', async () => {
  fake.scripts.codex = `console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'x'}}));setInterval(()=>{},1000)`
  const events = readNdjson(runCli('codex', job, new AbortController().signal))
  await events.next()
  killAllClis()
  await vi.waitFor(() => expect(fake.calls[0].child.signalCode).toBe('SIGKILL'))
})

test('a hung CLI is killed after the timeout', async () => {
  fake.scripts.codex = 'setInterval(()=>{},1000)'
  expect(await collect(runCli('codex', job, new AbortController().signal, 200))).toEqual([{ t: 'error', message: 'codex timed out after 0.2s' }])
  expect(fake.calls[0].child.signalCode).toBe('SIGKILL')
})

test('probe lists only installed CLIs logged in with a subscription', async () => {
  fake.scripts.claude = `console.log(JSON.stringify({loggedIn:true,authMethod:'claude.ai'}))`
  fake.scripts.codex = `console.error('Not logged in');process.exit(1)`
  fake.scripts.opencode = `console.log(JSON.stringify([{id:'opencode-go',name:'OpenCode Go',connections:[{type:'credential',label:'API key',method:'key'}]}]))`
  expect(await probeClis()).toEqual(['claude-code', 'opencode'])
  // Probes run concurrently and each awaits mkdtemp before spawning, so spawn order varies.
  expect(fake.calls.map((c) => [c.bin, ...c.args]).sort()).toEqual([
    ['claude', 'auth', 'status', '--json'],
    ['codex', 'login', 'status'],
    ['opencode', 'auth', 'list', '--standalone', '--format', 'json'],
  ])
  expect(fake.calls.find((c) => c.bin === 'opencode')!.opts.env).toHaveProperty('XDG_CONFIG_HOME', expect.stringContaining('playground-cli-'))
  fake.scripts.claude = `console.log(JSON.stringify({loggedIn:true,authMethod:'api_key'}))`
  fake.scripts.codex = `console.error('Logged in using an API key - sk-***')`
  fake.scripts.opencode = `console.log(JSON.stringify([{id:'opencode',connections:[{}]},{id:'opencode-go',connections:[]}]))`
  expect(await probeClis()).toEqual([])
  fake.scripts.claude = `console.log(JSON.stringify({loggedIn:false}))`
  fake.scripts.codex = `console.error('Logged in using ChatGPT')`
  expect(await probeClis()).toEqual(['codex'])
  vi.stubEnv('PLAYGROUND_CLI', 'off')
  expect(await probeClis()).toEqual([])
})
