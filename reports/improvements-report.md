# Generative UI: what to improve — 2026-10-25

Based on the 131 benchmark runs in `runs/` (see [benchmark-report.md](benchmark-report.md)), the approach code, [plans/research.md](../plans/research.md) and a short external check. Each claim says how it was found: **[runs]** means a script over `runs/*.json`, **[code]** means a file in this repo, **[ext]** means an external source (listed at the end), and **[inference]** means reasoning I have not measured.

## TL;DR, ranked by impact ÷ effort

| # | Change | Gain | Effort |
|---|---|---|---|
| 1 | Drop invalid *optional* props instead of rejecting the whole element | flat-strict 80% → ~100% valid on this set | XS |
| 2 | Remove `$bindState` hints from the flat-strict prompt (B has no state) | Removes the cause of all 9 B errors | XS |
| 3 | Default effort to `low`; treat `high` as opt-in | Up to −70 s TTFT at no validity cost | XS |
| 4 | Give HTML (C) a built-in stylesheet and chart helper in the iframe | ~40–70% fewer output tokens for C | S |
| 5 | Stream Codex through `codex app-server` (`item/agentMessage/delta`) | GPT lanes get real TTFR instead of "all at the end" | S |
| 6 | Turn on prompt caching for API runs (Anthropic `cacheControl`) | Lower TTFT and cost on the ~8.7k-token json-render prefix | XS |
| 7 | **New approach D: catalog markup (JSX-like) parsed by the browser's HTML parser** | ~2× fewer output tokens than A/B, nested, streams top-down, no new dependency | M |
| 8 | **Data by reference**: seed the fixture into state, have the model bind to paths | Fewer output tokens on data screens, numbers cannot be invented | M |
| 9 | **Plan → parallel sections** | Wall time ≈ the slowest section, not the sum | M–L |
| 10 | Quality measurement: data-coverage metric + rubric judge, plus actually rating runs | The lab can rank on quality, not just "parses" | S–M |

Items 1 to 6 are fixes to A/B/C. Items 7 to 9 are new approaches. Item 10 is about measurement: right now **0 of 131 runs have a rating** [runs], so every "better" claim so far is about speed and validity only.

## 1. What the runs say

- **Output size drives latency.** Total time tracks output tokens. HTML produces about 3× the tokens of A/B and takes about 2.5× as long (benchmark report).
- **About half of A/B output is structural overhead.** I re-serialised every valid A/B spec as nested markup (`<Card title="…"><Stat …/></Card>`) and compared character counts **[runs]**:

  | approach | n | raw chars (med) | same UI as markup (med) | ratio |
  |---|---|---|---|---|
  | json-render (A) | 41 | 5,115 | 2,835 | 0.51 |
  | flat-strict (B) | 35 | 6,001 | 3,118 | 0.49 |

  The overhead is `{"op":"add","path":"/elements/…","value":{"type":…,"props":{…},"children":[…]}}` per element in A, and the `{"key":…,"value":"<escaped JSON>"}` encoding plus ids in B. OpenUI's own tiktoken benchmark reports the same scale: 52.8% fewer tokens than json-render across 7 scenarios **[ext, vendor]**. Script: `/tmp/claude-1000/-home-nejc-Work-generative-ui/f21ce340-6baf-4286-85b0-b22fc3106318/scratchpad/size.py`.
- **HTML output is mostly CSS and JS.** Median share per document: `<style>` 42%, `<script>` 31% (n=43) **[runs]**. Most of the script is hand-rolled chart drawing.
- **The json-render prompt is large.** `catalog.prompt()` is 18,782 chars. Median input is 8.7k tokens for A, 3.6k for B and 1.9k for C (Claude CLI) **[runs, code]**. Much of it (watchers, `validateForm`, `pushState`, `$template`) is unused by these presets.
- **Effort is mostly a latency cost.** Haiku html: TTFT 2.0 s at low vs 74.6 s at high. Validity: high 90%, low 93% **[runs]**.
- **B makes Claude think more.** Haiku at low effort: flat-strict TTFT 13.8 s and 5.2k output tokens for 4.6k chars, vs json-render 2.7 s and 1.95k tokens for 4.2k chars **[runs]**. With similar visible output, the extra ~3–4k tokens are most likely hidden thinking **[inference]**. JSON nested inside escaped JSON strings is hard to write.
- **Codex does not stream**: TTFT ≈ total on every GPT run **[runs]**, because `codex exec --json` only emits `item.completed` (`server/cli.ts` comment) **[code]**.
- **Claude never got strict output on B**: `strictOutput` is false on all 27 Claude flat-strict runs **[runs]**. Claude Code has `--json-schema` (`claude --help`, 2.1.310), but `cliArgs` does not pass it **[code]**. Whether `--json-schema` still emits `text_delta` under `stream-json` is not documented **[ext]**. Test it before relying on it.

