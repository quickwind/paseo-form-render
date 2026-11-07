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

## Limits (read before trusting this)
- Group B wording names the thing almost literally ("bar chart", "steps", "tabs", "stars", "collapsible").
  30/30 therefore shows that the model knows how to write the components, not that it would choose them
  unprompted. A neutral-wording run ("show how sales changed this week") is still missing.
- One model, first replies only (no repair rounds), 3 repetitions per task.
- Not measured: how this prompt behaves in the Devin setup with its own instruction injection, and
  weaker models.

## Conclusion
No evidence that the larger prompt hurts validity for SWE-1.6, and clear evidence that the new components
are written correctly when they fit. The cost is +45% prompt size. Prompt tiering is therefore not urgent
for this model; a neutral-wording run and a weaker model are the remaining checks.

Re-run: `node e2e/experiments/prompt-compare/run.mjs [--model P/M] [--reps N] [--limit N] [--concurrency N]`
(needs the local daemon at 127.0.0.1:6767; overwrites `results.json`).
