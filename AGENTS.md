# AGENTS.md

Paseo plugin that renders interactive forms/dashboards in conversations from ```` ```irix-form ```` JSON code fences. See `README.md` for user-facing features and installation.

## Commands

- `npm run typecheck` — `tsc --noEmit`
- `npm test` — `vitest run` (tests: `shared/parser.test.ts`, `shared/form-errors.test.ts`, `shared/form-fix.test.ts`, `server/file-picker.test.ts`, `server/auto-fix.test.ts`)
- `npm run pack:offline` — runs typecheck + tests, then builds zip/tgz + sha256 into `./dist` (or specify via `--out <dir>` / `DIST_DIR`)

Run typecheck and tests before committing.

## Layout

- `paseo-plugin.json` — plugin manifest
- `index.server.ts` — server entry: injects `IRIX_PROMPT_INSTRUCTION` into the system prompt on `agent.create` (idempotent via the `[irix-ui-render]` marker), registers RPC handlers, and registers auto-fix (`server/auto-fix.ts`)
- `index.client.tsx` — client entry (registers the renderer and the `/form` and `/form-demo` slash commands)
- `client/` — React Native UI: `renderer.tsx` (component tree), `container.tsx` (includes the error box with the "Ask agent to fix" button), `settings-screen.tsx` (auto-fix retry setting), `markdown.tsx`, `project-file-modal.tsx` (in-app file/folder picker)
- `server/` — daemon-side handlers: `file-picker.ts` (list files, create directory), `demo.ts` (`/form-demo`), `auto-fix.ts` (on `agent.turn_ended`, asks the agent to repair invalid blocks; decision logic is pure and tested)
- `shared/` — code used by both sides: `parser.ts` (extract/validate fences), `form-errors.ts` (instructive error messages), `form-fix.ts` (`[irix-form-fix]` message builder, attempt counting), `settings.ts` (`autoFixMaxRetries`), `schema.ts` (zod schemas + node types), `prompt.ts` (agent protocol instructions), `form-helpers.ts`, `pickers.ts` (RPC definitions), `demo.ts`

## Conventions and gotchas

- **Client must stay Hermes/React Native compatible**: use only RN primitives (`View`, `Text`, `TextInput`, `Pressable`, `Switch`); no DOM elements and no new runtime dependencies in the client bundle. All deps are `devDependencies` by design.
- **Adding or changing a component type** requires updating together: `shared/schema.ts` (including `IRIX_NODE_TYPES`, which the compiler checks is complete), the renderer in `client/renderer.tsx`, the component list in `shared/prompt.ts` (so agents know about it), and parser tests.
- Keep `shared/` free of Node-only and React Native-only imports since both sides load it.
- File-picker paths: inside the workspace are returned project-relative, outside as host absolute paths. `server/file-picker.ts` expands `~` and resolves relative paths against the workspace cwd; keep tests in `server/file-picker.test.ts` passing when changing them.
- New files/directories must be added to `files` in `package.json` and to `includeFiles`/`includeDirs` in `scripts/pack-offline.mjs` if they ship with the plugin.
- Auto-fix must fail closed: the `agent.turn_ended` timeline may cover only the finished turn, so the retry count comes from a fresh `timeline.refetch`, and nothing is sent if that fails.
- The `/form-demo` command pushes forms through daemon RPC and must not trigger a model turn.
