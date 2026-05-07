# Phase 2 POC — explicitly deferred

What the POC **doesn't** do, and why. Tracking these so the next milestone has a definite scope.

## OAuth error handlers

The error contract (`apps/studio/src/lib/sf/errors.ts`, Task 2.4a) names seven kinds. Phase 2 POC implements four; the others are typed but bucketed into `unknown` until a later milestone.

| Kind | POC handling | Future scope |
|---|---|---|
| `invalid_url` | ✅ Implemented. Form validation error inline in the dialog. Never reaches OAuth code. |
| `user_denied` | ✅ Implemented. Toast: "Login cancelled." Dialog stays open, user can retry. |
| `port_in_use` | ✅ Implemented. Modal error: "Port 1717 is in use, likely by another Salesforce tool. Close it (e.g., `sf` CLI) and retry." No auto-fallback. |
| `unknown` | ✅ Implemented. Catch-all. Toast: "Connection failed: <message>." Full error to dev console. No auto-retry. |
| `token_invalid` | ⏸ Deferred. jsforce auto-refreshes on 401; if refresh also fails, currently bucketed into `unknown`. **Future:** trigger a silent re-auth attempt, fall back to full OAuth dialog. |
| `token_revoked` | ⏸ Deferred. Salesforce returns `invalid_grant` from the refresh endpoint when an admin has revoked. **Future:** detect, surface "Your session was revoked. Please reconnect.", trigger fresh OAuth. |
| `network` | ⏸ Deferred. Bucketed into `unknown` for POC. **Future:** retry-with-backoff on transient network errors during OAuth and describe calls. |

The contract design lets these drop in as new branches in the existing `switch` statements, no rewrite of call sites.

## Functionality not in POC at all

These are out of Phase 2 scope per PRD §4 "Non-goals":

| Area | Phase | Notes |
|---|---|---|
| SOQL execution | 3 | Editor pane stays inert in Phase 2. |
| SOQL syntax highlighting / completion | 3 | CodeMirror frame stays; SQL mode kept until SOQL mode lands. |
| Result grid rendering of SF query results | 3 | Field-type-aware rendering needs decisions we haven't made. |
| Inline edit of SF records | 3+ | Where the API allows — not all sObjects are updatable. |
| Query history persisted against SF | 3 | Existing `used_query` model is reusable. |
| Saved queries | 3 | `favorite_query` model is reusable. |
| Multi-org tabs | 3 (PRD Q2) | Phase 2 supports one active connection at a time. |
| Tooling API (Apex, triggers, metadata) | 3+ (PRD Q6) | jsforce supports it; UI surface not designed. |
| Bulk API | 3+ | For large query results. |
| Export to CSV / JSON / Excel | 3+ | Re-introducing export pipelines (cleanly cleansed in Phase 1). |
| sObject grouping / search in tree | 3 | Phase 2 ships a flat alphabetical list (PRD §2.6). |
| Field display when sObject clicked | 3 | Selection-state only in Phase 2. |
| Per-org query tabs | 3 | Tabs persist globally, not per connection. |

## Security / hardening

| Item | Phase | Notes |
|---|---|---|
| OS keychain storage (keytar / safeStorage) | Hardening pass before non-dev release (PRD Q1) | Phase 2 reuses Beekeeper's existing encrypted app DB. The encryption is real but the key derivation is reachable to anyone with filesystem access. Honest "Security and Privacy" disclaimer in `FORK_NOTICE.md`. |
| PKCE for OAuth | Future | Connected App setup leaves PKCE off for POC simplicity. Tightening it is a Connected App config change, not a code change. |
| Refresh-token rotation | Future | jsforce handles refresh; we're not implementing rotation logic. |
| Connected App distribution model | 3 (PRD Q3) | Where do `SF_CLIENT_ID` / `SF_CLIENT_SECRET` come from in a packaged release? Resolve before first non-dev distribution. |

## Tooling / dev experience

| Item | Phase | Notes |
|---|---|---|
| `tsc --noEmit` as a hard gate | end of Phase 1 / 2 | Currently red on baseline. Was 274 errors at fork time; should drop sharply post-cleanse — re-measure when local. |
| ESLint rebuild (real config + modern eslint) | Future | `yarn workspace soql-manager lint` is currently a vacuous pass (EOL ESLint v6, no config). Adopting a real lint config is out of Phase 1/2 scope. |
| Telemetry / crash reporting | Future | None in Phase 1/2. Crash reporting (Sentry-style) is a deferred decision, not auto-on. |
| Auto-update channel | 3+ | electron-builder is wired for it; SOQL Manager needs its own update server. |
| Icons, splash, theming | 3 | Phase 1.6 was rebrand surface only (name, productName, appId, window title). |

## Beekeeper Cloud / Ultimate

Removed in Phase 1 cleanse (Cloud) or left untouched (Ultimate license code). Not coming back unless we change the commercial-intent stance, which the PRD currently locks at "no commercial intent, GPLv3 inherited."

| Item | Status |
|---|---|
| Beekeeper Cloud workspace integration | Deleted in Task 1.3. Cloud client stub preserved only because LicenseModule (Ultimate, untouched per anti-goal §4) imports `CloudError`. |
| Beekeeper Ultimate license features | Untouched. License flow degrades to community mode at runtime since the cloud-side license check fails (the stub always rejects). |

## Vestigial code from Phase 1

| Item | Why kept | When to clean |
|---|---|---|
| `host`, `port`, `socketPath`, `sshHost`, `sshKeyfile`, `sshBastionHost`, `azureAuthOptions`, `iamAuthOptions`, etc. columns on `saved_connection` | Dropping columns in SQLite is fragile (SQLite added column drop in 3.35.0; TypeORM support is patchy). The columns are dead but storage cost is trivial. | Future cleanup pass. Drop together with a `CREATE TABLE … SELECT … DROP … RENAME` migration. |
| `BasicDatabaseClient`, `BaseV1DatabaseClient`, `CommandClient` | Phase 2 SfClient extends `BasicDatabaseClient`. Most methods unreachable. | Phase 2 Task 2.4 may rewrite the base. If unused after that, delete. |
| `xlsx-stub` package + `xlsx` dep | Was needed before Task 1.3 deleted call sites. | Phase 1 polish commit removed both. |
| `repository` field in root `package.json` pointing at upstream | Cosmetic. | When SOQL Manager has its own published distribution. |

## Items I want to revisit in Phase 2 review

- Whether `SfConnectionManager` should expose `connection.tooling` separately or unify (PRD Q6). Default in PRD is "separate now, since `connection.tooling` is a first-class jsforce concept" — confirm during Task 2.4.
- Whether the refresh-token persistence path actually round-trips correctly across an app quit. The acceptance script (Step 8) tests this; if it fails, reconsider whether to extend `saved_connection` directly with tokens (rather than the current `token_cache` reuse).
- Whether jsforce v3's typing matches what we expect in `oauth.ts` and `SfConnectionManager.ts`. Cloud sandbox can't run the typecheck against installed jsforce types; first thing to verify locally.
