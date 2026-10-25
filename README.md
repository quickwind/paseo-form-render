# Paseo Form Render

Interactive forms, dashboards, and metrics rendering plugin for Paseo conversations.

## Features

- **Interactive Forms in Chat**: Renders structured forms directly in the timeline from ````pfr-form```` code fences.
- **Rich Component Catalog**:
  - `Card`: Container with title, description, and child items
  - `Metric`: Key-value statistics display
  - `Input`: Text input with placeholders and required validation
  - `Select`: Dropdown selection menus with customizable options
  - `Toggle`: Boolean switches
  - `Button`: Submit and action buttons with custom payloads
- **Provider Agnostic**:
  - Fully compatible with **Devin**, **Claude**, **Antigravity**, **Gemini**, and OpenAI providers.
  - Automatically injects protocol instructions on agent initialization.
- **Full Mobile & Hermes Compatibility**:
  - 100% pure React Native UI primitives (`View`, `Text`, `TextInput`, `Pressable`, `Switch`).
  - Zero external runtime dependencies in the client bundle.
  - Rigorously tested against the React Native Hermes JavaScript engine on iOS and Android.
- **Self-healing Forms**:
  - Invalid `pfr-form` blocks show a precise error list (offending node, missing fields, allowed values, "did you mean" hints, JSON line/column).
  - The agent is automatically asked to re-send a corrected block, up to a configurable number of times in a row.
  - An **Ask agent to fix** button on the error box requests a fix manually (ignores the retry limit).
  - Setting: **Paseo Form Render > Maximum retries** in the plugin settings (0-5, default 2; 0 turns automatic fixes off).
  - Known limitations:
    - A message sent within a few milliseconds of the agent finishing (by a script, another plugin, or an orchestrating agent) can race the automatic fix request. Paseo's `send` interrupts a running turn and has no "send only if idle" option, so in that race the fix may cancel the other message's turn. The plugin re-checks that the agent is idle right before sending, which narrows the window; messages typed by a person are not affected in practice.
    - Not used yet: sending the fix with `activeTurnBehavior: "steer"` would add it to a running turn instead of cancelling that turn, but the agent then handles an unrelated fix request in the middle of another reply, and providers without steering support (ACP-based ones such as Copilot, Cursor, Kimi) fall back to interrupting anyway.
    - Each assistant message is checked on its own, as the client renders it. A provider that splits one `pfr-form` fence across several messages gets a (misleading) JSON error and a fix request.
- **Prefer forms** (on by default): the **Paseo Form Render > Prefer forms** plugin setting adds a "Required usage" section to the injected prompt, so agents must ask for choices, parameters, and confirmations with an `pfr-form` block instead of plain text. Turn it off to keep the weaker default wording, which only says agents can use forms. Applies to agents created after the change.
- **Non-blocking `/form-demo`**:
  - Pushes sample forms directly via daemon RPC without triggering model thinking turns or consuming API quota.

## Slash Commands

- `/form [task]`: Instruct the active agent to adopt the `pfr-form` protocol for interactive questionnaires or parameter collection.
- `/form-demo`: Display a demonstration interactive configuration form in the conversation timeline without calling the model.

## Installation

### From npm
```bash
paseo plugin add npm:paseo-form-render
```

That is the whole install. Paseo fetches the package and compiles the TypeScript sources with its
own bundler, so the plugin ships no build artifacts and has no runtime dependencies.

### From Local Directory
```bash
paseo plugin add /path/to/paseo-form-render
```

### From Offline Package
Unpack `paseo-form-render-<version>-offline.zip` and run:
```bash
paseo plugin add /path/to/extracted-folder
```
Or register in `~/.paseo/config.json`:
```json
{
  "plugins": {
    "paseo-form-render": {
      "source": "directory",
      "path": "/path/to/paseo-form-render",
      "enabled": true
    }
  }
}
```

## Development & Packaging

The npm package is the primary release channel: the tarball ships the TypeScript sources plus
`paseo-plugin.json` (the negated `files` pattern keeps the `*.test.ts` files out), and Paseo compiles
them itself. Releases run from the **Publish** workflow by hand (Actions tab → Publish → Run workflow,
or `gh workflow run Publish -f version=0.1.1`): it checks the version against `package.json`, re-runs
typecheck and the unit tests, publishes with the `NPM_TOKEN` secret, then pushes the `v<version>` tag
and opens the GitHub release. Pass `dry_run` to verify without publishing.

Nothing runs automatically — this repository is private, so Actions minutes are billed. CI (unit +
e2e on three platforms) and the Snyk scan are manual too.

```bash
# Typecheck and run test suites
npm run typecheck
npm test

# Inspect exactly what the npm tarball would contain
npm pack --dry-run

# Build offline archive (outputs to ./dist by default)
npm run pack:offline

# Or specify a custom output directory
npm run pack:offline -- /path/to/dist
# or: DIST_DIR=/path/to/dist npm run pack:offline

# End-to-end tests against a real Paseo daemon (Linux, macOS, Windows; Node 22+)
npm ci --prefix e2e
npx --prefix e2e playwright install chromium   # once, for the browser UI checks
npm run e2e            # or: node e2e/run.mjs --all --repeat 2   (--no-ui: skip the browser)
```

The e2e harness lives in `e2e/` with its own dependencies and is not part of the plugin package; see
[`e2e/README.md`](e2e/README.md). Besides the auto-fix protocol it checks the client UI (rendered
forms, the error box and its "Ask agent to fix" button, the settings screen) in the daemon's web UI
with headless Chromium and saves screenshots. CI (`.github/workflows/ci.yml`) runs the unit tests and
the e2e suite on Linux, macOS and Windows.

## License

MIT
