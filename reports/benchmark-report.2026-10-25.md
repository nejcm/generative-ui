# Generative UI rendering benchmark

Two runs: **2026-10-25** (latest, 4 approaches) and the **2026-10-24** baseline kept as an appendix. All runs are subscription-billed (Claude Code CLI, Codex CLI, OpenCode Go CLI). Raw runs of the latest batch are in `runs/` (batch `bench-2026-10-25`); the baseline runs were archived outside the repo. Tables regenerate with `node scripts/bench-stats.mts bench-2026-10-25`.

## Setup (2026-10-25)

- Models: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (Claude Code); GPT-6 Luna, GPT-6.1 Sol (Codex); six OpenCode Go models (DeepSeek V4.1 Flash, GLM-5.3 Flash, Kimi K3, MiniMax M3, Qwen3.8 Max / Flash).
- Efforts: low and medium for Claude and Codex (`high` skipped, as there are three levels). OpenCode Go models ran their own levels (DeepSeek/GLM high + max, Qwen low + medium, Kimi max, MiniMax none).
- Approaches: json-render, flat-strict, html, **markup** (new). Prompts: `login`, `dashboard` (sales fixture), `comparison` (products fixture).
- One run per config (model x effort x approach x prompt), 3 concurrent. Planned 240; **150 saved**.
- **OpenCode Go is only partial.** The Go usage limit was reached mid-run: 90 of its 120 runs failed instantly with `Go usage limit exceeded` and were discarded (they are not model results). 30 OpenCode runs remain, 1-3 per model/approach cell. A follow-up attempt with five free `opencode/` models (now in `src/models.ts`) hit `Free usage limit reached` straight away, so no free-model data exists. Re-run after the quota resets: `node scripts/bench.mts bench-2026-10-25` fills only the missing cells.
- "valid" = parser reported zero errors. `fidelity` (required content present) was 100% for every run, so it did not discriminate; `coverage` (fixture data shown) is in the tables.

## Caveats

- Claude/Codex (120 runs) are the solid data: 6 runs per model x approach cell. Treat differences under ~20% as noise.
- **OpenCode does not stream**: its CLI emits each reply whole (see `plans/opencode-streaming.md`), so TTFT = TTFR = total time and no token usage is reported (no output-token or tok/s figures). Compare OpenCode on total time only.
- **Codex now streams** (changed since the baseline), so its TTFR is meaningful and no longer equals total time.
- Concurrency 3 and shared subscription limits inflate p90.
- Tokens/s = output tokens / total time, so it includes thinking and queueing.
- Not a quality study: no human ratings.

## Headline findings

1. **markup (new) is the fastest and most compact, with one weakness.** Across Claude + Codex it has the lowest median total time (9.7 s vs 14.6-15.7 s for the others) and about half the output tokens (1.1k vs 2.0-2.4k). It is also the only approach with failures there: 93% valid vs 100%.
2. **markup's failures are syntax, not logic.** Both Luna failures were `Table` given a string where an array is required (on `comparison`). OpenCode models add unquoted attributes (`expected = after Gorgeous`, `invalid attribute name`, `expected quoted value for checked`). Its hand-written syntax is easier for models to get wrong than JSON.
3. **flat-strict is fixed.** The baseline's 9 `Checkbox.checked` string-vs-boolean errors (80% valid) are gone: 100% valid on Claude/Codex, 40% -> 100% on `login`.
4. **html got far cheaper.** Claude + Codex median total fell from 33.3 s to 14.6 s and output tokens from 4.8k to 2.4k (low + medium efforts only, baseline vs now), after the body-only HTML shell. It remains 100% valid. HTML is no longer the slow outlier: json-render 14.9 s, flat-strict 15.7 s, html 14.6 s.
5. **json-render is now 100% valid** on Claude/Codex (baseline: 90% at low/medium, with the Codex malformed-patch failures). Total time 14.9 s.
6. **Codex streaming works.** Luna TTFR 12.2 s -> 3.6 s, Sol 29.7 s -> 8.5 s (baseline low + medium efforts) (baseline TTFR equalled total). Totals are similar (Luna 10.6 s, Sol 26.3 s).
7. **Fastest models:** Haiku has the best throughput (227 tok/s) and Luna the lowest total (10.6 s), Sonnet the best TTFR (2.3 s). Opus (22.6 s) and Sol (26.3 s) are slowest with no validity advantage; Sol writes about 60 tok/s.
8. **Effort buys latency, not validity** (again): medium vs low is 15.0 s vs 12.0 s total and 5.9 s vs 2.8 s TTFR, validity 98% for both.
9. **Prompt complexity dominates:** login 6.6 s, dashboard 18.4 s, comparison 24.9 s median total. `comparison` is also where markup breaks (79% valid).
10. **OpenCode Go (partial, n=30):** 87% valid, median total 27 s but with a very long tail (p90 106 s; Kimi K3 62-84 s, one GLM run 193 s). Qwen3.8 Flash was the weakest (60% valid, n=5). Too few runs per cell for model rankings.

