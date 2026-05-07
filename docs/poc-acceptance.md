# Phase 2 POC — manual acceptance script

This is the human-driven test that proves Phase 2 is done. Per PRD §8.8, it must pass end-to-end on at least one dev org before tagging `phase-2-poc-complete`.

## Prerequisites

- [ ] Local checkout (cloud sandbox cannot run Electron — see PRD §7 cloud caveat).
- [ ] Connected App configured per `docs/connected-app-setup.md`. Salesforce has propagated (5-10 min after save).
- [ ] `.env.local` populated:
  ```
  SF_CLIENT_ID=...
  SF_CLIENT_SECRET=...
  SF_API_VERSION=66.0
  SF_OAUTH_REDIRECT_PORT=1717
  ```
- [ ] `yarn install` (no `--ignore-scripts` locally — let `electron-rebuild` run) succeeds.
- [ ] `yarn workspace soql-manager tsc --noEmit -p tsconfig.json` exits 0 (Phase 2 hard gate; was deferred in cloud).
- [ ] `yarn test:unit` exits 0 (back on the gate stack now that Electron-rebuilt natives are available).
- [ ] `yarn bks:build` produces an Electron bundle.

## Acceptance run

Run from a fresh shell. `yarn bks:dev` opens the SOQL Manager window.

### Step 1 — App launches

- [ ] Window title reads **"SOQL Manager"** (PRD §1.6 done-when).
- [ ] No console errors referencing missing modules (`Cannot find module 'pg'`, `Cannot find module 'sql-formatter'`, etc.).
- [ ] Connection Manager dialog is visible. The dialect picker / form should show **only** Salesforce (PRD §1.5 done-when).

### Step 2 — Create a connection

- [ ] Click **New Connection**.
- [ ] Form fields visible: **Connection name** (text) and **My Domain URL** (text). No host/port/database/username/password. PRD §2.3.
- [ ] Enter:
  - Connection name: `Dev Org`
  - My Domain URL: `https://<your-domain>.my.salesforce.com` (your dev org's My Domain — find it under Setup → My Domain).
- [ ] Click **Save**. The connection appears in the saved-connections list, gray dot (not connected).

### Step 3 — Validation behaviour

- [ ] Edit the saved connection.
- [ ] Change My Domain URL to `not-a-url` and try to save. Inline validation error appears (the dialog stays open). PRD §2.4a `invalid_url` kind.
- [ ] Restore valid URL and save.

### Step 4 — Connect (first time, full OAuth)

- [ ] Click **Connect** on the saved connection.
- [ ] System browser opens to the Salesforce login page. URL should match `https://<your-domain>.my.salesforce.com/services/oauth2/authorize?...`.
- [ ] Log in. Salesforce shows the consent screen ("SOQL Manager wants access to your data"). Click **Allow**.
- [ ] Browser redirects to `http://localhost:1717/oauth/callback?code=...`. Page renders **"You can close this tab"**.
- [ ] SOQL Manager window updates: green dot on the saved connection, "Connected to <orgId>" indicator visible somewhere in the chrome.

### Step 5 — sObject list

- [ ] Left sidebar's Entities Explorer populates within ~5 seconds.
- [ ] List is **alphabetical**.
- [ ] Standard sObjects (Account, Contact, Opportunity, etc.) are visually distinguishable from custom (`Foo__c`) — different icon, badge, or color. PRD §2.6.
- [ ] Count roughly matches what `https://<your-domain>.my.salesforce.com/services/data/v66.0/sobjects` returns in the browser (filtered to `queryable === true`). Expect 200-400 sObjects on a clean dev org, more on a populated one.
- [ ] Clicking an sObject does nothing (selection state OK; no panel opens — intentional, see PRD §2.6).

### Step 6 — Disconnect

- [ ] Right-click the saved connection → **Disconnect**.
- [ ] Sidebar clears.
- [ ] Saved connection still listed (gray dot).

### Step 7 — Reconnect (refresh-token path)

- [ ] Click **Connect** on the saved connection.
- [ ] **No browser opens.** jsforce silently refreshes via the stored refresh token.
- [ ] Sidebar repopulates within ~2 seconds. PRD §2.7 done-when.

### Step 8 — Quit + reopen

- [ ] Quit SOQL Manager. Reopen.
- [ ] App launches with no auto-connect (PRD §2.7: "do not auto-connect").
- [ ] Click **Connect** on the saved connection.
- [ ] **No browser** (refresh token still valid). Sidebar populates.

### Step 9 — Edit + reconnect

- [ ] Right-click → **Edit**. Change name from `Dev Org` to `Dev Org (renamed)`. Save.
- [ ] Reconnect still works (no browser).

### Step 10 — Delete

- [ ] Right-click → **Delete**. Confirm.
- [ ] Saved row removed from the list.
- [ ] Inspect the app DB to confirm the `token_cache` row is gone:
  ```bash
  sqlite3 ~/.config/SOQL\ Manager/database.sqlite \
    "SELECT count(*) FROM token_cache WHERE name LIKE 'sf:%';"
  ```
  Should return `0`. (Path varies per OS; this is the Linux default. On macOS: `~/Library/Application\ Support/SOQL\ Manager/`. On Windows: `%APPDATA%\SOQL Manager\`.)

### Step 11 — Sandbox round-trip

PRD §11 Q5 calls this out: confirm sandbox login works before declaring Phase 2 done.

- [ ] Repeat steps 2-5 against a **sandbox** My Domain URL (`https://<sandbox>.sandbox.my.salesforce.com`). Note: sandbox needs its **own** Connected App per `docs/connected-app-setup.md` "Sandbox and scratch orgs".
- [ ] All steps should pass identically.

### Step 12 — Port-conflict failure mode

PRD §10 fixed-port decision; PRD §2.4a `port_in_use` kind.

- [ ] Quit SOQL Manager.
- [ ] Hold port 1717 with another process (in another terminal):
  ```bash
  python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',1717)); s.listen(); input('press enter to release')"
  ```
- [ ] Reopen SOQL Manager. Click **Connect** on the saved org.
- [ ] **Modal error appears**: "Port 1717 is in use, likely by another Salesforce tool. Close it (e.g., `sf` CLI) and retry."
- [ ] Release port 1717 (press Enter in the terminal). Click **Connect** again. OAuth round-trip succeeds.

### Step 13 — User-cancelled login

PRD §2.4a `user_denied` kind.

- [ ] Quit + reopen SOQL Manager.
- [ ] Click **Connect**. Browser opens.
- [ ] On the consent screen, click **Deny** instead of Allow.
- [ ] Browser redirects to `http://localhost:1717/oauth/callback?error=access_denied&...`.
- [ ] SOQL Manager shows toast: "Login cancelled."
- [ ] Connection dialog stays open (or saved connection stays gray-dot). User can retry without restarting.

## If all 13 steps pass

Tag the commit `phase-2-poc-complete` and push:

```bash
git tag phase-2-poc-complete -m "Phase 2 POC complete; manual acceptance script passes."
git push --tags
```

## If any step fails

Halt. Capture the failure mode in `docs/blockers/<utc-timestamp>.md` per the Ralph brief, with the exact step that failed plus relevant logs (Salesforce error body, dev console, app log under `~/.config/SOQL Manager/logs/` or platform equivalent).

Common failure-mode shortcut: re-read `docs/connected-app-setup.md` "Common pitfalls". Most acceptance failures trace back to Connected App propagation timing or callback URL mismatches.
