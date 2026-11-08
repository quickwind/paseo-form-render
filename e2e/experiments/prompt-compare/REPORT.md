# Prompt comparison: 0.3.1 prompt (16 components) vs now (26 component lines)

Run on 2026-11-08, Paseo 0.15.3, Devin provider, model `devin/swe-1-6-slow`. 20 tasks x 2 prompts x
3 repetitions = 120 first replies. Both prompts are given in the user message (Devin ignores
`config.systemPrompt`); fresh agent per reply, empty temp directory, no tools. `old-prompt.ts` is the
`shared/prompt.ts` of 91c7b17 (0.3.1).

Prompt size: old 4,582 chars (~1,270 tokens), new 6,630 chars (~1,840 tokens): +45%.

## Tasks
- Group A (10): ordinary forms, the same tasks as `format-compare`. Regression check.
- Group B (10): a request whose natural answer is one of the new components (chart, steps, tabs, rating,
  code, proportions, markdown, key-value, collapsible, trend). Each has the component(s) expected.

## Result

| group | prompt | valid | strict JSON | used an expected component | avg block (chars) |
| --- | --- | --- | --- | --- | --- |
| A | old | 30/30 | 30/30 | - | 955 |
| A | new | 30/30 | 30/30 | - | 959 |
| B | old | 30/30 | 30/30 | 0/30 | 776 |
| B | new | 30/30 | 30/30 | 30/30 | 590 |

- No failure of any kind in 120 replies (no JSON syntax, schema, duplicate-id or chart-size errors).
- With the new prompt the model used the expected component in every group B task (3/3 each).
- With the old prompt it fell back to what it had: Table for the chart, Text+Badge for steps,
  Select/Input for tabs and rating, Text for code, Progress/Table for proportions, Metric+Text for
  key-value, Alert/Text for the collapsible. Replies with the new components were about 24% shorter.
- Spot check of the content (not just validity): the chart had exactly the given values in 3/3 replies;
  steps carried the given statuses in order; the tabs split the fields into the two requested sections;
  every Rating the model wrote had `required: true`; the disk usage split used SegmentedBar with the
  four given parts.
- No over-use in group A: the only new components the new prompt produced were Rating (the survey task,
  3/3, a better fit than a number input) and KeyValue (one reply on a summary task).

## Group C: neutral wording (new prompt only, 30 replies, `results-C.json`)
Group B names the component almost literally, so group C asks the same kinds of questions without naming
anything ("How did our sales change this week? ...", "Where does my disk space go? ..."). Several
components count as a good answer per task (listed in `run.mjs`), fixed before the run.

- 30/30 valid, no failure of any kind. Used a listed component: 23/30 (77%).
- 3/3: sales trend (Chart), release status (Steps), rating (Rating), docker command (Code), disk usage
  (SegmentedBar), meeting notes (Markdown), error-rate trend (Sparkline and/or Chart).
- Misses, all reasonable alternatives rather than errors: a two-part settings page was built flat with
  Headings in 2 of 3 replies (Tabs once); server info used four Metric cards in 2 of 3 (KeyValue once);
  a changelog was shown inline in 3 of 3 (Details never, which is fine: nothing asked to hide it).
- Content spot check: sales values and the four disk parts exactly as given in 3/3; the trend series
  exactly as given in 3/3; the docker command intact in 3/3.

## Other models (low thinking): Codex GPT-6 Luna and OpenCode DeepSeek V4.1 Flash

Same tasks and scoring, 150 replies each (A and B with both prompts, C with the new prompt only),
`results-codex-gpt-6-luna-low.json` and `results-opencode-deepseek-v4.1-flash-low.json`.
Providers `codex/gpt-6-luna` and `opencode/opencode-go/deepseek-v4.1-flash`, thinking `low`.

**Method fix.** The first run of these two was invalid: the installed plugin injects the *current*
instructions into the system prompt of every new agent, and Codex and OpenCode honor the system prompt,
so the "old prompt" arm also saw the new component list (it used Chart/Steps/Rating 30/30). Devin ignores
the system prompt, so the SWE runs above were not affected. The script now passes a system prompt that
already contains the `[paseo-form-render]` marker, which makes the plugin skip its injection. The numbers
below are from the corrected run (old prompt, group B: 0/30 expected components for both models).

| | SWE-1.6 | GPT-6 Luna low | DeepSeek V4.1 Flash low |
| --- | --- | --- | --- |
| A old, valid | 30/30 | 30/30 | 29/30 |
| A new, valid | 30/30 | 29/30 | 29/30 |
| B old, expected component | 0/30 | 0/30 | 0/30 |
| B new, valid / expected component | 30/30 / 30/30 | 30/30 / 30/30 | 30/30 / 30/30 |
| C (neutral) new, valid | 30/30 | 29/30 | 30/30 |
| C (neutral) new, chose a fitting component | 23/30 | 21/30 | 27/30 |
| average block, group C (chars) | 696 | 501 | 1,177 |

Failures (6 in 450 replies, none systematic): Codex A new: replied "please fill in the report" with no
block; Codex C: answered the docker question with a plain code block, which is a fair answer; DeepSeek A
new: one JSON syntax error (a missing quote before a key); DeepSeek A old: an empty reply; DeepSeek B old:
declined, saying the old component list has no bold, bullets or links (true, and exactly what Markdown fixes).
The old prompt had as many failures as the new one.

Choices without being asked: all three models picked Chart/Sparkline, Steps, Rating, SegmentedBar and
KeyValue on their own; Details was never chosen unprompted by any of them; Tabs was chosen by DeepSeek
3/3, SWE 1/3, Codex 0/3 (flat layout with headings instead). DeepSeek builds much busier cards (up to
eight component types for a one-line question); Codex is the most compact.

Overall: across three models the larger prompt did not cost validity, and the new components are written
correctly and chosen when they fit. Prompt tiering stays unnecessary for these models.

## Limits (read before trusting this)
- One model, first replies only (no repair rounds), 3 repetitions per task. Group C has 10 tasks.
- Not measured: how this prompt behaves in the Devin setup with its own instruction injection, and
  models weaker than these.

## Conclusion
No evidence that the larger prompt hurts validity for SWE-1.6. The new components are written correctly
when asked for (30/30) and chosen on their own most of the time when they fit (23/30), with sensible
fallbacks otherwise and no over-use on ordinary forms. The cost is +45% prompt size. Prompt tiering is
not urgent for this model; a weaker model is the remaining check.

Re-run: `node e2e/experiments/prompt-compare/run.mjs [--model P/M] [--reps N] [--limit N] [--concurrency N]`
(needs the local daemon at 127.0.0.1:6767; overwrites `results.json`).