## Tables (150 runs; TTFR = time to first renderable UI, median seconds unless noted)

### By approach

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % |
|---|---|---|---|---|---|---|---|---|
| flat-strict | 35 | 97 | 4.5 | 21.1 | 50.5 | 1968 | 135 | 93 |
| html | 38 | 100 | 4.4 | 16.4 | 44.4 | 2392 | 132 | 99 |
| json-render | 37 | 97 | 5.4 | 18.1 | 46.7 | 2108 | 132 | 99 |
| markup | 40 | 90 | 4.3 | 10.4 | 27.4 | 1140 | 96 | 98 |

Claude + Codex only (n=30 each): flat-strict 100% / 15.7 s / 1968 tok; html 100% / 14.6 s / 2392; json-render 100% / 14.9 s / 2108; markup 93% / 9.7 s / 1140.

### By provider

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % |
|---|---|---|---|---|---|---|---|---|
| claude-code | 72 | 100 | 2.7 | 13.8 | 29.9 | 2393 | 156 | 97 |
| codex | 48 | 96 | 4.5 | 12.8 | 36.5 | 1217 | 71 | 97 |
| opencode-go (partial) | 30 | 87 | 26.9 | 27.0 | 105.7 | n/a | n/a | 95 |

### By model

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 24 | 100 | 4.5 | 11.2 | 23.7 | 2656 | 227 | 94 |
| claude-opus-5-5 | 24 | 100 | 4.3 | 22.6 | 44.4 | 2871 | 121 | 98 |
| claude-sonnet-5-5 | 24 | 100 | 2.3 | 12.0 | 21.3 | 2093 | 165 | 99 |
| gpt-6-luna | 24 | 92 | 3.6 | 10.6 | 17.7 | 1184 | 111 | 95 |
| gpt-6.1-sol | 24 | 100 | 8.5 | 26.3 | 39.4 | 1446 | 60 | 99 |
| deepseek-v4.1-flash | 6 | 100 | 36.0 | 36.0 | 103.8 | n/a | n/a | 98 |
| glm-5.3-flash | 9 | 89 | 26.4 | 26.5 | 192.8 | n/a | n/a | 93 |
| kimi-k3 | 2 | 100 | 73.1 | 73.2 | 84.2 | n/a | n/a | 99 |
| minimax-m3 | 4 | 75 | 14.3 | 14.4 | 23.1 | n/a | n/a | 89 |
| qwen3.8-flash | 5 | 60 | 29.2 | 29.3 | 50.7 | n/a | n/a | 90 |
| qwen3.8-max | 4 | 100 | 33.8 | 33.8 | 168.6 | n/a | n/a | 96 |

### By prompt

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s |
|---|---|---|---|---|---|---|---|
| comparison | 52 | 94 | 7.6 | 24.9 | 84.2 | 3025 | 135 |
| dashboard | 48 | 96 | 6.9 | 18.4 | 39.4 | 2183 | 133 |
| login | 50 | 98 | 3.3 | 6.6 | 14.6 | 499 | 77 |

### Claude / Codex: effort within model

