# Generative UI rendering benchmark

Latest run: **2026-10-26/27**, API-billed, all 10 presets, 4 approaches (below). Smaller open-weight models through the Vercel AI Gateway follow in their own section. Earlier subscription-billed runs are kept as Appendix A (2026-10-25) and Appendix B (2026-10-24). Raw runs are in `runs/` (batch `bench-2026-10-26`; the 2026-10-25 runs are archived in `plans/runs-2026-10-25.tgz`). Tables regenerate with `node scripts/bench-stats.mts bench-2026-10-26`; the matrix is `node scripts/bench.mts bench-2026-10-26 --api --repeats 1 --concurrency 1 --delay-ms 1000`. The current `--api` matrix also contains four OpenCode Go configs that are no longer reported; filter with `--provider anthropic` / `--provider openai`.

## Setup (2026-10-26/27)

- **360 runs planned, 1 per cell**: 9 model x effort configs x 4 approaches (json-render, flat-strict, html, markup) x 10 presets (login, dashboard, pricing, settings, comparison, portfolio, table, onboarding, profile, states). Run sequentially (concurrency 1, 1 s pause), so latencies are not inflated by our own queueing.
- Anthropic API: Haiku 5.5 (low, medium), Sonnet 5.5 (low, medium), Opus 5.5 (low). OpenAI API: GPT-6 Luna (low, medium, high), GPT-6.1 Sol (low).
- **328 runs kept.** `states` was trimmed to one run per model (it is the least informative preset), and one Luna run more than 3x its model/effort median time was dropped as an outlier.
- Valid = parser reported zero errors. Fidelity (required content present) is scored on login, dashboard and comparison; coverage (fixture values present in the raw output, not proof they were displayed) on dashboard, comparison, portfolio and table. Median fidelity was 100%; two valid Luna json-render runs on `comparison` scored 0%. HTML validity only checks for an HTML-like tag, a much weaker test than the catalog/schema validation of the other three.
- 3 runs hit OpenAI `server_is_overloaded` (503) mid-run (Sol); they were discarded and rerun. No quota stops occurred.
- n=1 per cell: per-model/approach comparisons rest on 9-28 runs. Small gaps are not reliable; no cell was repeated, so there is no measure of run-to-run variance.

## Caveats

- Not a quality study: no human ratings. Validity is parser-level only.
- Concurrency 1 means no shared-limit queueing, but provider load still varies over the ~4 h run.
- Tokens/s = output tokens / total time, including thinking.
- Open-weight models are benchmarked separately through the Vercel AI Gateway (batch `gateway-2026-10-27`, section below).

## Headline findings

1. **API Claude and OpenAI models are nearly always valid.** Anthropic 99% (n=183), OpenAI 98% (n=145). 5 invalid runs of 328 (7 errors).
2. **html is the only approach that is 100% valid for every model** (82/82; a weaker check, see Setup); flat-strict and json-render 99%, markup 96%.
3. **markup is the fastest and most compact, and the least reliable.** 8.1 s median total and 1.0k output tokens, vs 13.6-15.5 s and 1.8-2.2k for the others. It is fastest for every model. Its failures: `Table` given a string (Luna 2, Haiku 1).
4. **Hardest preset: `comparison`** (19.3 s median, 92% valid; markup only 67%). Easiest: `login` (5.6 s), `profile` (8.0 s). Total time tracks output size.
5. **Effort buys latency, little else.** Haiku low -> medium: 6.0 s -> 11.3 s, valid 94% -> 100%. Sonnet low -> medium: 9.9 s -> 11.4 s, 100% both. Luna low/medium/high: 10.4/15.4/19.1 s, 1.1k/1.5k/2.0k tokens, valid 94/97/100%. Validity gains are small and rest on few failures.
6. **Speed ranking (median total):** Haiku 8.1 s (245 tok/s), Sonnet 10.3 s, Opus 14.9 s, Luna 15.3 s, Sol 16.5 s (70 tok/s, but terse, 1.2k tokens). Sonnet has the best TTFR (1.5 s), Opus 1.8 s. Haiku medium shows 6.9 s TTFR because it thinks (857 reasoning tokens median); Haiku low is 1.5 s.
7. **Sol is much faster than in the subscription runs** (16.5 s vs 26.3 s; TTFR 2.8 s vs 8.5 s), possibly API vs CLI overhead (not tested).
8. **Opus showed no validity advantage**: 100% valid like Sonnet/Sol but ~1.5x Sonnet's time (14.9 s vs 10.3 s) and 2x its cost per run.
9. **Cost (API, $5.11 for the original 360 runs; $4.81 for the 328 kept):** per run Luna $0.0008-0.0014, Haiku $0.0012-0.0017, Sol $0.018, Sonnet $0.025-0.027, Opus $0.053. A Luna run costs about 1/24 of a Sonnet run on average (1/30 at matched low effort) at similar validity but ~1.5x its time.

