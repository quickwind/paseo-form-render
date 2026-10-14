# Irix UI Render

Interactive forms, dashboards, and metrics rendering plugin for Irix and Paseo conversations.

## Features

- **Interactive Forms in Chat**: Renders structured forms directly in the timeline from ````irix-form```` code fences (backward compatible with `wukong-form`).
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
```

## License

MIT