### Root causes of every recorded error

| Errors | Where | Cause | Fix |
|---|---|---|---|
| 9× `Checkbox.checked expected boolean, received string` | B, `login`, all models | The model wrote `{"key":"checked","value":"{\"$bindState\":\"/login/rememberMe\"}"}`. `componentLines()` copies catalog descriptions that say *"Bind `checked` with {"$bindState": …}"*, but B has no state, so `toProps` keeps the string and validation rejects the element **[runs, code: `flat-strict.tsx` `componentLines`]** | Strip the "Bind …" sentences for B, **and** drop an invalid optional prop with a warning instead of rejecting the element |
| 3× `not a JSON patch` + 3× `missing child` | A, Sol, `comparison` | Deeply nested `$cond`/`$else` chains. The model miscounted braces (`Extra data` at end of line, Python `json.loads`) **[runs]** | Prompt rule: "no nested `$cond`; use `visible` on sibling elements". Optionally repair the line by trimming trailing `}` and re-parsing |
| 1× `List items expected string, received object` | A, Luna | `$template` expressions placed *inside* the `items` array **[runs]** | Prompt rule: "expressions only as a whole prop value", or check whether json-render resolves expressions nested in arrays before validation |

None of these are model-quality failures. They are prompt or parser contract issues, so they are cheap to fix.

## 2. Fixes to the current approaches

### A · json-render

- **Trim the prompt.** Use `catalog.prompt({ customRules })` and drop the action/watch sections this catalog doesn't need. `PromptOptions` has no per-section switch **[code: `@json-render/core` d.ts]**. Options are (a) post-filter the generated text by section header (brittle under 0.x churn, so pin and test it) or (b) catalog `actions: {}` if that removes the section. Expect a lower TTFT and less over-use of `$cond`/`watch` **[inference]**.
- **Add the two prompt rules** from the error table above.
- **Edit mode.** `PromptOptions.editModes` already documents patch-based edits **[code]**. A "refine this UI" turn costs only the changed patches, not a re-generation. This is the best fit for a follow-up prompt in the lab.
- **Repair pass (optional).** On final errors, send the error list plus the offending lines and ask for replacement patches only. It costs a few hundred tokens and patches apply naturally.

### B · flat-strict

- Fixes 1 and 2 from the TL;DR (prop dropping, no binding hints).
- **Pass the schema to Claude**: `--json-schema` in `cliArgs` for `claude-code`, and set `strictJson: true` for claude-code models only if streaming survives. Otherwise keep it prompt-only and label it that way.
- **Reconsider the kv-list encoding.** It exists to fit Anthropic strict-mode union limits (`PROPS_VARIANT` comment) **[code]**, and it is the main cause of B's extra tokens and thinking. Alternative: one optional typed field per *distinct prop name* across the catalog (`text`, `label`, `rows`, `data`…; about 40 names, all optional, no unions), with `type` picking which ones apply. This exceeds Anthropic's 24-optional-params limit **[ext, research.md]**, so it only works on OpenAI. Treat it as a per-provider variant and measure it.
- Honest framing: B's guarantee is only real where the provider enforces the schema (OpenAI here, Anthropic API if configured). On CLI Claude it is A with a worse format.

### C · html

