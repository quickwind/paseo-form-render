# AGENTS.md

Paseo plugin that renders interactive forms/dashboards in conversations from ```` ```irix-form ```` JSON code fences. See `README.md` for user-facing features and installation.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — `vitest run` (tests: `client/parser.test.ts`, `server/file-picker.test.ts`)
- `npm run pack:offline` — runs typecheck + tests, then builds zip/tgz + sha256 into `~/irix-dist`

Run typecheck and tests before committing.

## Layout

- `paseo-plugin.json` — plugin manifest
- `index.server.ts` — server entry: injects `IRIX_PROMPT_INSTRUCTION` into the system prompt on `agent.create` (idempotent via the `[irix-ui-render]` marker) and registers RPC handlers
- `index.client.tsx` — client entry (registers the renderer and the `/form` and `/form-demo` slash commands)
- `client/` — React Native UI: `parser.ts` (extract/validate fences), `renderer.tsx` (component tree), `container.tsx`, `markdown.tsx`, `project-file-modal.tsx` (in-app file/folder picker)
- `server/` — daemon-side handlers: `file-picker.ts` (list files, create directory), `demo.ts` (`/form-demo`)
- `shared/` — code used by both sides: `schema.ts` (zod schemas + node types), `prompt.ts` (agent protocol instructions), `form-helpers.ts`, `pickers.ts` (RPC definitions), `demo.ts`

## Conventions and gotchas

- **Client must stay Hermes/React Native compatible**: use only RN primitives (`View`, `Text`, `TextInput`, `Pressable`, `Switch`); no DOM elements and no new runtime dependencies in the client bundle. All deps are `devDependencies` by design.
- **Adding or changing a component type** requires updating together: `shared/schema.ts`, the renderer in `client/renderer.tsx`, the component list in `shared/prompt.ts` (so agents know about it), and parser tests.
- Keep `shared/` free of Node-only and React Native-only imports since both sides load it.
- File-picker paths: inside the workspace are returned project-relative, outside as host absolute paths. `server/file-picker.ts` expands `~` and resolves relative paths against the workspace cwd; keep tests in `server/file-picker.test.ts` passing when changing them.
- New files/directories must be added to `files` in `package.json` and to `includeFiles`/`includeDirs` in `scripts/pack-offline.mjs` if they ship with the plugin.
- The `/form-demo` command pushes forms through daemon RPC and must not trigger a model turn.
