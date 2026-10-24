# Generative UI Lab

Local playground that races the same prompt across models and three ways of getting a model to produce UI, then compares time to first render, validity, tokens and cost.

## Approaches

| id | Output | Streaming | Constraint |
|---|---|---|---|
| `json-render` | [json-render](https://github.com/vercel-labs/json-render) SpecStream (JSONL RFC 6902 patches) | patch by patch | prompt generated from the catalog, per-patch Zod validation |
| `flat-strict` | strict JSON schema: flat element list with id-referenced children | partial-JSON parse | provider structured output |
| `html` | sandboxed HTML (CSP applied) | raw text | prompt only |

All three render from one shared component catalog (`src/catalog`).

## Models

Listed by `GET /api/models`, only when usable:

- **API**: Anthropic and OpenAI, when `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` is set. Billed per token; cost shown from the prices in `src/models.ts`.
- **Subscription**: local `claude` (Claude Code), `codex` and `opencode` CLIs, when on `PATH` and logged in. Spawned per run with tools off, an empty temp cwd and an env allowlist; credentials are never read by this app. Cost shows as subscription.
- `PLAYGROUND_CLI=off` disables the CLI providers.

CLI caveats: start-up adds latency (TTFT/TTFR not comparable with API runs), each harness may add its own system prompt, usage counts against the plan, and OpenCode refuses to run under managed config.

## Run

```bash
npm install
cp .env.example .env   # add API keys; optional if you only use CLIs
npm run dev            # API on 127.0.0.1:8787, Vite on :5173
```

Open http://localhost:5173.

| Script | |
|---|---|
| `npm run dev` | API (`node --watch`, loads `.env`) + Vite |
| `npm test` | Vitest |
| `npm run lint` | oxlint |
| `npm run build` | `tsc -b` + Vite build |

## Using it

- **Lab**: pick a preset or write a prompt, optionally attach a data fixture (`src/fixtures`), add lanes (approach × model × effort) and run. Each lane streams into a result pane with a race timeline and metrics strip. The system prompt is viewable per lane.
- **History**: batches of past runs, saved as JSON in `runs/` (gitignored). Open a batch to reload its lanes, or replay a run with its original chunk timing (scrub, speed control). Runs recorded before replay existed have no replay.

## Security

The API binds to loopback only, requires a loopback `Host` and same-origin `Origin` on every request, and accepts only JSON bodies. It is not meant to be exposed.

## Layout

```
server/        Hono API: run (stream), cli (subscription runners), runs (history store)
src/approaches/  the three approaches + replay parsing
src/catalog/   component catalog and element validation
src/lib/       cost, NDJSON events, run records, playback frames
src/ui/        lanes, timeline, metrics, history, replay
src/models.ts  model list and prices
src/prompts.ts presets and fixtures
```

## License

MIT, see [LICENSE](LICENSE).
