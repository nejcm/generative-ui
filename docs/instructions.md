# Using Generative UI Lab

## 1. Set up

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173.

Models appear only when usable:

- Put `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` in `.env`, then restart the dev server.
- Or log in to the `claude`, `codex` or `opencode` CLI. Those models show as "· subscription" or "· OpenCode Go" and are billed to your plan.

If none are available, the Lab shows a "No models available" notice.

## 2. Lab: run a comparison

1. **Prompt**: type a description of the UI, or click a preset chip. Presets with data carry a fixture tag.
2. **Fixture** (top right of the prompt box): attach sample data (`sales`, `products`, `projects`, `rows`) so the model builds around real content. Editing the text clears the preset.
3. **Lanes**: each lane is one run configuration. Up to 4. Use **Add lane**, reorder with the arrows, remove with ✕. Lanes are remembered across reloads.
4. For each lane choose:
   - **Approach**: `json-render` (streamed patches), `flat-strict` (strict JSON schema), `html` (sandboxed HTML).
   - **Model**
   - **Effort**: reasoning level, when the model has them.
   - **Temperature**: only where the model allows it.
5. **Run N at once** starts every lane in parallel. **Run only this** runs the focused lane. **Stop all** / **Stop run** abort.

Keep the prompt, fixture and system prompt the same across lanes to compare approaches or models fairly. Change one thing at a time.

### Reading the results

- **Timeline**: one bar per lane on a shared clock, with the first-render mark. Click a bar to focus that lane.
- **Lane rail**: status and metrics per lane (TTFR, total time, cost, error count, rating). Click one to focus it.
- **Metrics strip**: time to first render (TTFR), time to first token, total time, tokens, cost.
- **Output view**: Rendered, Raw stream, or Split.
- **System prompt**: expand to see the exact prompt sent. You can edit it for that lane (marked "Overridden"); changing the approach resets it.
- **Errors**: parse and catalog-validation problems, listed per run. Invalid elements are dropped rather than rendered.
- **Scorecard**: compare lanes side by side and toggle which are shown.

### Rate runs

Each finished run is saved automatically to `runs/` as JSON. Give it a 1–5 rating and optional notes in its lane. History shows how many runs still need a rating.

## 3. History

- Filter by preset. Runs are grouped by batch (one click of **Run N at once**).
- Select a run for metrics, output, errors, rating and notes.
- **Replay**: runs recorded with timings replay exactly as they streamed. Play/pause, restart, drag to scrub, speed 0.5×–4×. Timing is what the browser received, so it includes the server hop and CLI buffering. Older runs have no replay and show the final output only.
- **Open batch in Lab** reloads the batch's lanes and runs (also via **Recent batches** in the sidebar). Replays open in lanes there too.

## 4. Caveats

- CLI models: start-up latency skews TTFT/TTFR, the harness may add its own system prompt, and usage counts against your plan. OpenCode sends each reply whole, so its streaming looks instant-at-the-end.
- Costs for API models use the prices in `src/models.ts`. Subscription runs show no dollar cost.
- The sidebar has a theme toggle and a providers menu showing what was detected.
- The API listens on loopback only. Don't expose it.

## 5. Common problems

| Symptom | Fix |
|---|---|
| No models listed | Add a key to `.env` and restart, or log in to a CLI. `PLAYGROUND_CLI=off` hides CLI models. |
| OpenCode refuses to run | It is blocked under managed config. Use another provider. |
| Run not saved | A notice shows the server's reason. Check `runs/` is writable. |
| 403 "cross-origin request" | Use `localhost`, `127.0.0.1` or `[::1]` in the address bar. |
