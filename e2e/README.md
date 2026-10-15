# irix-ui-render end-to-end tests

End-to-end tests for the irix-form **auto-fix** feature (`server/auto-fix.ts`) and the plugin's
**client UI**. They run the plugin under test inside a real Paseo daemon (`@getpaseo/server`/
`@getpaseo/cli` 0.11.4, pinned in this directory's `package.json`) and drive agents through a
scripted fake provider, so no model, API key or network is involved. The UI checks open the
daemon's bundled web UI in headless Chromium (Playwright, pinned too) and assert on what the user
sees: rendered forms, the `[irix-form Syntax Error]` box, the "Ask agent to fix" button and the
settings screen, with screenshots of each step.

This directory is a separate npm package: its dependencies are heavy and not part of the plugin.
Nothing here ships: `e2e/` is not in the root `package.json` `files` list or in
`scripts/pack-offline.mjs`, and the root `tsconfig.json` excludes it.

## Running

Requires Node.js 22 or later (Paseo 0.11.4 needs >= 21.3). Linux, macOS and Windows use the same
commands; there are no shell scripts.

```bash
npm ci --prefix e2e                            # once
npx --prefix e2e playwright install chromium   # once: the browser for the UI checks
node e2e/run.mjs             # all default scenarios (s1-s8, uisettings, uimanual), ~4-6 min
node e2e/run.mjs s1 s4       # selected scenarios
node e2e/run.mjs --all       # default + optional scenarios (restart, nocmid)
node e2e/run.mjs --no-ui     # protocol checks only, no browser
npm run e2e -- --repeat 2    # from the repo root (or `npm run e2e` inside e2e/)
```

On Linux, `npx --prefix e2e playwright install --with-deps chromium` also installs the system
libraries Chromium needs (uses `sudo apt-get`). The browser goes to Playwright's cache
(`PLAYWRIGHT_BROWSERS_PATH` if set, otherwise `~/.cache/ms-playwright`, `~/Library/Caches/ms-playwright`
or `%LOCALAPPDATA%\ms-playwright`). To use an existing Chromium build instead, set
`E2E_CHROMIUM_EXECUTABLE` to its executable.

Options:

| Option | Meaning |
| --- | --- |
| `--repeat N` | run each scenario N times (default 1) |
| `--time-scale X` | multiply quiet periods and timeouts by X (default 1, or `E2E_TIME_SCALE`); CI uses 1.5 |
| `--out DIR` | results directory, replaced on each run (default `e2e/results/`, git-ignored) |
| `--keep` | keep the temp workspace (Paseo home, logs, plugin state) and print its path |
| `--no-ui` | skip the browser UI checks: no web UI, no Chromium; `uisettings`/`uimanual` are dropped |

Output: one `PASS` / `FAIL` / `KNOWN-LIMITATION` / `PASS (info)` line per check, a summary, and
`<out>/results.json` (summary, per-check rows, per-scenario timings and evidence: what the fake
provider received, the turn-end probes and, under `evidence.ui`, the browser's console warnings and
the screenshot list). `<out>/logs/` holds the daemon stdout logs, the Paseo `daemon.log`, the
generated `config.json` and the fake plugin's JSONL state. `<out>/screenshots/<platform>/` holds the
UI screenshots (`<scenario>-<step>.png`, `-runN` from the second `--repeat` on); a failed UI check
adds `<scenario>-<step>-failed.png` and a scenario that throws adds `<scenario>-runN-threw.png`.

The exit code is non-zero if any non-informational check fails (or setup fails). Checks marked
informational (S5, and the split-fence limitation in S8) never fail the run.

## What a run does

1. Creates an isolated workspace under `os.tmpdir()` (`irix-e2e-XXXXXX`) with a Paseo home, a fake
   user home, the fake plugin's state directory, logs and the agents' working directory.
2. Copies the plugin under test from the repo root (without `.git`, `.github`, `node_modules`,
   `dist`, `e2e`) and `e2e/plugins/irix-e2e-fake` into the workspace.
3. Writes `<home>/config.json`: listen address on a free port, `pluginsEnabled: true`, MCP/relay/
   terminal agent hooks off, the built-in providers (claude, codex, ...) disabled, and
   `features.webUi.enabled` (true unless `--no-ui`), so the daemon serves its web UI on the same port.
4. Starts `paseo daemon run --home <home>` as `node <@getpaseo/cli>/dist/index.js` (the CLI's bin
   shebang uses `env -S`, which does not work on Windows) and waits for "Listening on" plus a TCP
   connection.
5. `paseo plugin install <dir> --home <home>` for both plugins, then waits for the plugin's settings
   RPC.
6. Unless `--no-ui`: launches headless Chromium (fresh throwaway profile) and loads the web UI once
   (see "UI checks" below).
7. Runs the scenarios over a websocket `DaemonClient`; S1, S2 and S7 also check the browser, and
   `uisettings`/`uimanual` are browser-only.
8. Closes the browser, stops the daemon with `paseo daemon stop --home`, kills the process tree if it is still running,
   copies logs to `--out` and deletes the workspace (unless `--keep`).

The daemon and every CLI call get `HOME`, `USERPROFILE`, `XDG_{CONFIG,DATA,STATE,CACHE}_HOME` (and on
Windows `APPDATA`/`LOCALAPPDATA`) pointing into the workspace, `PASEO_HOME`, and `--home` explicitly.
Inherited `PASEO_*`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `OPENCODE_CONFIG_DIR` and `NODE_OPTIONS` are
dropped, so a developer's real Paseo/provider configuration is never read or written. Nothing is
written to the repo except `--out`.

## Scenarios

| Scenario | Intent |
| --- | --- |
| S1 | One invalid block (unknown type) gets exactly one fix request: starts with `[irix-form-fix]`, names the problem, contains no raw JSON; the corrected reply ends the loop. A typo (`Inpt`) gets a "Did you mean Input?" hint. |
| S2 | A reply that stays invalid stops after the default limit (2 fix requests); each request describes the latest reply's errors. |
| S3 | Setting `autoFixMaxRetries`: 0 turns fixes off, 1 sends one, 9 is rejected, the value survives a daemon restart, reset restores 2. |
| S4 | A real user message resets the retry count. |
| S5 | **Known limitation, informational.** A real message sent 0/20/100/500 ms after the turn end (from the client, and from another plugin's `turn_ended` hook) races the fix request. Documented in the root README; Paseo's `send` has no "only if idle" option. The 0 ms variants usually report `KNOWN-LIMITATION`. |
| S6 | No fix for failed or canceled turns; a fix turn that fails stops the loop; a user cancel mid-turn (after a bad form streamed) sends no fix. |
| S7 | Valid forms and plain text (including other code fences) never trigger a fix. |
| uisettings | Browser only. The plugin settings screen shows the current `autoFixMaxRetries` (2); `+` saves 3 and `−` three times saves 0 (checked with the settings RPC); a value written over RPC shows after a reload. |
| uimanual | Browser only. With automatic fixes off (0), a bad form shows the error box and no fix is sent; clicking "Ask agent to fix" shows "Fix requested", the provider receives exactly one `[irix-form-fix]` message, and the corrected form renders. |
| S8 | Message shapes: a bad form streamed in chunks, a bad and a good form in separate messages, long turns (~280/~400 timeline entries, beyond the fetched history window), and a long history with several user messages. A valid fence split across two messages gets a fix request (documented limitation, informational) but never loops. |
| restart (optional) | An agent resumed after a daemon restart still gets exactly one fix. |
| nocmid (optional) | Agents created without a `clientMessageId` (first user message missing from the timeline) behave like S1/S2. |

## UI checks

With UI checks on (the default), S1, S2 and S7 add browser assertions after their protocol checks:

| Scenario | UI checks (screenshots) |
| --- | --- |
| S1 | the plugin's client bundle evaluated (no `[Plugins] Failed to evaluate` warning); the error box shows the instructive issue (`unknown component type "Slider"`) and "Ask agent to fix"; exactly one `[irix-form-fix]` message; the corrected form renders as a form, not raw JSON. The flow has finished before the page opens, so one screenshot (`s1-flow`) shows all three |
| S2 | after the limit: 3 error boxes, the last one explaining the invalid JSON, exactly 2 fix messages (`s2-last-error`) |
| S7 | a valid form renders, no error box (`s7-valid-form`, baseline) |

How the browser gets in (`lib/browser.mjs`):

- **Auth**: the harness daemon has no password, so Paseo admits every connection as owner,
  including the web UI's same-origin websocket. No token, pairing or cookie is involved and nothing
  outside the workspace and the browser's throwaway profile is touched.
- **Plugins**: the web UI is the same Expo app as the desktop/mobile clients; it receives each
  plugin's compiled client bundle from the daemon and evaluates it. No web-specific enablement is
  needed.
- **Navigation**: the first load of `/` registers the daemon as a host in the app's localStorage
  (`@paseo:daemon-registry`, waited for); before that, deep links redirect to `/open-project`.
  Then `/h/<serverId>/agent/<agentId>` opens a conversation and
  `/settings/hosts/<serverId>/plugins/irix-ui-render/irix-ui-render-settings` the settings screen.
  The server id comes from the client's server info (or `<home>/server-id`).
- **Selectors**: text only (the plugin has no test ids): `[irix-form Syntax Error]`, messages
  starting with `[irix-form-fix]`, the issue line, "Ask agent to fix", "Fix requested; ...", the form's
  title/label texts, and the settings screen's accessibility labels ("Increase retries"/"Decrease
  retries") and hint ("Up to N automatic requests per reply.", exact, so a pending " Saving…" is
  waited out). Waits are element/condition waits scaled by `--time-scale`, no fixed sleeps.
- The `uimanual` script delays the agent's reply to the fix request by 4 s, so the button's sent
  state is visible before the timeline grows.

## The fake provider and scenario scripts

`plugins/irix-e2e-fake/index.server.ts` is a test-only Paseo plugin. It requires the
`IRIX_E2E_STATE` environment variable (the harness passes the workspace state directory to the
daemon) and:

- registers the provider `fake` (model `fake-model`) with `server.registerProvider`;
- answers prompts from `<state>/scenarios.json`, which the harness writes from
  `scenarios/scripts.mjs`. The first prompt of a session is `SCENARIO:<name> run=<unique>`; every
  later prompt (fix requests, user messages) gets the script's next reply, and the last reply
  repeats. Replies can be one message, streamed chunks, several messages with tool calls in between,
  delays, or an outcome of `failed`, `canceled` or `hang` (waits for an interrupt);
- appends every prompt/interrupt it receives to `<state>/received.jsonl` and every
  `agent.turn_started`/`agent.turn_ended` to `<state>/probe.jsonl`;
- for S5's hook race, sends a follow-up message from its own `turn_ended` hook when the first user
  message starts with `SCENARIO:s5hook`.

The harness finds the session of an agent by its unique first prompt and asserts on the prompts the
provider received (`lib/client.mjs` `Harness.promptsFor`). `waitQuiet` waits until the logs have been
quiet for a few seconds and the agent is not running.

### Adding a scenario

1. Add a script to `SCRIPTS` in `scenarios/scripts.mjs` (reuse the `@BAD`/`@GOOD`/... macros).
2. Add an `async (ctx, run)` function to `SCENARIOS` in `scenarios/checks.mjs`; use `simple(ctx, "<script>", "<evidence key>")`
   for the common "create agent, wait, collect" flow, and `ctx.results.check(...)` for assertions
   (`{ known: true }` for informational checks).
3. Add its name to `DEFAULT_SCENARIOS` or `OPTIONAL_SCENARIOS` (browser-only ones also to
   `UI_SCENARIOS`), and document it in the table above.
4. For UI assertions, add a function to `scenarios/ui-checks.mjs` and call it when `ctx.ui` is set;
   wrap each assertion in `ui.check(...)` so a failure gets a screenshot and does not stop the rest.

Do not name files `*.test.*` in this directory: the root `vitest run` would pick them up.

## Gotchas

- Plugins only load when the top-level `"pluginsEnabled": true` is in `<PASEO_HOME>/config.json`.
- The daemon compiles each plugin's `index.server.ts` with its own esbuild and provides `zod` and the
  plugin SDK, so the copied plugin needs no `node_modules` (the e2e CI job does not run the root
  `npm ci`).
- The workspace path is canonicalized (`realpath`): on macOS `os.tmpdir()` is behind a symlink and on
  Windows runners it is an 8.3 short path, and the daemon compares plugin file realpaths with the
  plugin directory.
- Timing-based waits: increase `--time-scale` on a slow machine if checks fail with fewer prompts than
  expected or "timeout waiting ... to go quiet".
- S5 is a documented Paseo limitation, not a plugin bug; see "Known limitations" in the root README.
- A client plugin whose `contribute()` throws is dropped by the app with a console warning, and
  forms then show as raw JSON. The S1 UI check reports the warning; the first one found was an
  invalid icon name (`"settings"` instead of the Lucide export name `"Settings"`).
- The Playwright version is pinned; `npx --prefix e2e playwright install chromium` installs the
  matching browser build. A mismatch shows as "Executable doesn't exist" at launch.

## Future

The fake provider is a candidate to be replaced by a standalone, reusable scripted-provider Paseo
plugin (shared with other plugins' e2e tests).