| group | n | valid % | TTFR s | total s (med) | out tok | tok/s |
|---|---|---|---|---|---|---|
| claude-haiku-5-5 - low | 12 | 100 | 3.3 | 9.9 | 2522 | 227 |
| claude-haiku-5-5 - medium | 12 | 100 | 6.1 | 12.5 | 2888 | 226 |
| claude-sonnet-5-5 - low | 12 | 100 | 2.3 | 11.4 | 1954 | 162 |
| claude-sonnet-5-5 - medium | 12 | 100 | 2.2 | 13.0 | 2272 | 165 |
| claude-opus-5-5 - low | 12 | 100 | 2.7 | 19.0 | 2319 | 121 |
| claude-opus-5-5 - medium | 12 | 100 | 6.9 | 30.3 | 3781 | 123 |
| gpt-6-luna - low | 12 | 92 | 2.9 | 9.4 | 1052 | 111 |
| gpt-6-luna - medium | 12 | 92 | 4.1 | 10.6 | 1223 | 98 |
| gpt-6.1-sol - low | 12 | 100 | 4.7 | 23.6 | 1571 | 69 |
| gpt-6.1-sol - medium | 12 | 100 | 9.6 | 26.4 | 1446 | 55 |

Opus pays the most for medium (+60% time, +63% tokens); Sonnet and Haiku barely change.

### Model x approach (Claude and Codex)

| group | n | valid % | TTFR s | total s (med) | out tok | tok/s |
|---|---|---|---|---|---|---|
| claude-haiku-5-5 - flat-strict | 6 | 100 | 13.0 | 20.7 | 5100 | 246 |
| claude-haiku-5-5 - html | 6 | 100 | 5.2 | 12.6 | 3140 | 249 |
| claude-haiku-5-5 - json-render | 6 | 100 | 3.5 | 9.2 | 1992 | 209 |
| claude-haiku-5-5 - markup | 6 | 100 | 2.2 | 6.0 | 1175 | 196 |
| claude-opus-5-5 - flat-strict | 6 | 100 | 4.3 | 24.5 | 3320 | 131 |
| claude-opus-5-5 - html | 6 | 100 | 4.0 | 25.2 | 3220 | 128 |
| claude-opus-5-5 - json-render | 6 | 100 | 5.0 | 27.2 | 3535 | 129 |
| claude-opus-5-5 - markup | 6 | 100 | 3.8 | 15.7 | 1778 | 113 |
| claude-sonnet-5-5 - flat-strict | 6 | 100 | 2.4 | 13.2 | 2384 | 180 |
| claude-sonnet-5-5 - html | 6 | 100 | 2.0 | 15.9 | 2803 | 161 |
| claude-sonnet-5-5 - json-render | 6 | 100 | 2.6 | 14.5 | 2470 | 172 |
| claude-sonnet-5-5 - markup | 6 | 100 | 2.0 | 8.9 | 1390 | 156 |
| gpt-6-luna - flat-strict | 6 | 100 | 3.9 | 11.9 | 1336 | 112 |
| gpt-6-luna - html | 6 | 100 | 2.4 | 10.8 | 1496 | 99 |
| gpt-6-luna - json-render | 6 | 100 | 3.8 | 12.7 | 1592 | 119 |
| gpt-6-luna - markup | 6 | 67 | 2.8 | 7.1 | 608 | 78 |
| gpt-6.1-sol - flat-strict | 6 | 100 | 8.2 | 27.2 | 1802 | 66 |
| gpt-6.1-sol - html | 6 | 100 | 8.0 | 29.3 | 2277 | 71 |
| gpt-6.1-sol - json-render | 6 | 100 | 8.8 | 30.3 | 2109 | 64 |
| gpt-6.1-sol - markup | 6 | 100 | 8.0 | 18.6 | 1140 | 51 |

markup is the fastest approach for every model. Haiku flat-strict is the outlier (5.1k tokens, 13 s TTFR).

### Approach x prompt

| group | n | valid % | TTFR s | total s (med) | out tok |
|---|---|---|---|---|---|
| flat-strict - comparison | 12 | 100 | 5.4 | 26.8 | 4071 |
| flat-strict - dashboard | 12 | 92 | 8.1 | 21.8 | 2384 |
| flat-strict - login | 11 | 100 | 4.0 | 6.6 | 774 |
| html - comparison | 13 | 100 | 7.4 | 24.1 | 3083 |
| html - dashboard | 12 | 100 | 5.6 | 18.1 | 2888 |
| html - login | 13 | 100 | 2.8 | 7.6 | 824 |
| json-render - comparison | 13 | 100 | 9.2 | 30.1 | 3582 |
| json-render - dashboard | 12 | 92 | 8.0 | 21.7 | 2367 |
| json-render - login | 12 | 100 | 3.3 | 7.0 | 798 |
| markup - comparison | 14 | 79 | 8.3 | 20.1 | 1882 |
| markup - dashboard | 12 | 100 | 5.9 | 10.0 | 1198 |
| markup - login | 14 | 93 | 3.2 | 4.8 | 241 |