- **Ship the design system into the iframe** instead of asking the model to write it: a fixed `<style>` with shadcn-like classes (`card`, `stat`, `badge`, `btn`, `grid-3`…) and a tiny chart helper (`<div data-chart='{"type":"bar","data":[…]}'>` rendered by an injected script). The CSP already allows inline script and style **[code: `html.tsx` CSP]**. Expected effect: most of the 42% CSS and part of the 31% JS disappears **[runs + inference]**. It also gives C the same visual language as A/B, which makes the comparison fairer.
- Keep the "follow the request if it asks for a different look" escape hatch; the stylesheet is a default, not a cage.
- Render is throttled to 250 ms of `srcdoc` swaps (`useThrottled`) **[code]**. Each swap reloads the iframe, which flickers and resets scroll. Alternative: inside the iframe, `document.open()` once and `document.write(chunk)` per delta via `postMessage`. The HTML parser streams natively, so this works without reloads **[inference; verify with the CSP and sandbox]**.

## 3. Speed levers (all approaches)

| Lever | Why | Evidence |
|---|---|---|
| Effort `low` by default | Same validity, a fraction of the TTFT | [runs] |
| Fewer output tokens (D, data by reference, C stylesheet) | Generation time ∝ output tokens | [runs] |
| Prompt caching on API runs | `server/run.ts` passes `system` with no `providerOptions.anthropic.cacheControl` **[code]**. Haiku/Sonnet/Opus 5.5 cache from 512 tokens, reads at 0.05–0.1× price, "improved time-to-first-token". Pre-warm with `max_tokens: 0` **[ext]** | |
| Real streaming for Codex | `codex app-server` over stdio JSONL emits `item/agentMessage/delta` **[ext; protocol not stable, pin version]** | |
| Fast inference provider for the hot path | Groq/Cerebras at ~1,000–3,000 tok/s (vendor) **[research.md]**. An OpenAI-compatible endpoint fits the existing `@ai-sdk/openai` path with a `baseURL`, so no new dependency **[inference]** | |
| Skeleton placeholders for not-yet-arrived children | Perceived TTFR. A/B already know child ids before the child arrives | [code] |
| Cache by (prompt, fixture, systemHash, model) | Repeat prompts cost 0; replay already stores deltas | [code: `RunRecord`] |

## 4. New approaches worth adding

### D · Catalog markup (recommended next experiment)

The model writes the same catalog as tags:

```html
<Stack gap="lg">
  <Heading level="h1" text="Revenue Analytics"/>
  <Grid columns="4">
    <Stat label="Total Revenue" value="€184,200" change="+13.9%" trend="up"/>
  </Grid>
  <Card title="Top Products">
    <Table columns='["Product","Units"]' rows='[["Trail Runner 3",412]]'/>
  </Card>
</Stack>
```

- **Tokens:** about 0.5× A/B for the same UI **[runs]**. No ids, no patch envelopes, no key quoting.
- **Models are fluent in it.** C (the HTML-family format) was 100% valid **[runs]**. Markup nests naturally, so there is no flat-list bookkeeping that triggers thinking.
- **Zero-dependency streaming parse:** feed the accumulated text to the browser's error-tolerant HTML parser (`DOMParser` or a `<template>`). It auto-closes open tags, so every prefix yields a tree. Walk it into a json-render `Spec` and reuse `validateElement`, `createsCycle` and `SpecView` unchanged.
- **Traps:** the HTML parser lowercases tag and attribute names, so map them case-insensitively to catalog names (every current prop name is already a single lowercase word). Self-closing `<X/>` is ignored on non-void elements in HTML parsing, so require explicit `</X>` closes or parse in XML mode. `DOMParser` with `application/xml` is strict and fails on prefixes, so it would need a small hand-written tokenizer. Array props go in as JSON attributes. Elements stay stable across chunks only if ids are path-derived (`0.2.1`) **[inference; prototype first]**.
- **Interactivity:** add `visible`/`on`/`$state` as attributes later if D wins on speed and quality. Starting static keeps D small.
- Prior art: OpenUI Lang (`id = Component(args)` lines with positional props, forward refs, streaming renderer) **[ext]**. That is a custom DSL the model has never seen; markup leans on pretraining instead. Worth racing both.

### E · Data by reference

For fixture prompts, seed `/state/data` with the fixture client-side and tell the model to bind (`{"$state":"/data/products"}`) instead of copying values. The data is not echoed into output tokens, and **numbers cannot be hallucinated** (OWASP LLM09). The model still writes labels, layout and derived copy.
- Needs catalog support for object arrays: `Table` with `source` + `columns: [{key,label}]`, and `Chart` with `source` + `x`/`y` keys. Derived values (totals, shares) need either a small set of computed fields precomputed with the fixture or an allowlisted `$fn` (sum, share) **[inference]**.
- A partly does this already: the dashboard run binds `Chart data={"$state":"/weekly"}` **[runs]**, but the state is generated by the model, not provided.

