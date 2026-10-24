# Generative UI rendering benchmark — 2026-10-25

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
