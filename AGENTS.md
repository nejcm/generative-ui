# AGENTS.md

Generative UI Lab: local React + Hono playground comparing UI-generation approaches across models. See [README.md](README.md) for what it does.

## Commands

- Dev server is assumed running (`npm run dev`); do not start one.
- Checks: `npm test` (Vitest), `npm run lint` (oxlint), `npx tsc -b --noEmit` (covers `scripts/` via `tsconfig.scripts.json`), `npm run format:check` (oxfmt; `npm run format` writes, not yet applied repo-wide). Don't run `npm run build` unless asked.
- `plans/` and `runs/` are gitignored scratch (design notes, saved runs).

## Layout

- `server/index.ts`: Hono app, model availability, loopback guards. `run.ts` streams a run as NDJSON `RunEvent`s; `cli.ts` runs claude/codex/opencode as subprocesses; `runs.ts` persists records in `runs/`.
- `src/approaches/`: `Approach` interface in `types.ts` (system prompt, output kind, stateful async `Parser`, `Renderer`). Register new ones in `index.ts`.
- `src/catalog/`: single component catalog shared by all approaches; `validateElement` guards rendering.
- `src/lib/`: `cost.ts`, `ndjson.ts` (`RunEvent`), `run.ts` (`RunRecord` zod schema, strict), `playback.ts` (precomputed replay frames).
- `src/ui/`: `Pane` (runs a lane, records deltas), `History`, `Replay`, `Timeline`, `MetricsStrip`. `App.tsx` is the shell. Styles in `index.css` and `lab.css`.
- `scripts/`: `bench.mts <batchId>` runs the CLI-model matrix headlessly against the running API (resumable; stops a provider on quota errors); `bench-stats.mts <batchId>` prints report tables. Both load `src/` via `jiti`.
- `scripts/export-demo.mts`: bundles `runs/` into committed `public/demo/` (static replay data). `VITE_DEMO=1` makes `getJson` in `src/lib/async.ts` read those files; `.github/workflows/pages.yml` builds and deploys it with `BASE=/generative-ui/`.
- `src/models.ts`: model list, prices, supported effort levels. `src/prompts.ts`: presets and fixtures.

## Conventions

- Zero-runtime-dependency bias: CLI providers are spawned, not wrapped in SDKs.
- Subscription runs have no `price`; `costUsd` is `null` and the UI shows "subscription".
- Never read or log CLI credential files. `cliEnv` is an allowlist; keep it that way.
- API must stay loopback-only with the Host/Origin checks in `server/index.ts`.
- `RunRecord` is `strictObject`; new fields must be optional so old run files still parse.
- Pin `@json-render/*` exactly (0.x, API churn).
- Prices/model ids change: update `src/models.ts` with `source` and `checkedAt`.