### Failures (6 invalid of 150)

- markup (4): `Table` string-for-array x2 (Luna), `invalid attribute name` (MiniMax, 11 errors in total, mostly unquoted attributes), `expected quoted value for checked` (GLM).
- flat-strict (1): dropped invalid optional prop `gap: "xs"` (Qwen3.8 Flash).
- json-render (1): `Stat` prop `null` where a string is required (Qwen3.8 Flash).
- No Claude model failed. Claude + Codex total: 2 invalid of 120 (both Luna + markup).

## Recommendations

- Prefer **markup** for speed and tokens where occasional syntax failure is acceptable; add a repair/validation retry or looser attribute parsing, and make `Table` accept the shape models write. Prefer **json-render** or **html** where reliability matters (100% valid on Claude/Codex).
- Use **low effort** by default: medium costs time (up to +60% on Opus) with no validity gain.
- Re-run OpenCode Go after the quota resets, and ideally with streaming and usage reporting implemented first (`plans/opencode-streaming.md`), so TTFR and tokens/s exist.
- Collect human ratings on a subset; `fidelity` is saturated and cannot rank quality.
- Raise n to 2-3 per cell for the comparisons that matter (approach x model).

---

# Appendix: previous run (2026-10-24 baseline)

131 runs, all subscription-billed (Claude Code CLI, Codex CLI). History was cleared first; raw runs are in `runs/` (batch `bench-2026-10-24`) and visible in the app's History.

## Setup

- Models: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (Claude Code); GPT-6 Luna, GPT-6.1 Sol (Codex).
- Efforts: low / medium / high. Approaches: json-render, flat-strict, html.
- Prompts: `login` (simple), `dashboard` (sales fixture), `comparison` (products fixture).
- Planned 135 (5×3×3×3); stopped at 131 (Sol short by 4, its high-effort cells have n=6–7) after the request to cap runs.
- Excluded: OpenCode Go models (may bill credits past quota), API-key models.
- Run 3 at a time, one run per cell, so every cell is n≈1–3 per prompt. Treat differences under ~20% as noise.
- "valid" = parser reported zero errors. It does not judge visual quality or fidelity to the prompt.

## Caveats

- **Codex does not stream**: for GPT models TTFT ≈ total time (output arrives at once), so their TTFT/TTFR are not comparable to Claude's. Compare their total time.
- Concurrency 3 and shared subscription rate limits inflate latency tails (p90).
- Tokens/s = output tokens ÷ total time, so it includes thinking time and queueing.
- Not a quality study: no human ratings were collected.

## Headline findings

1. **html is the most reliable (100% valid) but the slowest and most verbose**: median 38.9 s, 6.4k output tokens, vs 15.2 s / 2.1k for json-render and 16.8 s / 2.1k for flat-strict. HTML costs ~2.5× the time and ~3× the tokens of the structured approaches.
2. **json-render is the best speed/validity trade-off**: 93% valid, fastest median total (15.2 s). All 3 failures are Codex models on `comparison`: Luna (1 `List` item typed as object) and Sol (2 runs with malformed JSON-patch lines → missing child elements). Claude models: 27/27 valid.
3. **flat-strict is the least valid (80%)** and its failures are systematic: 9 identical `Checkbox.checked` string-vs-boolean errors, all on the `login` prompt (40% valid there; 100% on dashboard/comparison). That is a schema/catalog issue, not model noise — a fix to the Checkbox prop schema or prompt would lift it to ~100%.
4. **Effort mainly buys latency, not validity**: high vs low median total 36.0 s vs 20.4 s, output tokens 5.6k vs 2.3k, validity 90% vs 93% (no benefit). TTFT grows from 4.1 s (low) to 15.9 s (high).
5. **Fastest throughput: Haiku (255 tok/s)**, then Sonnet (176), Opus/Luna (129), Sol (65). Sol is the slowest by a wide margin (median 31 s total, 84 s on html).
6. **Sonnet has the best time-to-first-token (1.7 s median)** and a good total (21 s); Opus is slower overall (35 s) with no validity advantage.
7. **GPT-6 Luna has the lowest median total time (13.3 s)** and 1.9k output tokens — it writes the least — at 93% valid.
8. Prompt complexity dominates: login 10 s vs dashboard 30 s vs comparison 32 s median total.

