# Wukong UI Render

Interactive forms, dashboards, and metrics rendering plugin for Wukong and Paseo conversations.

## Features

- **Interactive Forms in Chat**: Renders structured forms directly in the timeline from ````wukong-form```` code fences.
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

- `/form [task]`: Instruct the active agent to adopt the `wukong-form` protocol for interactive questionnaires or parameter collection.
- `/form-demo`: Display a demonstration interactive configuration form in the conversation timeline without calling the model.

## Installation

### From Local Directory
```bash
paseo plugin add /path/to/wukong-ui-render
```

### From Offline Package
Unpack `wukong-ui-render-<version>-offline.zip` and run:
```bash
paseo plugin add /path/to/extracted-folder
```
Or register in `~/.paseo/config.json`:
```json
{
  "plugins": {
    "wukong-ui-render": {
      "source": "directory",
      "path": "/path/to/wukong-ui-render",
      "enabled": true
    }
  }
}
```

## License

MIT
