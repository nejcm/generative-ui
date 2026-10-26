import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { readNdjson, type RunEvent } from '../src/lib/ndjson.ts'
import { claudePhase, cliArgs, codexSession, eventMapper, killAllClis, opencodeConfigText, opencodeSession, probeClis, runCli } from './cli.ts'

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
const mapped = (provider: 'claude-code', name: string) => lines(name).map(eventMapper(provider)).filter(Boolean)

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
  expect(lines('claude-text').map(claudePhase).filter(Boolean)).toEqual(['startupMs', 'firstByteMs'])
})

test('codex session walks initialize, thread/start and turn/start, then streams deltas and usage', () => {
  const session = codexSession({ ...job, effort: 'low', schema: { type: 'integer' } }, '/tmp/x/cwd')
  expect(JSON.parse(session.start)).toMatchObject({ id: 1, method: 'initialize' })
  const [initialized, threadStart] = session.handle({ id: 1, result: {} }).write!.trim().split('\n').map((l) => JSON.parse(l))
  expect(initialized).toEqual({ method: 'initialized' })
  expect(threadStart).toMatchObject({ id: 2, method: 'thread/start', params: { model: 'm', sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true, cwd: '/tmp/x/cwd' } })
  const threadStarted = session.handle({ id: 2, result: { thread: { id: 'th' } } })
  expect(threadStarted.mark).toBe('startupMs')
  expect(JSON.parse(threadStarted.write!)).toMatchObject({
    id: 3,
    method: 'turn/start',
    params: { threadId: 'th', effort: 'low', outputSchema: { type: 'integer' }, input: [{ type: 'text', text: 'hi' }] },
  })
  expect(session.handle({ method: 'item/started', params: { item: { type: 'userMessage' } } })).toEqual({})
  expect(session.handle({ method: 'item/started', params: { item: { type: 'reasoning' } } })).toEqual({ mark: 'firstByteMs' })
  expect(session.handle({ method: 'item/reasoning/summaryTextDelta', params: { delta: 'hm' } })).toEqual({ mark: 'firstReasoningMs' })
  expect(session.handle({ method: 'item/agentMessage/delta', params: { delta: 'PINE' } })).toEqual({ event: { t: 'delta', text: 'PINE' } })
  session.handle({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { last: { inputTokens: 100, cachedInputTokens: 60, cacheWriteInputTokens: 0, outputTokens: 7, reasoningOutputTokens: 3 } } } })
  expect(session.handle({ method: 'turn/completed', params: { turn: { status: 'completed' } } })).toEqual({
    done: true,
    event: { t: 'usage', inputTokens: 100, outputTokens: 7, cachedInputTokens: 60, cacheWriteTokens: 0, reasoningTokens: 3 },
  })
})

test('codex session unwraps upstream errors and refuses server requests', () => {
  const session = codexSession(job, '/c')
  const wrapped = JSON.stringify({ type: 'error', error: { message: "The 'no-such-model' model is not supported." } })
  expect(session.handle({ method: 'error', params: { willRetry: false, error: { message: wrapped } } })).toEqual({ done: true, event: { t: 'error', message: "The 'no-such-model' model is not supported." } })
  expect(session.handle({ method: 'turn/completed', params: { turn: { status: 'failed', error: { message: 'boom' } } } })).toEqual({ done: true, event: { t: 'error', message: 'boom' } })
  expect(JSON.parse(session.handle({ id: 9, method: 'item/commandExecution/requestApproval', params: {} }).write!)).toMatchObject({ id: 9, error: { code: -32601 } })
})
const played = (name: string) => {
  const session = opencodeSession()
  return lines(name).map((e) => session.handle(e))
}