## Tables

Times in seconds (median unless noted); TTFT = time to first token, TTFR = time to first renderable UI.

### By approach

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| flat-strict | 44 | 80 | 8.5 | 8.6 | 16.8 | 35.8 | 2143 | 134 |
| html | 43 | 100 | 19.9 | 20.1 | 38.9 | 113.0 | 6441 | 162 |
| json-render | 44 | 93 | 8.6 | 8.6 | 15.2 | 45.0 | 2149 | 134 |

### By model

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 27 | 93 | 13.7 | 14.1 | 24.9 | 104.6 | 6557 | 255 |
| claude-opus-5-5 | 27 | 89 | 4.1 | 5.0 | 35.3 | 75.6 | 4518 | 129 |
| claude-sonnet-5-5 | 27 | 89 | 1.7 | 2.5 | 21.3 | 40.8 | 3934 | 176 |
| gpt-6-luna | 27 | 93 | 12.8 | 12.8 | 13.3 | 38.9 | 1862 | 129 |
| gpt-6.1-sol | 23 | 91 | 31.2 | 31.2 | 31.4 | 95.9 | 2288 | 65 |

### By effort

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| high | 42 | 90 | 15.9 | 15.9 | 36.0 | 108.3 | 5553 | 137 |
| low | 45 | 93 | 4.1 | 4.7 | 20.4 | 34.3 | 2332 | 134 |
| medium | 44 | 89 | 6.9 | 7.7 | 21.2 | 56.2 | 2658 | 138 |

### By prompt

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| comparison | 41 | 93 | 16.4 | 16.5 | 32.0 | 84.1 | 5287 | 154 |
| dashboard | 45 | 100 | 13.0 | 13.6 | 29.6 | 103.4 | 4466 | 137 |
| login | 45 | 80 | 4.0 | 4.3 | 10.4 | 40.2 | 1088 | 121 |

### Model × approach

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 · flat-strict | 9 | 78 | 13.8 | 14.2 | 20.3 | 32.7 | 5251 | 255 |
| claude-haiku-5-5 · html | 9 | 100 | 19.9 | 20.1 | 48.6 | 144.7 | 12836 | 265 |
| claude-haiku-5-5 · json-render | 9 | 100 | 2.7 | 3.3 | 8.8 | 46.2 | 1950 | 237 |
| claude-opus-5-5 · flat-strict | 9 | 67 | 4.1 | 5.0 | 29.6 | 56.2 | 3970 | 134 |
| claude-opus-5-5 · html | 9 | 100 | 5.9 | 6.2 | 55.8 | 141.4 | 7217 | 128 |
| claude-opus-5-5 · json-render | 9 | 100 | 4.1 | 4.9 | 31.6 | 60.7 | 4130 | 131 |
| claude-sonnet-5-5 · flat-strict | 9 | 67 | 1.5 | 2.3 | 14.0 | 40.8 | 2456 | 176 |
| claude-sonnet-5-5 · html | 9 | 100 | 2.7 | 3.1 | 34.1 | 108.3 | 6298 | 177 |
| claude-sonnet-5-5 · json-render | 9 | 100 | 1.6 | 2.5 | 13.0 | 36.2 | 2313 | 170 |
| gpt-6-luna · flat-strict | 9 | 89 | 8.9 | 8.9 | 9.1 | 16.8 | 1183 | 126 |
| gpt-6-luna · html | 9 | 100 | 21.0 | 21.0 | 21.2 | 48.2 | 3528 | 154 |
| gpt-6-luna · json-render | 9 | 89 | 12.1 | 12.1 | 12.3 | 26.4 | 1495 | 121 |
| gpt-6.1-sol · flat-strict | 8 | 100 | 21.9 | 21.9 | 22.2 | 45.0 | 1600 | 69 |
| gpt-6.1-sol · html | 7 | 100 | 83.9 | 83.9 | 84.1 | 149.6 | 5287 | 65 |
| gpt-6.1-sol · json-render | 8 | 75 | 30.2 | 30.2 | 30.4 | 78.4 | 2149 | 59 |

