# Changelog

All notable changes to the **Envie** project will be documented in this file.

---

## [1.2.0] - 2026-05-18

### Added
- **Schema contract** (`.envie/schema.json`): key metadata split from values; auto-seed on project load; pre-apply validation.
- **Apply diff modal**: Magic UI-inspired side-by-side before/after review with secret masking and reveal toggle.
- **Apply history**: Snapshots under `.envie/history/` with restore via modal and IPC.
- **Validator registry** (`validators/`): modular real checks for tcp, http, supabase, clerk, mapbox, resend with unified result shape and `get-validator-types` IPC.
- **Preview/confirm apply flow**: `preview-apply` and `confirm-apply` IPC; direct target-file write removed from save path.

### Changed
- README rewritten as a developer-tool document without emojis.
- Drawer validation dropdown populated from validator registry; required-key checkbox added.
- Health badges distinguish auth errors (orange) from unreachable (red).

---

## [1.1.0-beta] - 2026-05-18

### Added
- **Manual "Sync Workspace" Button**:
  - Implemented a dedicated header action to trigger a manual audit/synchronization loop of variables against active local disk files.
  - Performs instant cold-boot collision desync alerts, refreshes target file paths, and re-asserts `.gitignore` rules on demand.
- **VS Code-Style Project Switcher**:
  - Engineered core IPC hooks to browse, load, and add project directories dynamically.
  - Implemented persistent recent projects list in the application's global configuration file.
  - local per-project configuration storage (`.envie/config.json` schema) to isolate settings.
- **Visual Variable Toggles & Segmented Sliders**:
  - Designed interactive pill selectors to toggle active environment values for individual keys.
  - Designed an expandable details panel within variable cards for inline editing of values across all environments and key notes.
- **Dynamic & Scalable Connection Pinger**:
  - Developed a scalable background validation framework without hardcoded credentials.
  - Created auto-detection algorithms to classify variables based on key/value patterns (e.g. database URLs, Supabase keys, Clerk keys, Mapbox tokens, Resend keys, HTTP endpoints).
  - Built direct TCP socket connection verification for databases, base64 publishable key tenant extraction for Clerk frontend gateways, and authorized REST queries for Supabase, Mapbox, and Resend.
  - Integrated visual health indicator badges displaying Green (Connected), Yellow (Testing), Orange (Auth Error/Key Rejected), Red (Unreachable), and Gray (Untested).
- **Environment Management Panel**:
  - Designed configuration forms to add, rename, and clean-remove custom environments globally.
  - Setup auto-scaling hooks to update all variables when environments are altered.
- **Architectural Specs**:
  - Created `implementation_plan.md` outlining electron pre-loads, IPC structures, and verification pathways.
  - Published comprehensive `README.md` documentation detailing connection validators and JSON schemas.

---

## [1.0.0] - 2026-05-18

### Added
- **Base Electron Scaffold**:
  - Configured Electron main process (`main.js`), secure IPC preload bridge (`preload.js`), and package dependencies.
  - Developed custom light-themed sleek window frame with collapsible navigation.
- **Metrics Dashboard**:
  - Integrated system specifications bar tracking Chrome, Node, Electron versions, and OS platforms in real time.
- **Local State Manager**:
  - Coded interactive variables search filters and basic Add/Edit/Delete modals.
  - Set up default visual secret masking for passwords, URLs, and keys.
- **Project Scaffold**:
  - Configured basic project setup including `.gitignore` and initialization of the Git repository.
