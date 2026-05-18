# Envie

Envie is a local-first desktop application for managing environment variables across project stages (`local`, `test`, `staging`, `deployment`, and custom names). It is built with Electron, vanilla JavaScript, HTML, and CSS.

Envie helps you avoid manual `.env` editing, copy-paste drift between environments, and silent credential failures. Before writing changes to disk, you review a side-by-side diff. Connection validators run real network checks against databases and third-party APIs.

Envie is **not** a team secrets manager. All data stays on your machine under `.envie/`.

---

## Problem

Developers often maintain multiple environment-specific values for the same keys. Switching stages means editing `.env.local` by hand, hoping values match what Envie (or your notes) say, and only discovering bad credentials when the app runs.

---

## Core Workflow

1. **Open a project folder** — Envie loads or creates `.envie/config.json` and `.envie/schema.json`.
2. **Edit values per key and environment** — Use segmented toggles or the integration drawer.
3. **Verify connections** — Background pings use real validators (TCP, HTTP, Supabase, Clerk, Mapbox, Resend).
4. **Apply Changes** — A review modal shows before/after diff (secrets masked by default).
5. **Confirm apply** — Envie snapshots the previous file to `.envie/history/` then writes the target `.env` file.

---

## Configuration Files

### `.envie/config.json` (values and selections)

Stores environment names, the workspace preset, and per-key values plus active environment selection.

### `.envie/schema.json` (contract and metadata)

Stores per-key metadata: `required`, `type`, `note`, `validation`, and optional `group`. Seeded automatically from config and parsed `.env` files when missing.

### `envie-global-config.json` (app user data)

Recent projects and last active project path (Electron user-data directory).

---

## Connection Validators

Validators run in the main process and return a consistent result: `status`, `severity`, `message`, `details`, `checkedAt`, and optional `statusCode`.

| Type | Behavior |
|------|----------|
| `tcp` | TCP socket to host/port from database URLs |
| `http` | GET request; 2xx = connected, 401/403 = auth error |
| `supabase` | REST `/rest/v1/` with API key |
| `clerk` | Decodes publishable key, checks frontend API |
| `mapbox` | Token validation via Mapbox API |
| `resend` | Bearer check against Resend domains endpoint |

Status mapping in the UI:

- **Green** — Connected
- **Orange** — Auth error (reachable, credentials rejected)
- **Red** — Unreachable or network failure
- **Gray** — Untested

Unsupported services should use generic `http` until a dedicated validator exists.

---

## Apply Diff and History

- **Before apply**: `preview-apply` compiles output and compares to the current target file.
- **Diff UI**: Side-by-side panels inspired by [Magic UI Code Comparison](https://magicui.design/docs/components/code-comparison), implemented in vanilla JS (no React).
- **Secrets**: Masked in the diff by default; toggle to reveal.
- **Validation**: Required keys and invalid validation types block **Apply**; **Apply Anyway** bypasses errors.
- **History**: Each successful apply saves a snapshot under `.envie/history/`. Restore reverts the target file to the pre-apply contents.

---

## Safety Model

- Context-isolated preload bridge (no Node in renderer).
- Sensitive keys auto-masked in the workspace UI.
- `.envie/` appended to `.gitignore` when a `.gitignore` exists.
- Atomic writes with `.bak` backups via `env-parser.safeWrite`.

---

## Known Limitations

- Validators require network access; offline checks will report unreachable.
- History restore only reverts the target env file, not in-memory Envie config.
- No import/export packs, leak scanning, or cloud sync in this release.

---

## Run and Build

```bash
npm install
npm start
```

Build Windows installer:

```bash
npm run dist
```

---

## License

ISC