test('maps recorded opencode serve text deltas and step usage, ignoring session-wide usage', () => {
  const events = played('opencode-serve').flatMap((s) => (s.event ? [s.event] : []))
  const deltas = events.filter((e) => e.t === 'delta')
  expect(deltas).toHaveLength(51)
  const ended = lines('opencode-serve').find((e) => e.type === 'session.text.ended')
  expect(deltas.map((e) => e.text).join('')).toBe(ended.data.text)
  expect(events.at(-1)).toEqual({ t: 'usage', inputTokens: 756, outputTokens: 709, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 })
  expect(played('opencode-serve').flatMap((s) => s.mark ?? [])).toEqual(['firstByteMs'])
})

test('opencode step usage keeps reasoning in output tokens and reports it separately', () => {
  const session = opencodeSession()
  session.handle({ type: 'session.created', data: { sessionID: 'ses_1' } })
  expect(session.handle({ type: 'session.reasoning.delta', data: { sessionID: 'ses_1', delta: 'hm' } })).toEqual({ mark: 'firstReasoningMs' })
  session.handle({ type: 'session.step.ended', data: { sessionID: 'ses_1', tokens: { input: 10, output: 20, reasoning: 5, cache: { read: 0, write: 0 } } } })
  expect(session.handle({ type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } }).event).toMatchObject({ outputTokens: 25, reasoningTokens: 5 })
})

test('opencode session drops other sessions and falls back to whole text parts without deltas', () => {
  const session = opencodeSession()
  const part = { assistantMessageID: 'msg_1', ordinal: 0 }
  expect(session.handle({ type: 'session.text.delta', data: { sessionID: 'ses_1', ...part, delta: 'early' } })).toEqual({})
  session.handle({ type: 'session.created', data: { sessionID: 'ses_1' } })
  expect(session.handle({ type: 'session.text.delta', data: { sessionID: 'ses_2', ...part, delta: 'other' } })).toEqual({})
  expect(session.handle({ type: 'session.text.ended', data: { sessionID: 'ses_1', ...part, text: 'whole' } })).toEqual({ event: { t: 'delta', text: 'whole' } })
  expect(session.handle({ type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } })).toEqual({ done: true })
})

test('opencode serve keeps the quota error verbatim and ends the run', () => {
  expect(played('opencode-quota').find((s) => s.done)).toEqual({ done: true, event: { t: 'error', message: expect.stringMatching(/^Free usage limit reached\./) } })
})

