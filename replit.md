# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── timer-app/          # Timer & Pomodoro React app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Timer App (`artifacts/timer-app`)

React + Vite app served at `/`. Features:
- **Simple Timer** mode: count-up stopwatch with start/stop
- **Pomodoro** mode: 25-min focus / 5-min break cycles with auto-progression
- **Notes section**: always visible, notes attached to each logged session
- **Session history**: list of all logged sessions with type, duration, notes, timestamp
- **Voice recording**: record audio clips during active sessions, uploaded to GCS, playable from session history
- **Task/project system**: hierarchical task management with project grouping

Frontend packages: framer-motion, date-fns, clsx, tailwind-merge, lucide-react

### Voice Recording Architecture
- `useVoiceRecorder` hook: MediaRecorder API, captures WebM/Opus blobs in memory during session
- `VoiceRecorder` component: Record/Stop button, only visible when timer is active
- On session save: clips uploaded to GCS via presigned URLs, metadata POSTed to `/api/recordings`
- Session history: recordings displayed as inline audio players with offset timestamp and duration

### Session Management Controls
- **Abort session**: "Abort Session" button visible during active sessions, with inline confirmation
- **Delete with confirmation**: Inline "Delete this session?" banner before deleting logged sessions
- **Per-session Restart**: RotateCcw icon on individual session entries, restores task/project and switches timer mode
- **Edit duration**: Inline form with minute/second inputs and start-time picker, calls PATCH endpoint
- Session action icons (Restart, Edit, Delete) appear on hover over individual session entries

## API Endpoints

- `GET /api/sessions` — list all sessions with recordings (newest first, left-join recordings)
- `POST /api/sessions` — create session (`{ type, durationSeconds, notes, taskId }`)
- `PATCH /api/sessions/:id` — update session (`{ durationSeconds?, createdAt? }`)
- `DELETE /api/sessions/:id` — delete a session (cascades to recordings)
- `POST /api/recordings` — create recording metadata (`{ sessionId, objectPath, durationSeconds, offsetSeconds }`)
- `POST /api/storage/uploads/request-url` — request presigned GCS upload URL
- `GET /api/storage/objects/*` — serve uploaded audio files from GCS

Session types: `simple`, `pomodoro_focus`, `pomodoro_break`

## Object Storage

Replit App Storage (GCS-backed) for audio file persistence. Provisioned via `setupObjectStorage()`.
- Server files: `artifacts/api-server/src/lib/objectStorage.ts`, `objectAcl.ts`, `routes/storage.ts`
- Packages: `@google-cloud/storage`, `google-auth-library`
- Upload flow: client requests presigned URL → uploads directly to GCS → stores objectPath in DB

## Database Schema

- `sessions` table: `id`, `type`, `duration_seconds`, `notes`, `task_id`, `created_at`
- `recordings` table: `id`, `session_id` (FK→sessions CASCADE), `object_path`, `duration_seconds`, `offset_seconds`, `created_at`
- `tasks` table: `id`, `name`, `project_id`, `created_at`
- `projects` table: `id`, `name`, `created_at`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
