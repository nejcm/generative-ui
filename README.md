# Generative UI Lab

Local playground that races the same prompt across models and four ways of getting a model to produce UI, then compares time to first render, validity, tokens and cost.

## Approaches

| id | Output | Streaming | Constraint |
|---|---|---|---|
| `json-render` | [json-render](https://github.com/vercel-labs/json-render) SpecStream (JSONL RFC 6902 patches) | patch by patch | prompt generated from the catalog, per-patch Zod validation |
| `flat-strict` | strict JSON schema: flat element list with id-referenced children | partial-JSON parse | provider structured output |
| `html` | HTML body in a sandboxed iframe (CSP applied); the page shell supplies the stylesheet and a chart helper | raw text | prompt only |
| `markup` | nested catalog tags with quoted props | opening tag by opening tag | shared catalog validation and renderer; static props |

All four use one shared component catalog (`src/catalog`).

## Models

Listed by `GET /api/models`, only when usable:

- **API**: Anthropic and OpenAI, when `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` is set. Billed per token; cost shown from the prices in `src/models.ts`.
- **Subscription**: local `claude` (Claude Code), `codex` and `opencode` CLIs, when on `PATH` and logged in. Spawned per run with tools off (OpenCode: except `read`, see caveats), an empty temp cwd and an env allowlist; credentials are never read by this app. Cost shows as subscription.
- `PLAYGROUND_CLI=off` disables the CLI providers.

CLI caveats: start-up adds latency (TTFT/TTFR not comparable with API runs), each harness may add its own system prompt, usage counts against the plan, and OpenCode refuses to run under managed config. OpenCode runs through a private `opencode serve` per run (loopback, random port, one-off password) and streams its experimental v2 event API, tested against v2.0.32 only. Text arrives in chunks of a few words (about every 0.1-0.2 s on `opencode/big-pickle`), not per token. OpenCode tools are off except `read`, confined to the empty temp cwd (`external_directory` is denied): with every tool denied, the OpenCode gateway rejects runs with a fake "Free usage limit reached" quota error.

## Quick start

Requires Node >= 24 and at least one usable model (an API key or a logged-in CLI, see Models).

```bash
git clone https://github.com/nejcm/generative-ui.git
cd generative-ui
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY; skip if you only use CLIs
npm run dev            # API on 127.0.0.1:8787, Vite on :5173
```

Open http://localhost:5173. If the Lab shows "No models available", add a key to `.env` and restart, or log in to `claude`, `codex` or `opencode` and make sure it is on `PATH`. Use `PLAYGROUND_CLI=off` in `.env` to hide the CLI providers.

| Script | |
|---|---|
| `npm run dev` | API (`node --watch`, loads `.env`) + Vite |
| `npm test` | Vitest |
| `npm run lint` | oxlint |
| `npm run format:check` | oxfmt |
| `npm run build` | `tsc -b` + Vite build |
| `node scripts/bench.mts <batchId>` | headless model matrix against the running API; see [scripts/bench.mts](scripts/bench.mts) |
| `node scripts/bench-stats.mts <batchId>` | report tables for a bench batch |

## Using it

Step-by-step walkthrough: [docs/instructions.md](docs/instructions.md). Summary:

- **Lab**: pick a preset or write a prompt, optionally attach a data fixture (`src/fixtures`), add lanes (approach × model × effort) and run. Each lane streams into a result pane with a race timeline and metrics strip. The system prompt is viewable per lane.
- **History**: batches of past runs, saved as JSON in `runs/` (gitignored). Open a batch to reload its lanes, or replay a run with its original chunk timing (scrub, speed control). Runs recorded before replay existed have no replay.

## Security

The API binds to loopback only, requires a loopback `Host` and same-origin `Origin` on every request, and accepts only JSON bodies. It is not meant to be exposed.

## Layout

```
server/        Hono API: run (stream), cli (subscription runners), runs (history store)
src/approaches/  the four approaches + replay parsing
src/catalog/   component catalog and element validation
src/lib/       cost, NDJSON events, run records, playback frames
src/ui/        lanes, timeline, metrics, history, replay
src/models.ts  model list and prices
src/prompts.ts presets and fixtures
```

## More

- [docs/instructions.md](docs/instructions.md): full usage guide
- [reports/benchmark-report.2026-10-25.md](reports/benchmark-report.2026-10-25.md): benchmark results across models and approaches
- [AGENTS.md](AGENTS.md): layout and conventions for contributors and coding agents

## License

MIT, see [LICENSE](LICENSE).