test('opencode config keeps {env:} and {file:} in the system prompt literal', () => {
  const system = 'a {env:HOME} b {file:/etc/hostname} c'
  const text = opencodeConfigText(system)
  expect(text).not.toMatch(/\{(env|file):/)
  expect(JSON.parse(text).agents.playground.system).toBe(system)
})

// A stand-in `opencode serve`: Basic auth, a session, then the fixture as SSE once prompted. `check` vets each request body.
const serve = (name: string, check = 'true') =>
  `const lines=require('fs').readFileSync(${JSON.stringify(fixture(name).pathname)},'utf8').trim().split('\\n');let sse;
require('http').createServer((q,r)=>{if(q.headers.authorization!=='Basic '+Buffer.from('opencode:pw').toString('base64'))return r.writeHead(401).end();
if(q.url==='/api/event'){sse=r;r.writeHead(200,{'content-type':'text/event-stream'});return r.write(': heartbeat\\n\\n')}
let b='';q.on('data',d=>b+=d).on('end',()=>{const body=JSON.parse(b);if(!(${check}))return r.writeHead(400).end(b);
if(q.url==='/api/session')return r.end(JSON.stringify({data:{id:'ses_1'}}));
r.end('{"data":{}}');for(const l of lines)sse.write('data: '+l+'\\n\\n')})}).listen(0,'127.0.0.1',function(){console.log('server listening on http://127.0.0.1:'+this.address().port);console.log('server password pw')})`

test('opencode runs a private loopback server with a deny-all-but-read config, the system prompt as its agent and the effort as variant', async () => {
  expect(cliArgs('opencode', job, '/tmp/x')).toEqual(['serve', '--hostname', '127.0.0.1', '--port', '0'])
  const deny = [{ action: '*', resource: '*', effect: 'deny' }, { action: 'read', resource: '*', effect: 'allow' }]
  const config = JSON.parse(opencodeConfigText('sys'))
  expect(config).toMatchObject({ permissions: deny, agents: { playground: { system: 'sys', permissions: deny } }, mcp: {}, plugins: [] })
  // opencode applies the last matching rule.
  const effect = (action: string) => (config.permissions as typeof deny).findLast((r) => r.action === '*' || r.action === action)!.effect
  expect(['read', 'external_directory', 'shell', 'edit', 'webfetch'].map(effect)).toEqual(['allow', 'deny', 'deny', 'deny', 'deny'])
  vi.stubEnv('XDG_CONFIG_HOME', '/home/u/.config')
  fake.scripts.opencode = serve(
    'opencode-serve',
    `JSON.parse(require('fs').readFileSync(process.env.XDG_CONFIG_HOME+'/opencode/opencode.json','utf8')).agents.playground.system==='sys'&&(q.url==='/api/session'
      ? body.agent==='playground'&&body.model.providerID==='opencode-go'&&body.model.id==='kimi-k3'&&body.model.variant==='max'&&JSON.stringify(body.permissions)===${JSON.stringify(JSON.stringify(deny))}
      : q.url==='/api/session/ses_1/prompt'&&body.text==='hi')`,
  )
  const events = await collect(runCli('opencode', { ...job, modelName: 'opencode-go/kimi-k3', effort: 'max' }, new AbortController().signal))
  expect(events.map((e) => e.t)).toEqual([...Array(51).fill('delta'), 'usage', 'done'])
  const done = events.at(-1) as Extract<RunEvent, { t: 'done' }>
  expect(done.startupMs).toBeLessThanOrEqual(done.firstByteMs!)
  expect(done.firstByteMs).toBeLessThanOrEqual(done.ttftMs!)
  const { opts, child } = lastRun()
  expect(child.signalCode).toBe('SIGKILL')
  expect(opts.env).toMatchObject({
    HOME: expect.stringContaining('playground-cli-'),
    XDG_CONFIG_HOME: expect.stringContaining('playground-cli-'),
    XDG_DATA_HOME: expect.not.stringContaining('playground-cli-'),
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
  })
})

test('an opencode quota failure yields its message once; a server that stops early is an error', async () => {
  fake.scripts.opencode = serve('opencode-quota')
  expect(await collect(runCli('opencode', job, new AbortController().signal))).toEqual([{ t: 'error', message: expect.stringContaining('Free usage limit reached') }])
  fake.scripts.opencode = 'process.exit(0)'
  expect(await collect(runCli('opencode', job, new AbortController().signal))).toEqual([{ t: 'error', message: 'opencode server stopped before the run finished' }])
})

test('opencode refuses to run while a managed config, which could re-grant tools, exists', async () => {
  const fixture = { darwin: '/Library/Application Support/opencode', win32: join(process.env.ProgramData || 'C:\\ProgramData', 'opencode') }
  managed.add(fixture[process.platform as keyof typeof fixture] ?? '/etc/opencode')
  fake.scripts.opencode = serve('opencode-serve')
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
  fake.scripts.opencode = serve('opencode-serve')
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
  expect(events[3]).toMatchObject({ t: 'done', ttftMs: expect.any(Number), startupMs: expect.any(Number), firstByteMs: expect.any(Number) })
  const { args, opts } = lastRun()
  expect(args).toEqual(expect.arrayContaining(['--tools', '', '--strict-mcp-config', '--setting-sources', '', '--effort', 'low']))
  expect(opts.env).not.toHaveProperty('ANTHROPIC_API_KEY')
  expect(opts.env).not.toHaveProperty('CLAUDE_CODE_EFFORT_LEVEL')
  expect(opts.env).toMatchObject({ CODEX_CA_CERTIFICATE: '/ca.pem', ALL_PROXY: 'socks5://p', all_proxy: 'socks5://p' })
  expect(opts.env).toHaveProperty('PATH')
  expect(opts).toMatchObject({ detached: true })
  expect(existsSync(opts.cwd as string)).toBe(false)
})

// A stand-in app-server: answers each request line the way the real one does, then plays `after` once the turn starts.
const appServer = (after: string) =>
  `const rl=require('readline').createInterface({input:process.stdin});const out=o=>console.log(JSON.stringify(o));
rl.on('line',l=>{const m=JSON.parse(l);if(m.method==='initialize')out({id:m.id,result:{}});
else if(m.method==='thread/start')out({id:m.id,result:{thread:{id:'th'}}});
else if(m.method==='turn/start'){out({id:m.id,result:{turn:{id:'t'}}});${after}}})`

test('codex gets the system prompt as a file and the schema in turn/start, with a private CODEX_HOME', async () => {
  const args = cliArgs('codex', job, '/tmp/x')
  expect(args).toEqual(expect.arrayContaining(['app-server', '-c', 'model_instructions_file="/tmp/x/system.md"']))
  fake.scripts.codex = appServer(`if(require('fs').readFileSync('../system.md','utf8')!=='sys'||!JSON.stringify(m.params.outputSchema).includes('integer'))process.exit(4);
out({method:'item/agentMessage/delta',params:{delta:'{"n":0}'}});out({method:'turn/completed',params:{turn:{status:'completed'}}})`)
  const events = await collect(runCli('codex', { ...job, schema: { type: 'integer' } }, new AbortController().signal))
  expect(events.map((e) => e.t)).toEqual(['delta', 'usage', 'done'])
  expect(events[2]).toMatchObject({ startupMs: expect.any(Number), firstByteMs: expect.any(Number) })
  expect(events[2]).not.toHaveProperty('firstReasoningMs')
  const { opts } = lastRun()
  expect((opts.env as Record<string, string>).CODEX_HOME).toMatch(/playground-cli-.*codex-home$/)
  expect(lastRun().child.signalCode).toBe('SIGKILL')
})

test('claude refuses to run when its login switched away from the subscription after the probe', async () => {
  fake.scripts.claude = claudeAuth('console', replay('claude-text'))
  const events = await collect(runCli('claude-code', job, new AbortController().signal))
  expect(events).toEqual([{ t: 'error', message: expect.stringContaining('not logged in with a Claude subscription') }])
  expect(fake.calls.map((c) => c.args[0])).toEqual(['auth'])
  expect(existsSync(fake.calls[0].opts.cwd as string)).toBe(false)
})

test('a CLI error yields one error event, even with a non-zero exit', async () => {
  fake.scripts.codex = appServer(`out({method:'error',params:{willRetry:false,error:{message:'not supported'}}});out({method:'turn/completed',params:{turn:{status:'failed',error:{message:'not supported'}}}});process.exitCode=1`)
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
  const delta = `JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:String(s.pid)}}})`
  fake.scripts.claude = claudeAuth('claude.ai', `const s=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(${delta});setInterval(()=>{},1000)`)
  const client = new AbortController()
  const events = readNdjson(runCli('claude-code', job, client.signal))
  const server = Number(((await events.next()).value as { text: string }).text)
  expect(() => process.kill(server, 0)).not.toThrow()
  client.abort()
  await vi.waitFor(() => expect(() => process.kill(server, 0)).toThrow())
})

test('killAllClis kills running CLIs on server shutdown', async () => {
  fake.scripts.codex = `console.log(JSON.stringify({method:'item/agentMessage/delta',params:{delta:'x'}}));setInterval(()=>{},1000)`
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

test('codex session ends on a JSON-RPC request error', () => {
  expect(codexSession(job, '/c').handle({ id: 2, error: { message: 'bad request' } })).toEqual({ done: true, event: { t: 'error', message: 'bad request' } })
})

test('only app-server runs get the private CODEX_HOME, not the login probe', async () => {
  fake.scripts.codex = 'process.exit(0)'
  await collect(runCli('codex', job, new AbortController().signal))
  expect((lastRun().opts.env as Record<string, string>).CODEX_HOME).toMatch(/codex-home$/)
})
