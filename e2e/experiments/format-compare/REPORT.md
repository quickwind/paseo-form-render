# JSON vs tag format: does the model get forms right more often?

Run on 2026-11-08, Paseo 0.15.3, Devin provider, model `devin/swe-1-6-slow`. Two full runs of
10 tasks x 2 formats x 3 repetitions (60 replies per run, 120 in total).

## Setup

- `run.mjs` creates one fresh agent per reply in an empty temp directory and reads its first reply.
  No tools were called and no files were touched. Test agents are deleted with `paseo delete`.
- Both formats are explained in the **user message**. Devin ignores `config.systemPrompt` (probe:
  a system rule "reply only BANANA" had no effect), so the instructions the plugin injects through
  `agent.create` probably never reach it. This experiment does not depend on that.
- JSON arm: the plugin's own instruction text (`buildPromptInstruction`) and ```` ```pfr-form ````.
- Tag arm: `tags.ts` (a JSX-like format, same components) and ```` ```pfr-tags ````, converted to the
  JSON tree and validated with the same schema.
- Measured: fenced block present, strict parse (JSON.parse + schema, no repair), lenient parse
  (`parseFormBlock`, with the repair step), block length, time.

## Result (second run; the first run was the same)

| | JSON | Tags |
| --- | --- | --- |
| replies | 30 | 30 |
| fenced block present | 100% | 100% |
| strict parse OK | 100% | 100% |
| lenient parse OK | 100% | 100% |
| average block length (chars) | 938 | 627 |
| average time per reply | 5.7 s | 5.1 s |
| tool calls | 0 | 0 |

## Conclusion

- No difference in validity: SWE-1.6 produced valid forms every time in both formats, so neither
  the tag format nor the lenient JSON repair changed an outcome here.
- Tags are about one third shorter and slightly faster. That is the only gain.
- Recommendation: do not build a tag parser for the plugin. The benefit is small and it adds a
  second format to maintain and describe in the prompt. `tags.ts` stays here if it is needed later.

## Limits

- The tasks are ordinary forms; 30 samples per format; only first replies (no repair rounds).
- One model. A weaker model may fail on JSON syntax, which is where the lenient parser helps.
- The open question this surfaced is not the format but delivery: Devin may never see the plugin's
  instructions at all.

Re-run: `node e2e/experiments/format-compare/run.mjs [--model P/M] [--reps N] [--limit N] [--concurrency N]`
(needs the local daemon at 127.0.0.1:6767; overwrites `results.json`).