### F · Plan → parallel sections

1. A fast call returns an outline (≈50–150 tokens): `[{id, title, intent}]`.
2. The shell renders the outline as skeleton cards right away.
3. N calls run in parallel, each generating one section under an id prefix (`s2-*`) and streaming into its slot.

Wall time ≈ outline + the slowest section, instead of the sum. Cost is N× input; a cached shared prefix keeps it near 1× on Anthropic **[inference]**. Risks: cross-section consistency (tone, duplicated stats) and subscription rate limits under concurrency (the benchmark's p90 tails were inflated at concurrency 3) **[benchmark report]**.

### G · Retrieve-and-adapt

Keep the best-rated spec per preset or intent and send it as a one-shot example (or as a base for edit-mode patches). This needs ratings to exist first, so it depends on item 10.

### Considered, not recommended here

- **OpenAI Predicted Outputs** for edits: only on GPT-4o/4.1-family models, and rejected prediction tokens are billed **[ext]**. They don't apply to the models in this lab.
- **A2UI / AG-UI / CopilotKit**: protocols for agent↔client across trust boundaries. They add parts without changing the speed/quality axis measured here **[research.md]**.
- **In-browser models** for the lab: 350 MB+ downloads and ~40–70 tok/s on an M3 Max **[research.md]**. That is fine as a separate lane experiment, not as a default.

## 5. Measurement gaps (fix before trusting rankings)

1. **Quality is unmeasured.** Proposals:
   - **Data coverage** (deterministic, free): the share of fixture leaf values that appear in the output. A crude prototype over these runs gives medians of html 0.95, json-render 0.84–0.95 and flat-strict 0.80–0.93 **[runs; heuristic number matching, treat as a sketch]**. Store it in `metrics` as an optional field (`RunRecord` is strict, so it must be optional).
   - **Prompt fidelity checklist:** per preset, a short list of required parts ("email field", "remember me", "sign-in button"). Check it against the spec (exact for A/B/D) or the DOM (C).
   - **Rubric judge:** screenshot plus spec into a cheap model with a fixed 5-point rubric. Calibrate it against human ratings on a sample before trusting it.
   - Rate the existing 131 runs, or at least a stratified 30.
2. **n is 1–3 per cell.** Re-run the decisive comparisons (A vs D, effort low vs medium) at n≥5 per prompt.
3. **API lanes are missing.** All runs are CLI. CLI start-up and harness prompts blur TTFT **[README]**. Run at least Haiku and Sonnet via API for clean timing.
4. **Record cached input tokens.** `RunEvent` usage carries `cachedInputTokens`, but `RunRecord.metrics` doesn't store it **[code]**. Without it, caching effects are invisible.
5. **Separate thinking from visible output.** Store visible output tokens (or chars) next to `outputTokens`, so "the model thought for 4k tokens" is visible rather than inferred.

## 6. Suggested order

1. Fixes 1, 2, 3 and the A prompt rules (an hour) → re-run `login` and `comparison`.
2. Measurement: coverage metric, cached tokens, visible-output field.
3. C stylesheet and chart helper → re-run C.
4. Prototype D with a `DOMParser`-based parser, using the existing catalog and validator → race it against A on all three presets at n≥5, low effort.
5. If D wins, add E (data by reference) to the winner. Add F only if the remaining latency is still the problem.

## Sources

- OpenUI README benchmark (vendor): https://github.com/thesysdev/openui
- OpenUI Lang syntax (secondary): https://skillselion.com/skills/thesysdev/openui, https://azukiazusa.dev/en/blog/openui-framework-for-generative-ui
- Codex app-server: https://developers.openai.com/codex/app-server.md, https://codex.danielvaughan.com/2026/04/15/codex-app-server-complete-guide/
- Claude Code headless / `--json-schema`: https://code.claude.com/docs/en/headless.md
- Anthropic prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- OpenAI Predicted Outputs: https://developers.openai.com/api/docs/guides/predicted-outputs
- Earlier research and prices: [plans/research.md](../plans/research.md)