## Tables (328 runs; TTFR = time to first renderable UI, medians in seconds)

### By approach

| approach | n | valid % | TTFR s | total s | out tok | overall tok/s |
|---|---|---|---|---|---|---|
| flat-strict | 82 | 99 | 3.3 | 13.6 | 1753 | 138 |
| html | 82 | 100 | 2.6 | 14.1 | 2206 | 130 |
| json-render | 82 | 99 | 4.7 | 15.5 | 2219 | 138 |
| markup | 82 | 96 | 2.3 | 8.1 | 1019 | 124 |

### By provider

| provider | n | valid % | TTFR s | total s | tok/s |
|---|---|---|---|---|---|
| anthropic (api) | 183 | 99 | 1.8 | 10.3 | 185 |
| openai (api) | 145 | 98 | 5.5 | 15.3 | 91 |

### By model

| model | n | valid % | TTFR s | total s | tok/s | coverage % |
|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 73 | 97 | 4.3 | 8.1 | 245 | 99 |
| claude-sonnet-5-5 | 73 | 100 | 1.5 | 10.3 | 177 | 100 |
| claude-opus-5-5 | 37 | 100 | 1.8 | 14.9 | 129 | 99 |
| gpt-6-luna | 108 | 97 | 7.2 | 15.3 | 100 | 100 |
| gpt-6.1-sol | 37 | 100 | 2.8 | 16.5 | 70 | 99 |

### Model x effort

| model - effort | n | valid % | TTFR s | total s | tok/s | est. cost for 40 runs (40 x mean) |
|---|---|---|---|---|---|---|
| haiku - low | 36 | 94 | 1.5 | 6.0 | 245 | $0.050 |
| haiku - medium | 37 | 100 | 6.9 | 11.3 | 245 | $0.071 |
| sonnet - low | 37 | 100 | 1.5 | 9.9 | 176 | $0.995 |
| sonnet - medium | 36 | 100 | 1.6 | 11.4 | 177 | $1.089 |
| opus - low | 37 | 100 | 1.8 | 14.9 | 129 | $2.173 |
| luna - low | 36 | 94 | 3.8 | 10.4 | 105 | $0.033 |
| luna - medium | 36 | 97 | 8.0 | 15.4 | 105 | $0.043 |
| luna - high | 36 | 100 | 12.3 | 19.1 | 96 | $0.053 |
| sol - low | 37 | 100 | 2.8 | 16.5 | 70 | $0.724 |

### Model x approach (valid % / median total s)

| model | flat-strict | html | json-render | markup |
|---|---|---|---|---|
| haiku (n=18-19) | 100 / 9.6 | 100 / 7.3 | 95 / 13.1 | 94 / 5.2 |
| sonnet (n=18-19) | 100 / 12.9 | 100 / 12.7 | 100 / 11.3 | 100 / 7.2 |
| opus (n=9-10) | 100 / 14.9 | 100 / 18.6 | 100 / 20.3 | 100 / 10.2 |
| luna (n=26-28) | 96 / 15.8 | 100 / 19.8 | 100 / 16.0 | 93 / 9.7 |
| sol (n=9-10) | 100 / 16.5 | 100 / 26.7 | 100 / 18.8 | 100 / 11.4 |

### By preset

| preset | n | valid % | TTFR s | total s |
|---|---|---|---|---|
| comparison | 36 | 92 | 4.2 | 19.3 |
| portfolio | 36 | 100 | 3.7 | 17.3 |
| settings | 36 | 100 | 3.7 | 15.4 |
| dashboard | 36 | 100 | 3.2 | 14.8 |
| onboarding | 36 | 100 | 3.3 | 13.8 |
| pricing | 36 | 100 | 2.7 | 12.9 |
| table | 35 | 97 | 4.2 | 11.3 |
| profile | 36 | 97 | 2.5 | 8.0 |
| login | 36 | 100 | 1.9 | 5.6 |
| states | 5 | 100 | 2.5 | 10.1 |

