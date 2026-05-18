# Envie 🚀

Envie is a premium, visual-first cross-platform desktop application built using Electron, Vanilla JS, HTML, and CSS. It helps developers manage, switch, and instantly verify environment variable configurations across different stages (e.g., `local`, `test`, `dev`, `staging`, `deployment`) per project.

It solves the headache of manually editing `.env.local` files, managing copy-paste variants, and running into silent credential failures. By incorporating a **Dynamic Connection Pinging System**, Envie allows you to instantly verify whether your current environment settings can successfully connect to external databases or third-party APIs (Supabase, Clerk, Mapbox, Resend, HTTP endpoints) before running your application.

---

## 🌟 Key Features

### 📂 VS Code-Style Project Switcher
- Load any project folder dynamically.
- Remembers recently opened projects, allowing instant switching from the sidebar.
- Keeps configuration localized per project.

### 🎚️ Dynamic Segmented Sliders
- Displays a clean visual list of environment variable keys.
- Switch individual keys between active environments using visual segmented toggle controls.
- Expand cards to edit individual values for each environment and add helpful notes in place.

### 🌍 Custom Environments Manager
- Define, rename, and delete environments globally for your project (e.g., add a `staging` or `test2` stage).
- Auto-scales: Adding an environment updates all variables with placeholder values. Deleting an environment removes it clean.

### ⚡ Batch Action & Manual Sync Verification
- **Sync Workspace**: A dedicated manual verification trigger that asserts full workspace integrity, checks for file configuration mismatches, re-scans for target files, and enforces `.gitignore` protections.
- **Apply to `.env.local`**: Compile current selections and write immediately to your local `.env.local`.
- **Global Preset Switcher**: Switch all keys to a targeted environment (e.g., "Set all to test") in a single click.
- **Copy Env**: Copy compiled `.env` syntax directly to the clipboard.

### 🛡️ Secure by Design & Auto-Masking
- Sensitive keys containing `KEY`, `SECRET`, `PASSWORD`, `TOKEN`, `URL` are automatically masked (`••••••••`).
- Full visual eye-toggle to unmask and copy.
- Run locally with native context-isolated IPC bindings to prevent cross-site scripting risks.

### 🟢 Dynamic & Scalable Connection Pinging
- Zero hardcoded integrations! Connection validation rules are stored per-key and completely customisable.
- Smart auto-heuristics classify variables upon load.
- **Live Health Status Indicators**:
  - 🟢 **Green (Connected)**: Service is reachable and API credentials are verified.
  - 🟡 **Yellow (Testing)**: Pinging the service in the background.
  - 🟠 **Orange (Auth Error)**: The service is online and reachable, but the credentials (API Key) are rejected. Excellent for catching credentials typos.
  - 🔴 **Red (Unreachable)**: DNS resolution failure, connection timeout, or closed port.
  - ⚪ **Gray (Untested)**: Manual check pending or untested variable.

---

## 🛠️ Dynamic Verification Engine

Envie contains built-in dynamic connection validators executing in a secure Node.js sandbox:

| Connection Type | How It Works |
| :--- | :--- |
| **TCP Database Port** | Parses URLs like `postgresql://` or `mysql://`, extracts hostname and port, and attempts a raw TCP socket connection via `net.connect`. Fast, lightweight, and works for MySQL, Redis, Mongo, Postgres, etc. without third-party client packages. |
| **Clerk Auth Check** | Base64-decodes the publishable key (`pk_test_...` or `pk_live_...`), extracts the instance frontend API domain, and queries its frontend API gateway to verify live reachability. |
| **Supabase Client Check** | Queries the project's REST gateway `URL/rest/v1/` with the active API key to verify whether the key is authorized (200) or rejected (401/403). |
| **Mapbox Check** | Validates access tokens directly by hitting the Mapbox API path with the token to assert authorization. |
| **Resend Check** | Queries official Resend domain routes with Bearer authentication headers to confirm credential health. |
| **HTTP/REST Ping** | Performs generic standard fetch HEAD/GET checks on API endpoints. |

---

## 📂 Configuration Schemas

### 1. Per-Project Local Schema (`.envie/config.json`)
Saved inside the hidden `.envie` directory in your project's root folder.

```json
{
  "environments": ["local", "test", "staging", "deployment"],
  "keys": {
    "DATABASE_URL": {
      "values": {
        "local": "postgresql://postgres:postgres@localhost:5432/my_db",
        "test": "postgresql://postgres:postgres@test-db.internal:5432/my_db"
      },
      "active": "local",
      "validation": {
        "type": "tcp"
      }
    },
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": {
      "values": {
        "local": "pk_test_c2VjdXJlLW1hcm1vc2V0LTgyLmNsZXJrLmFjY291bnRzLmRldiQ",
        "deployment": "pk_live_Y2xlcmsuYWNjdW50cy5kZXYk"
      },
      "active": "local",
      "validation": {
        "type": "clerk"
      }
    }
  }
}
```

### 2. Global Settings Schema (`envie-global-config.json`)
Saved in the standard Electron user-data path.

```json
{
  "recentProjects": [
    "C:\\Users\\dev\\Desktop\\my-next-app",
    "C:\\Users\\dev\\Desktop\\supabase-backend"
  ],
  "activeProjectPath": "C:\\Users\\dev\\Desktop\\my-next-app"
}
```

---

## 🚀 How to Run

1. Clone or navigate to the repository directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the Electron application:
   ```bash
   npm start
   ```

---

## 📝 License

This project is licensed under the ISC License.
