# Irix UI Render

Interactive forms, dashboards, and metrics rendering plugin for Irix and Paseo conversations.

## Features

- **Interactive Forms in Chat**: Renders structured forms directly in the timeline from ````irix-form```` code fences.
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
  - Invalid `irix-form` blocks show a precise error list (offending node, missing fields, allowed values, "did you mean" hints, JSON line/column).
  - The agent is automatically asked to re-send a corrected block, up to a configurable number of times in a row.
  - An **Ask agent to fix** button on the error box requests a fix manually (ignores the retry limit).
  - Setting: **Irix UI Render > Maximum retries** in the plugin settings (0-5, default 2; 0 turns automatic fixes off).
  - Known limitations:
    - A message sent within a few milliseconds of the agent finishing (by a script, another plugin, or an orchestrating agent) can race the automatic fix request. Paseo's `send` interrupts a running turn and has no "send only if idle" option, so in that race the fix may cancel the other message's turn. The plugin re-checks that the agent is idle right before sending, which narrows the window; messages typed by a person are not affected in practice.
    - Not used yet: sending the fix with `activeTurnBehavior: "steer"` would add it to a running turn instead of cancelling that turn, but the agent then handles an unrelated fix request in the middle of another reply, and providers without steering support (ACP-based ones such as Copilot, Cursor, Kimi) fall back to interrupting anyway.
    - Each assistant message is checked on its own, as the client renders it. A provider that splits one `irix-form` fence across several messages gets a (misleading) JSON error and a fix request.
- **Non-blocking `/form-demo`**:
  - Pushes sample forms directly via daemon RPC without triggering model thinking turns or consuming API quota.

## Slash Commands

- `/form [task]`: Instruct the active agent to adopt the `irix-form` protocol for interactive questionnaires or parameter collection.
- `/form-demo`: Display a demonstration interactive configuration form in the conversation timeline without calling the model.

## Installation

### From Local Directory
```bash
paseo plugin add /path/to/irix-ui-render
```

### From Offline Package
Unpack `irix-ui-render-<version>-offline.zip` and run:
```bash
paseo plugin add /path/to/extracted-folder
```
Or register in `~/.paseo/config.json`:
```json
{
  "plugins": {
    "irix-ui-render": {
      "source": "directory",
      "path": "/path/to/irix-ui-render",
      "enabled": true
    }
  }
}
```

## Development & Offline Packaging

```bash
# Typecheck and run test suites
npm run typecheck
npm test

# Build offline archive (outputs to ./dist by default)
npm run pack:offline

# Or specify a custom output directory
npm run pack:offline -- /path/to/dist
# or: DIST_DIR=/path/to/dist npm run pack:offline

# End-to-end auto-fix tests against a real Paseo daemon (Linux, macOS, Windows; Node 22+)
npm ci --prefix e2e
npm run e2e            # or: node e2e/run.mjs --all --repeat 2
```

The e2e harness lives in `e2e/` with its own dependencies and is not part of the plugin package; see
[`e2e/README.md`](e2e/README.md). CI (`.github/workflows/ci.yml`) runs the unit tests and the e2e
suite on Linux, macOS and Windows.

## License

MIT