markup x comparison is the weakest cell (67% valid, n=9); all other approach x preset cells are 89-100% (full table: run the stats script).

### Failures (5 invalid runs of 328, 7 errors)

- `Table.rows` string instead of array (markup 3, flat-strict 1) and `Stat` number-for-string (json-render 3), all Haiku or Luna.

## Recommendations

- **Default to html or json-render/flat-strict (99-100% valid); use markup when speed/tokens matter** and test `Table` coercion (a string where an array is expected is its top failure) as a possible repair.
- **Low effort by default.** Medium/high add 1.1-2x time; only Luna and Haiku showed a small validity benefit.
- Value picks: Haiku low (fastest, ~$0.001/run), Luna low (cheapest, ~10 s). Opus showed no validity advantage for its cost.
- Next: add human ratings (fidelity/coverage are saturated, and five presets have neither); define `requires`/fixtures for the other presets; rerun with n>=3 for cells that matter.

---

# Open-weight models via Vercel AI Gateway (2026-10-27)

Batch `gateway-2026-10-27`: smaller open-weight models through the Vercel AI Gateway, API-billed (`AI_GATEWAY_API_KEY`), each pinned to one host. Tables regenerate with `node scripts/bench-stats.mts gateway-2026-10-27`; the matrix is `node scripts/bench.mts gateway-2026-10-27 --gateway --concurrency 2`. Several such processes ran in parallel (per model or host), so up to ~14 requests overlapped; latencies include that load.

## Setup

- **584 runs kept**, 1 per cell, 4 approaches x 10 presets x each model's lowest and highest effort (`xhigh` and `max` skipped; models with low/medium/high ran low + high).
- Models (host): DeepSeek V4.1 Flash (deepseek), GLM-5.3 Flash (zai), Qwen3.8 Flash (alibaba), Qwen3.8 27B (deepinfra), MiniMax M3.1 Flash (minimax), Nemotron 3.5 Lightning (fireworks), Step 3.7 Flash (stepfun), Inkling Small (thinkingmachines).
- **Fast-host variants** of three models, on the gateway's fastest hosts by 1 h throughput: Qwen3.8 27B on cerebras, DeepSeek V4.1 Flash on togetherai, GLM-5.3 Flash on boundless. 58 runs in total (31 + 15 + 12); where a cell has a fast-host run, the original-host run was deleted, so the original hosts cover the remaining cells only (Qwen3.8 27B: 40, DeepSeek: 57, GLM: 59).
- Gateway output was capped at 32,768 tokens (`maxOutputTokens`); MiniMax's host default of 4,096 was used up by reasoning and produced empty output, and those runs were rerun after the fix.
- Removed: 22 runs that failed in transport (a gateway-wide burst of "Failed to process successful response", MiniMax 500s), 19 runs over 3x their model/effort median time and 30 s, MiMo V2.6 Flash (too slow to finish: ~99 s median), and `states` trimmed to one run per model. Cells emptied for models without a fast variant were rerun once.
- Five runs are leftovers from setup tests: Inkling medium (2) and max (1), MiniMax medium (1), Nemotron medium (1).
- The removals above were made from bench logs during the session; the retained run files cannot show them. Four kept runs exceed the outlier threshold as recomputed on the final data.
- Total cost: **$1.75 for 584 runs**.

## Headline findings

