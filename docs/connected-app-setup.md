# Salesforce Connected App setup

You need a **Connected App** in a dev org before SOQL Manager can authenticate against it. This is a one-time setup per org.

## Prerequisites

- A Salesforce dev org. Free at <https://developer.salesforce.com/signup> if you don't have one.
- System Administrator profile (or another profile that can create Connected Apps).

## Steps

### 1. Open the Connected App setup screen

1. Log into your dev org as an admin.
2. **Setup** (gear icon, top right) → **Setup**.
3. In the Quick Find box, type `App Manager` and click **App Manager**.
4. Click **New Connected App** (top right).

### 2. Basic information

| Field | Value |
|---|---|
| Connected App Name | `SOQL Manager` (or whatever you want — informational only). |
| API Name | `SOQL_Manager` (auto-fills from name). |
| Contact Email | Your email. |

Leave the rest blank.

### 3. API (Enable OAuth Settings)

Tick **Enable OAuth Settings**, then fill in:

| Field | Value |
|---|---|
| Callback URL | `http://localhost:1717/oauth/callback` (must be exact — port 1717 matches the `sf` CLI; PRD §6 fixed-port decision). |
| Selected OAuth Scopes | Move these three from Available to Selected: <ul><li>**Manage user data via APIs (api)**</li><li>**Perform requests at any time (refresh_token, offline_access)**</li></ul> Note: the second one is a single scope that grants both `refresh_token` and `offline_access` — no separate item. |
| Require Secret for Web Server Flow | ✅ tick. |
| Require Secret for Refresh Token Flow | ✅ tick. |
| Require Proof Key for Code Exchange (PKCE) | leave unticked for the POC; can tighten later. |

Leave everything else default.

### 4. Save and wait

Click **Save**. Salesforce shows a notice that says *"Allow from 2-10 minutes for your changes to take effect on the server before using the connected app."* Take this seriously — the OAuth endpoints will return cryptic errors during the propagation window.

### 5. Capture credentials

Back on the Connected App detail page:

1. Click **Manage Consumer Details** (you may need to MFA confirm).
2. Copy:
   - **Consumer Key** → `SF_CLIENT_ID` in your `.env.local`.
   - **Consumer Secret** → `SF_CLIENT_SECRET` in your `.env.local`.

### 6. (Recommended) Loosen the IP and refresh-token policies for dev

By default, Connected Apps require IP relaxation and may revoke refresh tokens aggressively. For a dev workflow:

1. In the Connected App detail page, click **Manage** (top of page).
2. Click **Edit Policies**.
3. Set **IP Relaxation** to `Relax IP restrictions`.
4. Set **Refresh Token Policy** to `Refresh token is valid until revoked`.
5. Save.

These settings make the dev experience smoother. Production deployments would want stricter policies.

## Verify

Once you've populated `.env.local` and Salesforce has finished propagating (5-ish minutes after save), the `yarn bks:dev` smoke test in PRD Task 2.8 should be able to round-trip OAuth. The first attempt within the propagation window will fail with `invalid_client_id` even with correct values — wait and retry.

## Common pitfalls

| Symptom | Likely cause |
|---|---|
| `invalid_client_id` immediately after save | Salesforce is still propagating. Wait 5-10 min and retry. |
| `redirect_uri_mismatch` | Callback URL has a typo, wrong port (must be `1717`), wrong path (must be `/oauth/callback`), or missing trailing slash mismatches. Copy/paste from this doc exactly. |
| `invalid_grant: ip restricted` | Dev org has IP whitelisting and your IP changed. Set IP Relaxation to "Relax IP restrictions" per step 6. |
| Browser opens but Salesforce shows "This page can't be reached" after login | The local listener on port 1717 didn't start (another process holds the port — `sf` CLI uses 1717 too). Close the conflicting tool and retry. PRD §10 made this fail-loudly; you'll see a `port_in_use` error in the SOQL Manager UI. |
| Connection succeeds but `listSObjects` returns empty | Wrong API version or wrong scopes. Confirm `SF_API_VERSION=66.0` (or whatever `docs/api-version.md` pins) and that the `api` scope is granted. |

## Sandbox and scratch orgs

Sandboxes and scratch orgs each have their own My Domain URL (`https://<sandboxname>.sandbox.my.salesforce.com` or similar) and need their **own** Connected App in that environment. The `SF_CLIENT_ID` / `SF_CLIENT_SECRET` are per-org. The PRD's "My Domain URL" approach in the connection dialog handles routing automatically once the right credentials are wired.

## Production note

This setup is fine for development. Distributing SOQL Manager as a binary requires:

- A **packaged Connected App** registered in a Salesforce-owned dev account, distributed via the AppExchange or as an installable URL.
- Or each user creating their own Connected App and pasting their own Consumer Key / Secret on first launch.

PRD §11 Q3 names this as a Phase 3 distribution-blocking decision.