### Model × effort

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 · high | 9 | 89 | 26.4 | 26.6 | 33.8 | 144.7 | 8425 | 257 |
| claude-haiku-5-5 · low | 9 | 100 | 2.7 | 3.3 | 20.1 | 32.0 | 5103 | 253 |
| claude-haiku-5-5 · medium | 9 | 89 | 13.7 | 14.1 | 20.3 | 123.8 | 5034 | 255 |
| claude-opus-5-5 · high | 9 | 89 | 9.8 | 10.8 | 55.8 | 141.4 | 7217 | 128 |
| claude-opus-5-5 · low | 9 | 89 | 2.3 | 2.8 | 28.0 | 36.2 | 3746 | 126 |
| claude-opus-5-5 · medium | 9 | 89 | 6.3 | 7.1 | 45.0 | 75.6 | 5974 | 133 |
| claude-sonnet-5-5 · high | 9 | 89 | 12.8 | 13.6 | 36.2 | 108.3 | 6324 | 174 |
| claude-sonnet-5-5 · low | 9 | 89 | 1.7 | 2.3 | 20.4 | 33.3 | 3717 | 180 |
| claude-sonnet-5-5 · medium | 9 | 89 | 1.6 | 2.4 | 19.4 | 34.7 | 3660 | 179 |
| gpt-6-luna · high | 9 | 89 | 16.4 | 16.5 | 16.7 | 48.2 | 2002 | 128 |
| gpt-6-luna · low | 9 | 100 | 11.9 | 11.9 | 12.2 | 27.3 | 1421 | 131 |
| gpt-6-luna · medium | 9 | 89 | 12.3 | 12.3 | 12.6 | 45.0 | 1593 | 130 |
| gpt-6.1-sol · high | 6 | 100 | 46.0 | 46.0 | 46.2 | 149.6 | 2873 | 57 |
| gpt-6.1-sol · low | 9 | 89 | 27.2 | 27.2 | 27.4 | 95.9 | 1792 | 65 |
| gpt-6.1-sol · medium | 8 | 88 | 33.1 | 33.1 | 33.3 | 113.0 | 2423 | 67 |

### Approach × prompt

| group | n | valid % | TTFT s (med) | TTFR s (med) | total s (med) | total s (p90) | out tok (med) | tok/s (med) |
|---|---|---|---|---|---|---|---|---|
| flat-strict · comparison | 14 | 100 | 15.2 | 15.6 | 31.6 | 55.8 | 4306 | 144 |
| flat-strict · dashboard | 15 | 100 | 12.7 | 12.7 | 21.5 | 35.8 | 2995 | 134 |
| flat-strict · login | 15 | 40 | 3.7 | 4.3 | 6.1 | 10.8 | 763 | 105 |
| html · comparison | 13 | 100 | 21.0 | 21.0 | 38.9 | 141.4 | 6441 | 166 |
| html · dashboard | 15 | 100 | 27.0 | 27.0 | 52.4 | 113.0 | 7766 | 162 |
| html · login | 15 | 100 | 9.3 | 9.5 | 21.3 | 48.6 | 3436 | 129 |
| json-render · comparison | 14 | 79 | 14.1 | 14.4 | 27.7 | 46.2 | 4231 | 132 |
| json-render · dashboard | 15 | 100 | 10.2 | 11.2 | 24.1 | 45.7 | 2558 | 137 |
| json-render · login | 15 | 100 | 2.7 | 3.4 | 6.4 | 10.7 | 741 | 114 |

### Top errors

- 9× flat-strict: Checkbox props: ✖ Invalid input: expected boolean, received string
  → at checked
- 1× json-render: List props: ✖ Invalid input: expected string, received object
  → at items[0]
✖ Invalid in
- 1× json-render: not a JSON patch: {"op":"add","path":"/elements/advice","value":{"type":"Text","props":{"t
- 1× json-render: missing child "advice"
- 1× json-render: not a JSON patch: {"op":"add","path":"/elements/recommendation","value":{"type":"Heading",
- 1× json-render: not a JSON patch: {"op":"add","path":"/elements/tradeoff","value":{"type":"Text","props":{
- 1× json-render: missing child "recommendation"
- 1× json-render: missing child "tradeoff"