1. **The open-weight set is far less reliable than Claude/OpenAI**: 73% valid overall vs 98-99% for the API models. Of the original-host models only Qwen3.8 27B (98%) and DeepSeek V4.1 Flash (89%) are close.
2. **html is 100% valid for every open-weight model** (146/146). Structured formats break: flat-strict 72%, markup 71%, json-render 48%.
3. **json-render is the weak point.** Nemotron 6% (declares a root id and never adds it), MiniMax 32%, Qwen3.8 Flash 33% (intermittent near-empty replies at low effort), Step 44%, Inkling 47%. Top errors: `Stack.gap` outside its enum (25), a stray closing brace repaired (22), missing root element or undefined type (58 occurrences in 46 runs).
4. **flat-strict's `{key, value}` props format is the most common error** (163 occurrences, in 16 runs, all invalid).
5. **On their original hosts these models are mostly not faster than Claude/OpenAI.** Median total 18.7 s (n=526, excluding fast-host variants) vs 10.3 s (Anthropic) and 15.3 s (OpenAI). Inkling (4.9 s) is the exception. Likely contributors (not isolated): slow pinned hosts (40-100 tok/s for Qwen3.8 27B, GLM, Qwen3.8 Flash), hidden or verbose reasoning (Step 5.6k output tokens, 44.9 s median; Nemotron 7.3k, 6.5k of it reasoning).
6. **The same model was much faster on a faster host** (observed; the samples share no cells, and size/precision were not controlled):
   - Qwen3.8 27B: deepinfra 44.9 s, 98% valid -> cerebras **2.0 s**, 65% valid.
   - DeepSeek V4.1 Flash: deepseek 16.7 s, 89% -> togetherai **5.4 s**, 87%.
   - GLM-5.3 Flash: zai 20.9 s, 78% -> boundless **5.8 s**, 42%.
   Validity was similar only on togetherai; whether the other hosts serve lower precision is untested. Fast-host samples are small (12-31 runs).
7. **Inkling Small is the fastest original-host model** (4.9 s median) but 66% valid; at low effort it writes very little (371 tokens, 74% coverage).
8. **Effort helps a little, inconsistently**: Qwen3.8 Flash low -> medium 64% -> 81% valid (2x time); MiniMax low -> high 57% -> 69%. DeepSeek and Step got slightly worse at high.
9. **Hardest preset: `comparison`** (53% valid, json-render 14%), as for the API models.
10. **Cheap:** mean cost per run $0.0007-0.0076 by model (Step highest, GLM on boundless lowest; individual runs $0.0001-0.023), mostly near Haiku/Luna, though Step is ~9x Luna low. togetherai lists DeepSeek at 2x the maker price per token; observed mean spend was ~1.6x.

## Tables (medians except cost/run, which is a mean; TTFR = time to first renderable UI)

### By approach

| approach | n | valid % | TTFR s | total s | p90 s | out tok |
|---|---|---|---|---|---|---|
| flat-strict | 146 | 72 | 10.7 | 18.5 | 58.1 | 2793 |
| html | 146 | 100 | 7.3 | 21.9 | 57.5 | 3041 |
| json-render | 145 | 48 | 9.0 | 17.8 | 62.5 | 2699 |
| markup | 147 | 71 | 6.2 | 11.7 | 35.5 | 1405 |

### By model

| model (host) | n | valid % | TTFR s | total s | p90 s | out tok | reasoning tok | cost/run |
|---|---|---|---|---|---|---|---|---|
| qwen3.8-27b (deepinfra) | 40 | 98 | 9.4 | 44.9 | 94.0 | 1733 | 0 | $0.0040 |
| deepseek-v4.1-flash (deepseek) | 57 | 89 | 9.9 | 16.7 | 36.2 | 3353 | 1419 | $0.0026 |
| deepseek-v4.1-flash (togetherai) | 15 | 87 | 2.4 | 5.4 | 10.4 | 3009 | 763 | $0.0042 |
| glm-5.3-flash (zai) | 59 | 78 | 4.3 | 20.9 | 40.6 | 1502 | 18 | $0.0012 |
| qwen3.8-flash (alibaba) | 73 | 73 | 6.4 | 25.7 | 50.4 | 1656 | 254 | $0.0011 |
| step-3.7-flash (stepfun) | 73 | 73 | 38.2 | 44.9 | 101.5 | 5609 | 0 | $0.0076 |
| inkling-small (thinkingmachines) | 76 | 66 | 3.4 | 4.9 | 19.8 | 1040 | 0 | $0.0026 |
| nemotron-3.5-lightning (fireworks) | 74 | 65 | 14.3 | 16.2 | 32.7 | 7293 | 6463 | $0.0017 |
| qwen3.8-27b (cerebras) | 31 | 65 | 1.3 | 2.0 | 2.6 | 1825 | 456 | $0.0062 |
| minimax-m3.1-flash (minimax) | 74 | 64 | 8.4 | 14.4 | 34.6 | 2315 | 366 | $0.0019 |
| glm-5.3-flash (boundless) | 12 | 42 | 1.1 | 5.8 | 6.7 | 1630 | 0 | $0.0007 |

