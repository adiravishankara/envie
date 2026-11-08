# Envie

Envie is a local-first desktop application for managing environment variable **profiles** in a project. It is built with Electron, vanilla JavaScript, HTML, and CSS.

Model: **project → keys → profiles**. Each profile holds a full value set for every key. Envie owns the real data under `.envie/`. Your app keeps reading `.env.local`; Envie points that path at the active profile.

Envie is **not** a team secrets manager yet. All data stays on your machine under `.envie/`.

---

## Problem

Developers keep several stacks for the same keys (local, staging, production). Switching by hand means editing `.env.local`, mixing values, or leaving a leftover file pointed at the wrong stack. Envie makes the switch wholesale and keeps the mount path stable.

---

## Core Workflow

1. **Open a project folder** — Envie loads or creates `.envie/config.json` and `.envie/schema.json`.
2. **Edit values per key and profile** — Use the drawer to fill each profile.
3. **Switch profile** — The top control remounts `.env.local` onto that profile.
4. **Verify connections** — Background pings use real validators (TCP, HTTP, Supabase, Clerk, Mapbox, Resend).
5. **Apply & Mount** — Review a before/after diff, then write profile files and refresh the mount.

---

## How the mount works

- Profile files live at `.envie/profiles/<name>.env`.
- The mount target defaults to `.env.local`.
- Preferred mode is a **relative symlink**: `.env.local` → `.envie/profiles/<active>.env`.
- If the OS refuses file symlinks (common on Windows without Developer Mode), Envie falls back to a **copy** of the active profile into `.env.local` and remembers `mount.mode: "copy"`.
- Apps keep reading `.env.local`. Restart the process after a switch so `NEXT_PUBLIC_*` and similar values reload.
- Multi-file monorepo mounts (web + api + middleware) are planned later. This release mounts one target.

---

## Configuration Files

### `.envie/config.json` (values and selections)

Stores profile names, the active profile, mount settings (`target`, `mode`), and per-key values.

### `.envie/schema.json` (contract and metadata)

Stores per-key metadata: `required`, `type`, `note`, `validation`, and optional `group`.

### `.envie/profiles/*.env` (compiled profile files)

Rendered stacks that the mount target points at.

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

---

## Apply Diff and History

- **Before apply / first remount over a plain file**: review before/after content.
- **Secrets**: Masked in the diff by default; toggle to reveal.
- **History**: Each successful apply or profile switch saves a snapshot under `.envie/history/`.

---

## Safety Model

- Context-isolated preload bridge (no Node in renderer).
- Sensitive keys auto-masked in the workspace UI.
- `.envie/` and the mount target (`.env.local`) are appended to `.gitignore` when a `.gitignore` exists.
- Atomic writes with `.bak` backups via `env-parser.safeWrite`.

---

## Known Limitations

- One mount target per project for now.
- Validators require network access; offline checks will report unreachable.
- History restore reverts the mount target file contents; it does not rebuild the symlink automatically.
- No team sync, import/export packs, or leak scanning in this release.

---

## Run and Build

```bash
npm install
npm test
npm start
```

Build Windows installer:

```bash
npm run dist
```

---

## License

ISC
