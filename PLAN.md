# Envie Upgrade Plan

## Summary
Add the first serious developer-tool upgrades around correctness and trust: an Envie-owned schema contract, a pre-apply code-comparison diff, local snapshot history, real connection validators, and a more professional README without emojis. Keep import/export, leak detection, and team/cloud features out of this pass.

## Key Changes
- Add `.envie/schema.json` as the contract source of truth for keys, required status, type, notes, validation mode, and optional service group.
- Seed the schema from existing `.envie/config.json` and parsed `.env` files when missing.
- Keep `.envie/config.json` responsible for environment values and active selections; keep `.envie/schema.json` responsible for key metadata and validation contract.
- Add schema-aware validation before apply: missing required keys, empty selected values, unknown keys, and invalid validation types should be reported in the UI and console.

## Apply Diff And History
- Replace direct “Apply Changes” behavior with a review modal shown before writing the target env file.
- Use a native vanilla JS/CSS code comparison UI inspired by [Magic UI Code Comparison](https://magicui.design/docs/components/code-comparison), not the React component itself.
- Show `before` as the current target file contents and `after` as the compiled Envie output.
- Mask secret values in the visual diff by default while preserving enough structure to identify changed keys.
- Add explicit actions: `Cancel`, `Apply Anyway`, and `Apply`.
- Store local snapshots under `.envie/history/` before each successful apply, with timestamp, target file, active environment, and compiled output.
- Add a simple restore path in this pass via backend IPC and console/UI feedback; a polished history browser can come later.

## Real Validator Architecture
- Remove all mocked connection results from `main.js` and renderer fallback paths.
- Add a validator registry module with real validators for `tcp`, `http`, `supabase`, `clerk`, `mapbox`, and `resend`.
- Return a consistent result shape: `status`, `severity`, `message`, `details`, `checkedAt`, and optional `statusCode`.
- Treat auth rejection separately from network failure so the UI can distinguish “reachable but rejected” from “unreachable.”
- Keep the registry extensible: adding a future validator should mean adding one validator entry, not changing renderer branching.
- Update the drawer’s validation mode selector from hardcoded labels to options exposed by the registry through IPC.

## README Refresh
- Remove emojis from headings and feature bullets in `README.md`.
- Reframe README as a developer tool document: problem statement, core workflow, current capabilities, configuration files, validator behavior, safety model, known limitations, and run/build commands.
- Be explicit that Envie is local-first and currently not a team secrets manager.
- Document that validators are real network checks and that unsupported services should use generic HTTP until a dedicated validator exists.

## Test Plan
- Load a project with existing `.env.local`; confirm `.envie/config.json` and `.envie/schema.json` are created without corrupting values.
- Apply changes and verify the diff modal shows accurate before/after content before writing.
- Confirm apply creates a timestamped snapshot and the target env file is written only after confirmation.
- Verify validator results for reachable TCP, unreachable TCP, generic HTTP success, HTTP auth failure, and malformed URL.
- Verify non-TCP validators no longer return mocked success.
- Confirm README contains no emoji characters in headings or feature labels.
- Run `npm start` and manually verify project load, drawer editing, sync modal, apply diff, and validation status rendering.

## Assumptions
- Use `.envie/schema.json` as the first schema source of truth.
- Use registry modules for validator growth.
- Keep the app vanilla Electron/JS/CSS; do not add React, shadcn, or Magic UI as dependencies for this pass.
- Skip import/export expansion, secret-leak detection, and team/cloud workflows for now.