Reasoning tokens are 0 where the host does not report them (Step's long TTFR suggests hidden reasoning).

### Model x approach (valid % / median total s)

| model | flat-strict | html | json-render | markup |
|---|---|---|---|---|
| qwen3.8-27b | 100 / 60.1 | 100 / 60.6 | 83 / 54.4 | 100 / 24.2 |
| deepseek-v4.1-flash | 100 / 15.8 | 100 / 29.9 | 94 / 24.5 | 64 / 9.2 |
| deepseek-v4.1-flash (togetherai) | 100 / 5.2 | 100 / 6.2 | 50 / 10.0 | 80 / 3.3 |
| glm-5.3-flash | 71 / 22.2 | 100 / 25.0 | 71 / 24.3 | 69 / 13.1 |
| glm-5.3-flash (boundless) | 0 / 6.2 | 100 / 6.5 | 100 / 4.4 | 0 / 5.1 |
| qwen3.8-flash | 84 / 29.1 | 100 / 36.8 | 33 / 8.4 | 72 / 15.0 |
| step-3.7-flash | 83 / 49.0 | 100 / 46.8 | 44 / 73.5 | 63 / 37.4 |
| inkling-small | 33 / 4.2 | 100 / 6.4 | 47 / 6.9 | 79 / 4.2 |
| nemotron-3.5-lightning | 63 / 11.5 | 100 / 18.5 | 6 / 24.4 | 89 / 12.0 |
| minimax-m3.1-flash | 63 / 25.1 | 100 / 12.7 | 32 / 18.8 | 61 / 8.2 |
| qwen3.8-27b (cerebras) | 70 / 1.9 | 100 / 2.0 | 55 / 2.3 | 57 / 1.8 |

## Recommendations

- **Use html for open-weight models.** It is the only approach at 100%, though its validity check is far weaker; structured formats need repair/retry around them.
- **Pick the host, not just the model.** DeepSeek V4.1 Flash on togetherai looked like the best balance here (n=15) (5.4 s, 87% valid, ~$0.004/run). Qwen3.8 27B on deepinfra is the most reliable (98%) but slow; on cerebras it is ~20x faster and less reliable.
- Skip Nemotron 3.5 Lightning for json-render, and Step 3.7 Flash where latency matters.
- Next: n>=3 for the fast-host cells, a json-render repair pass for the common errors (enum values, stray braces, missing root), and checking whether fast hosts serve quantized weights.

---

# Appendix A: 2026-10-25 run (subscription-billed, 4 approaches)

Two runs: **2026-10-25** (latest, 4 approaches) and the **2026-10-24** baseline kept as an appendix. All runs are subscription-billed (Claude Code CLI, Codex CLI). Raw runs of the latest batch are in `runs/` (batch `bench-2026-10-25`); the baseline runs were archived outside the repo. Tables regenerate with `node scripts/bench-stats.mts bench-2026-10-25`.

## Setup (2026-10-25)

- Models: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (Claude Code); GPT-6 Luna, GPT-6.1 Sol (Codex).
- Efforts: low and medium for Claude and Codex (`high` skipped, as there are three levels).
- Approaches: json-render, flat-strict, html, **markup** (new). Prompts: `login`, `dashboard` (sales fixture), `comparison` (products fixture).
- One run per config (model x effort x approach x prompt), 3 concurrent. 120 Claude + Codex runs.
- "valid" = parser reported zero errors. `fidelity` (required content present) was 100% for every run, so it did not discriminate; `coverage` (fixture data shown) is in the tables.

## Caveats

- Claude/Codex (120 runs) are the solid data: 6 runs per model x approach cell. Treat differences under ~20% as noise.
- **Codex now streams** (changed since the baseline), so its TTFR is meaningful and no longer equals total time.
- Concurrency 3 and shared subscription limits inflate p90.
- Tokens/s = output tokens / total time, so it includes thinking and queueing.
- Not a quality study: no human ratings.

## Headline findings

1. **markup (new) is the fastest and most compact, with one weakness.** Across Claude + Codex it has the lowest median total time (9.7 s vs 14.6-15.7 s for the others) and about half the output tokens (1.1k vs 2.0-2.4k). It is also the only approach with failures there: 93% valid vs 100%.
2. **markup's failures are syntax, not logic.** Both Luna failures were `Table` given a string where an array is required (on `comparison`). Its hand-written syntax is easier for models to get wrong than JSON.
3. **flat-strict is fixed.** The baseline's 9 `Checkbox.checked` string-vs-boolean errors (80% valid) are gone: 100% valid on Claude/Codex, 40% -> 100% on `login`.
4. **html got far cheaper.** Claude + Codex median total fell from 33.3 s to 14.6 s and output tokens from 4.8k to 2.4k (low + medium efforts only, baseline vs now), after the body-only HTML shell. It remains 100% valid. HTML is no longer the slow outlier: json-render 14.9 s, flat-strict 15.7 s, html 14.6 s.
5. **json-render is now 100% valid** on Claude/Codex (baseline: 90% at low/medium, with the Codex malformed-patch failures). Total time 14.9 s.
6. **Codex streaming works.** Luna TTFR 12.2 s -> 3.6 s, Sol 29.7 s -> 8.5 s (baseline low + medium efforts) (baseline TTFR equalled total). Totals are similar (Luna 10.6 s, Sol 26.3 s).
7. **Fastest models:** Haiku has the best throughput (227 tok/s) and Luna the lowest total (10.6 s), Sonnet the best TTFR (2.3 s). Opus (22.6 s) and Sol (26.3 s) are slowest with no validity advantage; Sol writes about 60 tok/s.
8. **Effort buys latency, not validity** (again): medium vs low is 15.0 s vs 12.0 s total and 5.9 s vs 2.8 s TTFR, validity 98% for both.
9. **Prompt complexity dominates:** comparison is the slowest prompt and where markup breaks.

## Tables (120 Claude + Codex runs; TTFR = time to first renderable UI, median seconds unless noted)

### By approach (Claude + Codex, n=30 each)

flat-strict 100% / 15.7 s / 1968 tok; html 100% / 14.6 s / 2392; json-render 100% / 14.9 s / 2108; markup 93% / 9.7 s / 1140.

### By provider

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % |
|---|---|---|---|---|---|---|---|---|
| claude-code | 72 | 100 | 2.7 | 13.8 | 29.9 | 2393 | 156 | 97 |
| codex | 48 | 96 | 4.5 | 12.8 | 36.5 | 1217 | 71 | 97 |

### By model

| group | n | valid % | TTFR s | total s (med) | total s (p90) | out tok | tok/s | coverage % |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 24 | 100 | 4.5 | 11.2 | 23.7 | 2656 | 227 | 94 |
| claude-opus-5-5 | 24 | 100 | 4.3 | 22.6 | 44.4 | 2871 | 121 | 98 |
| claude-sonnet-5-5 | 24 | 100 | 2.3 | 12.0 | 21.3 | 2093 | 165 | 99 |
| gpt-6-luna | 24 | 92 | 3.6 | 10.6 | 17.7 | 1184 | 111 | 95 |
| gpt-6.1-sol | 24 | 100 | 8.5 | 26.3 | 39.4 | 1446 | 60 | 99 |

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

### Failures (2 invalid of 120)

- markup (2): `Table` string-for-array (Luna, both on `comparison`). No Claude model failed.

## Recommendations

- Prefer **markup** for speed and tokens where occasional syntax failure is acceptable; add a repair/validation retry or looser attribute parsing, and make `Table` accept the shape models write. Prefer **json-render** or **html** where reliability matters (100% valid on Claude/Codex).
- Use **low effort** by default: medium costs time (up to +60% on Opus) with no validity gain.
- Collect human ratings on a subset; `fidelity` is saturated and cannot rank quality.
- Raise n to 2-3 per cell for the comparisons that matter (approach x model).

---

# Appendix B: 2026-10-24 baseline

131 runs, all subscription-billed (Claude Code CLI, Codex CLI). History was cleared first; raw runs are in `runs/` (batch `bench-2026-10-24`) and visible in the app's History.

## Setup

- Models: Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (Claude Code); GPT-6 Luna, GPT-6.1 Sol (Codex).
- Efforts: low / medium / high. Approaches: json-render, flat-strict, html.
- Prompts: `login` (simple), `dashboard` (sales fixture), `comparison` (products fixture).
- Planned 135 (5×3×3×3); stopped at 131 (Sol short by 4, its high-effort cells have n=6–7) after the request to cap runs.
- Excluded: API-key models.
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

