# SOQL Manager — PRD & Phase 1 Spec

**Document type:** Product requirements + executable build spec
**Audience:** Claude Code Ralph loop (primary), human reviewers (secondary)
**Status:** Draft v0.4
**Last updated:** 2026-05-07

### Decisions baked in (v0.4)

- Stack inherited from upstream Beekeeper Studio community edition (Electron + Vue + TypeScript). Fork already exists in user's GitHub org, forked from upstream `main`.
- License: GPLv3 inherited from upstream. No commercial intent for SOQL Manager.
- Salesforce client library: **jsforce**.
- Auth: OAuth 2.0 Web Server flow. **My Domain URL** input field (handles production, sandbox, and scratch orgs uniformly).
- Loopback redirect: hardcoded **port 1717** (matches `sf` CLI). On `EADDRINUSE`, **fail loudly** — no auto-fallback.
- Credential storage: reuse Beekeeper's existing encrypted local app DB. **Tokens stored in `token_cache` (encrypted JSON blob, reused as-is); non-secret post-auth metadata on `saved_connection`. Decision locked at Task 1.1 review v0.4 — see Task 2.2.** OS keychain hardening deferred.
- Beekeeper Cloud workspace integration (`lib/cloud/`, `CloudCredential`, `CredentialsModule`) is **not** preserved (Task 1.1 review v0.4).
- Beekeeper Ultimate license code (`license.ts`, `LicenseKey`, `LicenseModule`, `components/license/`, `migration/ultimate/`) is left untouched per anti-goal §4 — neither extended nor deleted.
- Cleanse depth: **surgical** — gut data layer, keep UI shell + editor frame inert.
- Telemetry: **stripped** in Phase 1. Crash reporting deferred.
- POC entity tree: flat alphabetical sObject list, std/custom visually distinguishable. Long-term: feature parity with Beekeeper.
- Execution: Phase 1 cloud-friendly, Phase 2 local-recommended.
- Hard human-review gate after Task 1.1 (cleanse inventory) before any deletions.

---

## 0. How to use this document

This spec is structured for autonomous execution by a Ralph loop. Each phase contains discrete tasks. Each task has:

- **Files** — concrete paths the loop should read/edit/create
- **Done when** — observable acceptance criteria, ideally a command that exits 0
- **Notes / gotchas** — what tends to go wrong

The loop should not improvise across phase boundaries. Finish Phase 1 (cleanse) and get a green build before touching Phase 2. If a path in this doc does not exist in the current `HEAD`, the loop should run `rg -l <hint>` to find the equivalent in the fork's actual tree and update this document via PR before proceeding — do not silently skip tasks.

---

## 1. Context

Beekeeper Studio is an open-source SQL workbench (Electron + Vue 2/3 + TypeScript, GPL community edition). It has the exact UX shape we want for a Salesforce tool: a left-side entity explorer, a tabbed query editor, a result grid, a saved-connection manager, and an encrypted local app database for connection metadata.

We are forking the community edition to build **SOQL Manager**: a desktop app for working with Salesforce orgs that has the ergonomics of Beekeeper Studio but speaks Salesforce APIs instead of SQL dialects.

This spec covers **two milestones**:

1. **Phase 1 — Cleanse.** Surgically remove the SQL-specific data layer (drivers, dialects, schema introspection queries) while keeping the UI shell, connection manager, entity tree, tabs, and editor frame intact.
2. **Phase 2 — Connection POC.** Save a Salesforce OAuth connection and populate the left-side entity explorer with the org's sObjects.

Anything beyond Phase 2 (SOQL execution, result grid, autocomplete, saved queries against SF, etc.) is **out of scope** here and will be specified in subsequent docs.

---

## 2. Long-term vision (informational only)

End state: feature parity with Beekeeper Studio, but for Salesforce. That means:

- Entity explorer (sObjects, fields, relationships, indexes-as-search-layouts)
- SOQL editor with syntax highlighting + completion based on org metadata
- Result grid with field-type-aware rendering and inline edit (where API allows)
- Query history, saved queries, query tabs per connection
- Multi-org connection management (production, sandbox, scratch orgs)
- Tooling API support (Apex, triggers, metadata browse)
- Bulk API for large query results
- Export to CSV / JSON / Excel

This vision is included so the Ralph loop biases toward designs that don't paint us into a corner (e.g., don't hardcode "tables" everywhere — use neutral terms like "entities" or "objects").

---

## 3. Goals (this spec)

- **G1** A clean fork on a new branch with all SQL driver and dialect code removed.
- **G2** `yarn all:lint`, `yarn test:unit`, and `yarn bks:build` green on the cleansed codebase.
- **G3** A "New Connection" dialog that accepts an org-friendly name + My Domain URL and triggers OAuth 2.0 Web Server flow.
- **G4** Tokens persisted in Beekeeper's existing encrypted local app DB.
- **G5** On connect, the left-side Entities Explorer renders an alphabetical list of every queryable sObject in the org (standard + custom, visually distinguishable).
- **G6** Disconnect / reconnect works without restarting the app.

---

## 4. Non-goals / anti-goals

- ❌ Do **not** add SOQL execution, result rendering, or autocomplete in this milestone.
- ❌ Do **not** support username/password or JWT bearer auth in the POC.
- ❌ Do **not** replace jsforce with a hand-rolled REST client.
- ❌ Do **not** rip out the Vue editor component or CodeMirror — leave the editor pane present but inert (it will become the SOQL editor in a later milestone).
- ❌ Do **not** upgrade Electron / Vue / TypeScript versions during the cleanse. One change at a time.
- ❌ Do **not** modify Beekeeper's commercial / Ultimate **feature** code paths if they exist in the community fork — stay strictly within community scope.
  - **Carve-out:** Electron entry points (`apps/studio/src-commercial/entrypoints/{main,preload,renderer,utility}.ts`) live under `src-commercial/` for build-tooling reasons but are *not* paid-tier feature code. They are in scope for the Phase 1 rebrand (window title, app name) and for Phase 2 IPC plumbing. Anything that looks like a feature gate, license check, or Ultimate-only module is out of scope — flag in `docs/cleanse-inventory.md` and skip.
- ❌ Do **not** rebrand more than necessary in Phase 1 (icon, app name in `package.json`, window title) — full visual rebrand is later.

---

## 5. Architecture

**Stack (inherited):** Electron main + renderer, Vue, TypeScript, Vuex (or Pinia, whichever the current Beekeeper HEAD uses — verify), Yarn workspaces, Webpack/Vite (verify), CodeMirror.

**New / changed:**

- **Salesforce client:** [`jsforce`](https://jsforce.github.io/) (latest stable, pinned).
- **Auth:** OAuth 2.0 Web Server flow. Authorization endpoint derived from the user-supplied My Domain URL (`https://<mydomain>.my.salesforce.com/services/oauth2/authorize`). Local Electron HTTP listener on `http://localhost:1717/oauth/callback` receives the code; spec mandates loopback redirect on a fixed port (matches `sf` CLI convention), not a custom protocol handler, to keep the flow inspectable. If `1717` is in use, fail loudly with an actionable error — see §10 risks.
- **API version:** Pinned via the `SF_API_VERSION` env var. The latest GA Salesforce API version at fork time is captured in `docs/api-version.md` by Task 0.1. Do not hardcode or scatter version strings — read from the constant.
- **Telemetry:** None in Phase 1. All upstream Beekeeper telemetry / analytics call sites and the telemetry library itself are removed during the cleanse. Crash reporting (Sentry-style) is a deferred decision, not auto-on.
- **Credential storage:** Extend Beekeeper's existing encrypted local app DB schema (`SavedConnection` model or equivalent) with Salesforce-specific fields. **No keytar** in this milestone — accept the same security posture Beekeeper already has for its DB credentials. Flagged as Open Question §11 for hardening later.
- **Entity tree:** The same Vue component that renders tables/views/triggers in Beekeeper, repurposed to render sObjects. Source of truth becomes the SF connection rather than the SQL `getSchema()` result.

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer (Vue)                                             │
│  ┌──────────────┐   ┌────────────────────────────────────┐  │
│  │ Entity tree  │   │ Editor pane (inert in POC)         │  │
│  │ (sObjects)   │   │                                    │  │
│  │              │   │                                    │  │
│  └──────┬───────┘   └────────────────────────────────────┘  │
│         │                                                   │
│         │  IPC                                              │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│  Main (Electron)                                            │
│   SfConnectionManager  ──►  jsforce.Connection              │
│         │                                                   │
│         ▼                                                   │
│   SavedConnection store (existing encrypted SQLite)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Prerequisites

The Ralph loop should not start work until these are in place. If any are missing, halt and surface the gap.

- **6.1** GitHub fork of `beekeeper-studio/beekeeper-studio` already exists in the user's GitHub org (forked from upstream `main` at fork time — no upstream syncing in this milestone). Loop clones this fork, not upstream. The exact starting commit is recorded in `docs/upstream-pin.md` by Task 0.1 so we have a baseline if we ever need to diff against upstream.
- **6.2** Working branch created off the fork's `main`: `feat/soql-manager-phase-1-cleanse`. Loop pushes only to this branch — never to `main`.
- **6.3** A Salesforce Connected App configured in a dev org with:
  - OAuth enabled
  - Callback URL: `http://localhost:1717/oauth/callback` (single fixed port; see §10 for collision handling)
  - Scopes: `api`, `refresh_token`, `offline_access`
  - Consumer Key + Consumer Secret captured into `.env.local` (see §6.4)
- **6.4** `.env.example` committed with the variable names; `.env.local` is gitignored. Required vars:
  ```
  SF_CLIENT_ID=
  SF_CLIENT_SECRET=
  SF_API_VERSION=         # set by Task 0.1, e.g., 62.0 (latest GA at fork time)
  SF_OAUTH_REDIRECT_PORT=1717
  ```
- **6.5** Node, Yarn, and Beekeeper's documented build prerequisites installed. The fork has no `apps/studio/README.md`; treat `CLAUDE.md` at the repo root as the authoritative list of build / test / lint commands. The root `README.md` covers user-facing install steps but not dev workflow.

---

## 7. Phase 1 — SQL Code Cleanse

**Execution environment:** Phase 1 is **cloud-friendly *if* the sandbox has the right egress.** All work is deterministic, headless, terminal-driven (file deletions, dependency removal, lint/typecheck/build). No GUI required. Run in cloud sandbox or locally — both work in principle.

**Cloud caveat (added v0.3 after empirical discovery):** Beekeeper's install pipeline reaches several hosts not on the default Claude Code on the web (`cloud_default`) egress allowlist:

- `cdn.sheetjs.com` — `xlsx@0.20.3` tarball. Worked around in this fork by stubbing `xlsx` (see `.yarn/packages/xlsx-stub/`); slated for removal alongside the import/export call sites in Task 1.3.
- `www.electronjs.org` and `artifacts.electronjs.org` — Electron Node-API headers used by `electron-rebuild` during postinstall to rebuild native modules (`better-sqlite3`, `kerberos`, `mongodb-client-encryption`, `os-dns-native`) against Electron's Node ABI.

The Electron headers cannot be sourced from `github.com/electron/electron/releases` (only chromedriver, electron binaries, and libcxx headers are published there). In a sandbox without those hosts allowlisted, run install with `--ignore-scripts` and accept a **reduced gate stack** for Phase 1: `yarn all:lint`, `yarn workspace soql-manager tsc --noEmit -p tsconfig.json`, and `yarn bks:build` still apply; **`yarn test:unit` is deferred to the cloud→local handoff at the Phase 1 / Phase 2 boundary** because Jest runs under Electron and needs Electron-ABI native module builds.

This is honest about the gate-gap: Phase 1 is overwhelmingly deletions, so lint + tsc + build catch most regressions a deletion-driven phase introduces. Test coverage rejoins the gate stack when local — Phase 2 was already specced as local-recommended for OAuth reasons.

**Phase exit criteria (all must hold), all run from repo root:**

- `yarn install` clean. (Locally, no flags. In `cloud_default` sandbox, `yarn install --ignore-scripts` per the cloud caveat above.)
- `yarn workspace soql-manager lint` exits 0. (Use the workspace command directly; `yarn all:lint` references the missing `sqltools` workspace and `shared/` glob and fails. Note: lint coverage is currently zero — see `docs/build-commands.md` "Known issues".)
- `yarn workspace soql-manager tsc --noEmit -p tsconfig.json` exits 0 **on cleansed code paths**. Baseline upstream HEAD has 274 pre-existing errors mostly in DB-driver files that Phase 1 deletes. Re-enable as a hard gate at the end of Phase 1, after the cleanse files are gone.
- `yarn test:unit` exits 0 **(local only; deferred in cloud per cloud caveat)**.
- `yarn bks:build` produces an Electron bundle **(local only; deferred in cloud per cloud caveat)**. Cloud equivalent: `yarn lib:build` + `yarn workspace soql-manager build` (static compile only).
- App launches; connection manager dialog opens but offers no working connection types yet (or offers a stub "Salesforce" entry that errors gracefully).
- No references remain to: `pg`, `mysql`, `mysql2`, `sqlite3`, `mariadb`, `mssql`, `tedious`, `oracledb`, `cassandra-driver`, `bigquery`, `redis`, `mongodb`, `cockroachdb`, or any DB-dialect SQL parser. Verify with `rg` after each removal.
- **`better-sqlite3` is preserved** — it powers Beekeeper's own internal app DB (saved-connections store), which we are keeping.

### Task 0.1 — Baseline: pin upstream commit, record API version, prove green

**Goal:** Establish baseline before touching anything. Record what we're starting from so we can always recover or diff.

**Files (create):**

- `docs/upstream-pin.md` — record the current `git rev-parse HEAD` of the fork's `main`, the upstream tag (if any) it corresponds to, and the date.
- `docs/api-version.md` — record the latest GA Salesforce API version at fork time (the loop should fetch `https://<any-my-domain>.my.salesforce.com/services/data/` to confirm; pick the highest `version` value where `label` does not contain "Beta" or "Pre-release"). Update `.env.example` accordingly.

**Action:**

- Run `yarn install` and the full validation gate (`yarn all:lint`, `yarn workspace soql-manager tsc --noEmit -p tsconfig.json`, `yarn test:unit`, `yarn bks:build`) on the fork's `main` *before* creating the working branch. The loop must confirm the fork builds clean as-is. If it doesn't, halt — we don't want to spend hours chasing a "regression" that was already broken.
- Also write `docs/build-commands.md` capturing the exact gate commands the loop will use for the rest of the run, so future tasks don't paraphrase from this PRD and drift.
- Then create `feat/soql-manager-phase-1-cleanse` and proceed.

**Done when:** All three docs (`upstream-pin.md`, `api-version.md`, `build-commands.md`) committed on the working branch, every gate command exits 0 on the unmodified codebase, and the loop can quote the starting commit hash back.

**Notes:** This task is the only one in Phase 1 that should run before the inventory. Skip it and the loop loses its baseline.

### Task 1.1 — Inventory the data layer

**Goal:** Produce a written inventory of every file/module that is SQL-specific, before deleting anything.

**Files (read):**

- `apps/studio/src/lib/db/**` (all DB client code lives here in current Beekeeper)
- `apps/studio/src/common/appdb/**` (saved connection model + encrypted store)
- `apps/studio/src/store/**` (Vuex modules — look for `connection`, `database`, `tables`)
- `apps/studio/src/components/**` (anything named `*Database*`, `*Table*`, `*Sql*`, `*Query*`)
- `apps/studio/package.json` (dependency list)

**Files (create):**

- `docs/cleanse-inventory.md` — sectioned list of files grouped by: **Delete**, **Keep**, **Refactor**. Each entry has a one-line rationale.

**Done when:** `docs/cleanse-inventory.md` committed AND a human reviewer has explicitly approved the kill list. This is a **hard gate** — the loop must halt after committing the inventory and wait for human sign-off (a comment on the commit, an issue update, or a chat reply — pick one mechanism and document it). The loop must not begin Task 1.2 until that approval lands. Cheap insurance against deleting something subtle.

**Notes:** Do not delete anything in this task. This is the map.

### Task 1.2 — Remove DB driver dependencies

**Goal:** Strip database driver packages from `package.json` and `yarn.lock`.

**Files:** `apps/studio/package.json`, `package.json` (root), `yarn.lock`.

**🚨 DO NOT REMOVE — explicit keep list:**

- `better-sqlite3` — powers Beekeeper's *own* encrypted local app DB (the SavedConnection store). Removing it bricks the entire connection-management UI. The loop must keep this in `dependencies` and verify it's still listed after this task completes.
- Any other package the inventory in Task 1.1 flagged as part of the **app DB layer** (TypeORM, encryption helper, migration runner). The Salesforce connection metadata + tokens we add in Phase 2 will be persisted via this exact stack — preserve it.
- The CodeMirror editor and any of its language-mode dependencies. Editor pane stays inert in this milestone but is reused for SOQL in a later phase.

**Action:**

- Remove from `dependencies` and `devDependencies`: `pg`, `pg-hstore`, `mysql2`, `mysql`, `mariadb`, `sqlite3`, `oracledb`, `tedious`, `mssql`, `cassandra-driver`, `@google-cloud/bigquery`, `redis`, `ioredis`, `mongodb`, `cockroachdb`, `duckdb`, plus any `*-driver`, `*-parser`, `node-sql-parser`, `sql-formatter` (verify before removing — the editor may use formatters). When in doubt, list it in `docs/cleanse-inventory.md` under "Refactor" and skip for now.
- **Note the conspicuous absence of `better-sqlite3` from the removal list.** A reflexive `rg "sqlite"` will hit `better-sqlite3` — the loop must filter it out.
- Run `yarn install` after removals.

**Done when:**

- `yarn install` succeeds.
- `rg "\"(pg|mysql2|sqlite3|tedious|oracledb|mssql)\":" package.json apps/studio/package.json` returns nothing.
- `rg "\"better-sqlite3\":" apps/studio/package.json` returns exactly one match (preserved).
- `node -e "require('better-sqlite3')"` exits 0 (proves the native module still installs and links).

**Gotcha:** Some of these are transitive deps of legitimate packages. Don't add `resolutions` overrides; if a dep can't be removed without breaking install, document why and move on.

### Task 1.3 — Delete SQL client implementations

**Goal:** Remove dialect-specific code under `apps/studio/src/lib/db/clients/`.

**Files:**

- `apps/studio/src/lib/db/clients/postgresql.ts` (and its tests)
- `apps/studio/src/lib/db/clients/mysql.ts`
- `apps/studio/src/lib/db/clients/sqlite.ts`
- `apps/studio/src/lib/db/clients/sqlserver.ts`
- `apps/studio/src/lib/db/clients/oracle.ts`
- … and every other file in `clients/` except a base interface if one exists.

**Action:**

- Delete the files.
- In `apps/studio/src/lib/db/client.ts` (or whatever the factory is), keep the interface/type definition for `IDbConnection` (or whatever it's called in the fork) but remove all imports of deleted files. The factory should currently throw `NotImplemented` for every connection type — that's expected after this task.

**Done when:** `rg -l "from '\\./clients/(postgresql|mysql|sqlite|sqlserver|oracle)'"` returns nothing under `apps/studio/src/`.

### Task 1.4 — Strip SQL dialect / introspection / migration code

**Files (delete):**

- Per-dialect SQL parsers / formatters (`sql-formatter`, `sql-query-identifier` packages — Task 1.1 confirmed Delete). Keep the editor's CodeMirror SQL mode for now — that's a UI concern, not a data-layer concern; we'll swap it for a SOQL mode later.
- Per-dialect schema introspection queries (`SHOW TABLES`, `pg_catalog.*`, etc.) wherever they survive in non-deleted files.
- ~~`apps/studio/src/lib/db/migration/` per-dialect migrations~~ — **Dropped per Task 1.1 review.** That directory does not exist in this fork. App DB migrations live at `apps/studio/src/migration/` and are schema-only (not dialect-specific). They are append-only history and stay untouched; new SF migration lands on top in Task 2.2.

**Done when:** `rg -i "pg_catalog|information_schema|sqlite_master|sys\\.tables" apps/studio/src` returns nothing.

### Task 1.5 — Repurpose connection types

**Goal:** Replace the enum / union of supported connection types with a single `salesforce` value.

**Files:**

- `apps/studio/src/common/appdb/models/SavedConnection.ts` (or wherever the connection-type enum lives — find with `rg "connectionType|ConnectionType"`).
- Any UI surfacing the type (connection dialog, connection list).

**Action:**

- Replace the enum with `type ConnectionType = 'salesforce'`.
- Migrate / drop the local app DB schema if necessary. Beekeeper uses TypeORM-style migrations under `apps/studio/src/common/appdb/migration/` — add a new migration that drops the legacy connection rows or renames the column, do not silently break existing user installs (we won't have any in dev, but doing it right now is cheap).

**Done when:** `grep -r "postgres\\|mysql\\|sqlite\\|sqlserver" apps/studio/src/common/appdb/` matches only in migration history files.

### Task 1.6 — Rebrand surface-level identifiers

**Goal:** Light rebrand to make it obvious this is the fork. Do **not** redo icons, splash screens, or theming.

**Files:**

- `apps/studio/package.json` — `name`, `productName`, `description`.
- Root `package.json` — `name`.
- `apps/studio/src-commercial/entrypoints/main.ts` — Electron `BrowserWindow` title. (Entry points live under `src-commercial/` for build reasons; covered by the §4 carve-out.)
- `apps/studio/electron-builder-config.js` — `appId`, `productName`. (There is no `electron-builder.yml`; config is JS.)

**Suggested values:**

```
name: "soql-manager"
productName: "SOQL Manager"
description: "Salesforce workbench, forked from Beekeeper Studio."
appId: "io.soqlmanager.app"
```

**Do not change** any LICENSE / NOTICE files. Beekeeper community edition is GPL — preserve attribution and add a `FORK_NOTICE.md` at repo root crediting the upstream project.

**Done when:** `yarn bks:dev` launches an Electron window titled "SOQL Manager".

### Task 1.7 — Verify Phase 1

**Goal:** Prove the cleanse is complete and the app still boots.

**Commands the loop should run (from repo root):**

```bash
yarn install
yarn all:lint
yarn workspace soql-manager tsc --noEmit -p tsconfig.json   # ad-hoc type gate; no typecheck script exists
yarn test:unit
yarn bks:build
```

**Manual smoke test (loop should describe expected screenshot, then halt for human):**

- `yarn bks:dev` launches the app.
- Connection manager dialog opens.
- Either no connection types are offered, or a single placeholder "Salesforce (coming soon)" entry exists that does nothing.
- No console errors referencing missing modules (`Cannot find module 'pg'`, etc.).

**Phase 1 is done when** all five commands above exit 0 and the smoke test passes. **Tag the commit `phase-1-cleanse-complete`.**

---

## 8. Phase 2 — Salesforce Connection POC

**Execution environment:** Phase 2 is **local-recommended**. The OAuth round-trip needs a real browser; the Electron window needs to render for the manual smoke tests in §8.8. Cloud sandboxes are typically headless and will halt frequently for human OAuth steps. If you must run in cloud, expect to do every Connect through a tunneled browser session and to verify the entity tree by screenshot rather than direct interaction. After Phase 1 tag (`phase-1-cleanse-complete`), `git pull` to a local checkout and run Phase 2 from your laptop.

**Phase exit criteria:**

- User can create a new Salesforce connection in the Connection Manager: name + My Domain URL.
- Clicking "Connect" launches OAuth in the system browser, returns to a local callback, exchanges code for tokens, and persists them.
- Reopening the app and double-clicking the saved connection re-authenticates silently via refresh token.
- Once connected, the left Entities Explorer renders an alphabetical list of every queryable sObject in the org. Standard and custom objects are visually distinguishable (icon, badge, or color — implementation choice).
- Disconnect button clears the active connection without deleting the saved record.

### Task 2.1 — Add jsforce

**Files:** `apps/studio/package.json`.

**Action:** Add `jsforce` (latest stable) to `dependencies`. Add `@types/jsforce` if needed (jsforce ships its own types in recent versions — verify).

**Done when:** `import * as jsforce from 'jsforce'` typechecks in a scratch file that the loop then deletes.

### Task 2.2 — Extend appdb schema for SF (saved_connection + token_cache)

**Architecture (locked at Task 1.1 review v0.4):** secrets and metadata are stored in different tables.

- `saved_connection` holds the user-entered connection definition + non-secret post-auth metadata. One row per saved org.
- `token_cache` holds the encrypted tokens. Reused as-is — its existing schema (`homeId`, `cache`, `name`) is generic enough; SF tokens are serialised as a JSON blob into the `cache` column. One row per saved org, keyed by `saved_connection.id`.

**Files:**

- `apps/studio/src/common/appdb/models/saved_connection.ts` — extend.
- `apps/studio/src/common/appdb/models/token_cache.ts` — keep as-is, add a thin SF-specific wrapper helper somewhere appropriate (e.g. `apps/studio/src/lib/sf/tokenStore.ts` created in this task).
- A new migration file under `apps/studio/src/migration/` (match existing naming convention — `YYYYMMDD_<description>.js`).

**Schema changes**

`saved_connection` adds:

| Field | Type | Notes |
|---|---|---|
| `myDomainUrl` | string | e.g. `https://acme-dev-ed.develop.my.salesforce.com`. Required. |
| `instanceUrl` | string | Populated post-auth from token response. Nullable until first auth. |
| `userId` | string | From token introspection. Nullable until first auth. |
| `orgId` | string | From token introspection. Nullable until first auth. |
| `tokenCacheId` | number (FK) | Foreign key to `token_cache.id`. Nullable until first auth (no tokens yet for save-without-auth). |

`token_cache` reused without schema changes. SF rows use:

- `homeId` — set to `"sf:" + savedConnectionId` (encrypted via existing transformer).
- `cache` — encrypted JSON blob `{ accessToken, refreshToken, tokenIssuedAt, signature?: string }`.
- `name` — human-readable label like `"sf:" + orgId` (set post-auth; helpful for debugging).

**Helper**: create `apps/studio/src/lib/sf/tokenStore.ts` with a small typed API:

```typescript
type SfTokenBlob = {
  accessToken: string;
  refreshToken: string;
  tokenIssuedAt: number;  // unix ms
  signature?: string;     // from Salesforce id_token if available
};

async function readTokens(savedConnectionId: number): Promise<SfTokenBlob | null>;
async function writeTokens(savedConnectionId: number, tokens: SfTokenBlob): Promise<number>;  // returns tokenCacheId
async function clearTokens(savedConnectionId: number): Promise<void>;
```

This keeps JSON-blob marshalling and the FK update in one place; callers (`SfConnectionManager`) never touch `token_cache` directly.

**Done when:** Migration runs cleanly on a fresh install and on a dev install that already has the legacy schema. `tokenStore.ts` round-trips tokens via the existing `EncryptTransformer`. No new crypto path is introduced.

**Gotcha:** Tokens are sensitive. Reuse Beekeeper's existing encryption helper at `apps/studio/src/common/appdb/transformers/Transformers.ts` (`EncryptTransformer`). Do not invent a new crypto path. Per-row encryption already covers `token_cache.homeId` and `token_cache.cache` — no double-encryption needed for the JSON blob.

**Why this split rather than putting tokens on `saved_connection`:** keeps the rotating-state column out of the connection definition (cleaner audit / diff), reuses an existing encrypted-storage table without schema migration on its side, and makes it possible to clear tokens (logout) by deleting just the `token_cache` row without touching the user's saved connection.

### Task 2.3 — Connection dialog UI

**Files:**

- The Vue component for the New / Edit Connection dialog. Find with `rg -l "connection.*dialog|NewConnection|ConnectionForm"` under `apps/studio/src/components/`.

**Action:**

- Replace the existing host/port/database/username/password fields with:
  - **Connection name** (text, required, unique within the saved-connections list)
  - **My Domain URL** (text, required, validated against a permissive regex: `^https://[a-z0-9-]+(\\.[a-z0-9-]+)*\\.salesforce\\.com$` — accept both `*.my.salesforce.com` and `*.develop.my.salesforce.com` and bare `*.salesforce.com` for legacy orgs)
- Add a **"Connect"** button that triggers Task 2.5.
- Add a **"Save"** button that persists without authenticating (so users can pre-create entries).

**Done when:** Dialog renders, validation fires on bad URLs, save persists a row with no tokens, "Connect" wires through to Task 2.5.

### Task 2.4 — OAuth 2.0 Web Server flow — main process

**Files (create):**

- `apps/studio/src/lib/sf/oauth.ts`
- `apps/studio/src/lib/sf/SfConnectionManager.ts`

**`oauth.ts` responsibilities:**

- Build authorization URL: `<myDomainUrl>/services/oauth2/authorize?response_type=code&client_id=${SF_CLIENT_ID}&redirect_uri=${REDIRECT}&scope=api%20refresh_token%20offline_access&prompt=login`
- Spin up a local HTTP listener on `process.env.SF_OAUTH_REDIRECT_PORT` (default `1717`). Bind only to `127.0.0.1`.
- Open the auth URL in the user's default browser via Electron's `shell.openExternal`.
- Receive the code on `/oauth/callback`, render a minimal HTML "You can close this tab" response, then close the listener.
- Exchange the code for tokens at `<myDomainUrl>/services/oauth2/token` (POST, `grant_type=authorization_code`).
- Return `{ accessToken, refreshToken, instanceUrl, id, issuedAt, signature }`.

**`SfConnectionManager.ts` responsibilities:**

- Wraps a `jsforce.Connection` keyed by `SavedConnection.id`.
- On first connect: calls `oauth.ts`, persists tokens via `SavedConnection.update()`.
- On reconnect: instantiates `new jsforce.Connection({ instanceUrl, accessToken, refreshToken, oauth2: { clientId, clientSecret, redirectUri } })`. jsforce auto-refreshes on 401.
- Exposes `listSObjects()` returning `{ name, label, custom, queryable }[]`, sorted alphabetically by `name`, filtered to `queryable === true`.
- Exposes `disconnect()` which clears in-memory state but does **not** revoke tokens (user can do that explicitly later).

**Done when:**

- Unit tests for `oauth.ts` (with mocked HTTP listener + token endpoint).
- Manual end-to-end: clicking Connect in the dialog opens browser, login completes, dialog closes, app shows "Connected to <orgId>" somewhere in the chrome.

**Gotcha:** The Electron renderer must not hold the client secret. All token exchange happens in the main process. Renderer talks to main via IPC (`ipcMain.handle('sf:connect', ...)`).

#### Task 2.4a — OAuth failure-mode contract

**Philosophy:** POC ships with minimum viable error handling, but the *error contract* is designed to be extended cheaply. We are not building retry machines, automatic re-auth flows, or recovery UX in this milestone — we *are* committing to a typed error shape that future milestones drop new handlers into without rewriting call sites.

**Files (create):**

- `apps/studio/src/lib/sf/errors.ts`

**Define a discriminated-union error type:**

```typescript
export type SfAuthError =
  | { kind: 'invalid_url'; message: string }
  | { kind: 'user_denied'; message: string }
  | { kind: 'port_in_use'; port: number; message: string }
  | { kind: 'token_invalid'; message: string }
  | { kind: 'token_revoked'; message: string }
  | { kind: 'network'; message: string; cause?: unknown }
  | { kind: 'unknown'; message: string; cause?: unknown };
```

`SfConnectionManager` and `oauth.ts` return `Result<T, SfAuthError>` (or throw `SfAuthError` instances — pick one and be consistent). All callers branch on `.kind`.

**Phase 2 POC: implement these handlers (enough to get through the acceptance script in §8.8):**

| Kind | When it fires | POC handling |
|---|---|---|
| `invalid_url` | My Domain URL fails the regex in §8.3 | Form validation error inline in the dialog. Never reaches OAuth code. |
| `user_denied` | Salesforce callback returns `?error=access_denied` | Toast: "Login cancelled." Dialog stays open, user can retry. |
| `port_in_use` | Port 1717 listener fails with `EADDRINUSE` | Modal error: "Port 1717 is in use, likely by another Salesforce tool. Close it (e.g., `sf` CLI) and retry." Do not auto-fall-back to another port — Connected App callback URL is fixed. |
| `unknown` | Catch-all for everything else | Toast: "Connection failed: \<message\>." Log full error including stack to dev console. No auto-retry. |

**Phase 2 POC: explicitly defer these to a later milestone (mention in `docs/poc-deferred.md`):**

| Kind | Why deferred | Future scope |
|---|---|---|
| `token_invalid` | jsforce auto-refreshes on 401; if refresh also fails we currently bucket into `unknown`. | Trigger a silent re-auth attempt, fall back to full OAuth dialog. |
| `token_revoked` | Salesforce returns `invalid_grant` from the refresh endpoint when an admin has revoked. | Detect, surface "Your session was revoked. Please reconnect.", trigger fresh OAuth. |
| `network` | Bucketed into `unknown` for POC. | Retry-with-backoff on transient network errors during OAuth and describe calls. |

**Done when:** `errors.ts` committed, all three POC kinds wired through to the UI, `docs/poc-deferred.md` lists what we did *not* implement and why. The error type itself is the contract — adding the deferred handlers later is a matter of dropping new branches into the existing `switch`, not rearchitecting.

**Why this matters:** This is the "extra work now to avoid painting into a corner" you asked about. The cost is ~30 lines of types and one switch statement. The payoff is that adding robust auth handling later is a localized change rather than a refactor that touches every caller of `connect()`.

### Task 2.5 — IPC plumbing

**Files:**

- `apps/studio/src-commercial/entrypoints/main.ts` (main-process IPC handlers register here).
- `apps/studio/src-commercial/entrypoints/preload.ts` (renderer-side bridge).
- Existing IPC channel utilities under `apps/studio/src/common/` — find with `rg -l "ipcMain.handle|contextBridge"`.

**Channels:**

- `sf:connect(savedConnectionId)` → returns `{ ok: true, orgId, userId, instanceUrl }` or `{ ok: false, error }`
- `sf:disconnect(savedConnectionId)` → returns `{ ok: true }`
- `sf:listSObjects(savedConnectionId)` → returns the sObject array
- `sf:status(savedConnectionId)` → returns `{ connected: boolean }`

**Done when:** Renderer Vuex/Pinia store has actions that call these channels and update UI state.

### Task 2.6 — Wire the entity tree

**Files:**

- The Vue component that renders the left-side database tree. Find with `rg -l "TableTree|EntityTree|Sidebar.*Tree"` under `apps/studio/src/components/`.

**Action:**

- Strip out the SQL-flavored branches (Tables / Views / Routines / Triggers).
- Render a single flat alphabetical list of sObjects from `sf:listSObjects`.
- Distinguish standard vs custom: append a `custom` badge or use a different icon (`ext-c` for custom, `ext-s` for standard — bikeshed in PR).
- Show a loading skeleton while `listSObjects` is in flight.
- Show an empty state ("No connection. Open a saved connection to begin.") when no active connection.
- Clicking an sObject does nothing in this milestone (selection state is fine, but no panel opens). This is intentional — we'll wire field display in the next milestone.

**Done when:** With a connected dev org, the tree renders the expected count of sObjects (sanity check against `https://<myDomain>/services/data/v${SF_API_VERSION}/sobjects` in browser).

### Task 2.7 — Connection lifecycle UX

**Files:** Connection list component, app menu, top bar.

**Behavior:**

- Saved connections show a green dot when active, gray otherwise.
- Double-click a saved connection → calls `sf:connect`. If tokens are present and not expired, no browser opens; jsforce silently refreshes if needed.
- Right-click → "Disconnect" / "Edit" / "Delete".
- "Delete" wipes the saved row, including stored tokens.
- App startup: do **not** auto-connect. User must explicitly open a connection.

**Done when:** Manual test passes for connect → disconnect → reconnect (no browser on second connect) → quit app → reopen → reconnect (no browser if refresh token still valid).

### Task 2.8 — Verify Phase 2

**Commands (from repo root):**

```bash
yarn all:lint
yarn workspace soql-manager tsc --noEmit -p tsconfig.json
yarn test:unit
yarn bks:build
yarn bks:dev                 # for manual smoke
```

**Manual acceptance script (loop should write this as `docs/poc-acceptance.md`):**

1. Launch app.
2. Open Connection Manager → New Connection.
3. Enter name "Dev Org", My Domain URL `https://<your-domain>.my.salesforce.com`. Save.
4. Click Connect. Browser opens. Log in. Redirect to `localhost:1717/oauth/callback`. Browser shows "You can close this tab".
5. App shows "Connected" indicator.
6. Left sidebar populates with sObjects, alphabetical, std/custom distinguishable.
7. Click Disconnect. Sidebar clears.
8. Click Connect again. No browser opens (refresh-token path). Sidebar repopulates within ~2s.
9. Quit app. Reopen. Click Connect on the saved connection. No browser. Sidebar populates.
10. Edit connection → change name → save. Reconnect still works.
11. Delete connection. Confirm row removed. Confirm OS keychain / app DB no longer contains tokens for that record (`sqlite3 <appdb> "SELECT name, refreshToken FROM saved_connection"` returns no row).

**Phase 2 is done when** the script passes end to end on at least one dev org. **Tag the commit `phase-2-poc-complete`.**

---

## 9. Validation & gates the Ralph loop should run continuously

After every meaningful edit, the loop should run, in order (from repo root), and stop on the first failure:

```bash
yarn all:lint
yarn workspace soql-manager tsc --noEmit -p tsconfig.json   # ad-hoc type gate; no typecheck script exists
yarn test:unit                                                  # studio + ui-kit Jest suites
yarn bks:build                                                  # full build only at task end, not every edit
```

Note: there is no plain `yarn lint` or `yarn typecheck` in this repo. esbuild and Vite strip TypeScript types without checking, so `tsc --noEmit` is the only place type errors surface short of a full build. `yarn test:unit` is the closest match to "test suite" — `yarn test:integration` and `yarn test:e2e` exist but are heavier and not part of the per-edit loop.

**Branching:** one branch per phase (`feat/soql-manager-phase-1-cleanse`, `feat/soql-manager-phase-2-poc`). Squash-merge to `main` only after the phase exit criteria are met. Tag at each phase boundary.

**Commit conventions:** Conventional Commits. `feat(sf):`, `chore(cleanse):`, `refactor(connection):`, `test(oauth):`. One logical change per commit so revertibility is real.

**"Stuck" heuristics for the loop:**

- If the loop edits the same file 3+ times in a row trying to make lint or `tsc --noEmit` pass, stop and write a `docs/blockers/<timestamp>.md` with the error and last 3 attempts. Halt the loop for human triage.
- If a `yarn install` fails with a peer-dep conflict, do **not** add *new* entries to root `resolutions`. (Two entries — `cpu-features` and `**/axios` — are inherited from upstream and stay.) Document and halt.
- If an OAuth round-trip fails with a non-2xx error from Salesforce, capture the full error body and halt — do not retry blindly.

---

## 10. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Beekeeper's data-layer abstraction is more interleaved with UI than expected; cleanse cascades into UI work | Medium | High | Task 1.1 inventory exists specifically to surface this before deletion. If cascading is severe, escalate to human and consider switching to "feature-flag SQL paths" approach instead of deletion. |
| jsforce v2 vs v3 type/runtime drift | Medium | Low | Pin exact version in `package.json`. Wrap jsforce behind `SfConnectionManager` so swapping clients later is a one-file change. |
| Salesforce Connected App config drift between dev orgs | High | Low | Document the exact Connected App settings in `docs/connected-app-setup.md`. Include screenshots in a follow-up. |
| Storing refresh tokens in the app DB rather than OS keychain is below industry baseline for desktop OAuth | Medium | Medium | Documented as Open Question §11. Spec'd to match Beekeeper's existing posture for parity. Hardening is a tracked follow-up. |
| Loopback redirect port `1717` collides with another running tool (`sf` CLI uses it too) | Medium | Low | **Decision: fail loudly.** `EADDRINUSE` on `1717` raises `SfAuthError { kind: 'port_in_use' }`, surfaced as a modal asking the user to close the conflicting tool. No auto-fallback (Connected App callback URL is fixed). Port-range fallback or custom URL scheme can be revisited if collisions become a real user complaint. |
| Large orgs return 1000+ sObjects; flat list becomes unusable | Medium | Medium | POC accepts this; long-term vision (§2) calls for grouping + search. Add a TODO in the entity tree component. |
| GPL obligations on the fork | High | Low | Preserve LICENSE, add FORK_NOTICE.md, keep the fork public. No relicensing. |

---

## 11. Open questions

These are not blocking for Phase 1 but should be resolved before Phase 3.

- **Q1** Should we move refresh tokens to OS keychain (keytar / Electron's `safeStorage`) before any non-developer use? Default answer: yes, but out of scope here.
- **Q2** Do we want to support multiple simultaneous active connections (multi-org tabs) in the next milestone, or one active connection at a time?
- **Q3** Where should `SF_CLIENT_ID` / `SF_CLIENT_SECRET` come from in a packaged release? Bundling them in the binary is standard for desktop OAuth (e.g. how `sf` CLI does it) but raises the question of rotation. Resolve before first non-dev distribution.
- **Q4** Do we ship a SOQL editor mode in Phase 3, or wait for a richer metadata-driven completion engine and ship without autocomplete first?
- **Q5** Sandbox login: My Domain URL approach handles sandboxes natively (every sandbox has its own My Domain). Confirm with one test against a real sandbox before declaring Phase 2 complete.
- **Q6** Tooling API vs Data API split — the long-term vision implies we'll need both. Should `SfConnectionManager` expose them as separate methods now, or unify later? Default: separate now, `connection.tooling` is a first-class jsforce concept.
- **Q7** ~~Telemetry~~ — **resolved.** Stripped entirely in Phase 1 (§5 Architecture). Crash reporting (Sentry-style) deferred to a Phase 2+ decision; not auto-on. License is GPLv3, no commercial intent, so no monetization-driven telemetry pressure. Honest "Security and Privacy" section to land in README before any non-developer distribution.

---

## 12. Items for your consideration (raised during spec drafting)

The following are not decisions baked into the spec — flagging them for your review before the Ralph loop starts.

1. **Connected App ownership.** Each dev who runs SOQL Manager will need *some* Connected App's Client ID. For dev work, each person can register their own in their own org. For a shipped binary, you'll need a stable Anthropic-style "SOQL Manager" Connected App in a Salesforce-owned dev account or a partner-managed package. This is a real distribution-blocking question and should be resolved before Phase 3, not at packaging time.
2. **Beekeeper Ultimate features.** Beekeeper has a paid "Ultimate" tier with extra features. If the community fork's tree contains any references to Ultimate-only code, the loop should not "helpfully" port those — flag them in `docs/cleanse-inventory.md`.
3. **Vue 2 vs Vue 3.** Beekeeper has been migrating. If the HEAD of the community edition is mid-migration, the cleanse may want to wait for the migration to settle, or align the fork to whichever side is stable. The loop should report which version it sees in `package.json` as part of Task 1.1.
4. **Encrypted-at-rest claim.** Beekeeper "encrypts" the app DB but the key is derived from a value reachable to anyone with filesystem access. This is fine for Phase 1 parity but the README of SOQL Manager should not overclaim. Land an honest "Security" section before the first public release.
5. **Test infrastructure.** Beekeeper has Jest / Vitest tests for some clients. After deletion in Task 1.3, many tests will be orphaned. The loop should delete them with their subjects, not skip them with `xit`. Skipped tests rot.
6. **Renaming the entity tree component.** `TableTree.vue` (or whatever it's called) is misleading after the cleanse. Rename to `EntityTree.vue` in Phase 1, not later — moving Vue files cleanly is much harder once they're being edited heavily in Phase 2.
7. **Result grid.** This spec parks the result grid. But the loop might be tempted to "just hook up sObject describes to it" once Phase 2 is done. Don't — that's Phase 3 scope and depends on type-aware rendering decisions we haven't made.
8. **Distribution + auto-update.** Beekeeper uses electron-builder + an update server. SOQL Manager will need its own update channel. Out of scope here, but flag for the human to track.
9. **Long-term parity caveat.** Long-term goal is feature parity with Beekeeper. Some Beekeeper features have no Salesforce analog (multi-statement scripts, transactions, `EXPLAIN`, raw connection strings). The roadmap should explicitly call out which Beekeeper features will be replaced by Salesforce-specific equivalents (e.g. SOQL Bulk API tab) vs simply dropped. Note: with no commercial intent (GPLv3 inherited, kept open-source), there's no pressure to gate Beekeeper-equivalent features behind a paid tier — every feature is community-edition-equivalent.
10. **Plugin/skill packaging.** This spec assumes the Ralph loop runs against a working git checkout. If you also want this delivered as a Cowork plugin (skill bundle, scheduled tasks for periodic builds, etc.), that's a separate spec — flag if you want one.

---

## 13. Glossary

- **Beekeeper Studio** — open-source SQL workbench, the upstream project we're forking.
- **Connected App** — Salesforce's term for an OAuth client. Created in Setup → App Manager → New Connected App.
- **Entities Explorer** — the left-side tree pane in Beekeeper. In SOQL Manager it lists sObjects.
- **jsforce** — Node.js Salesforce API library. https://jsforce.github.io/
- **My Domain** — every Salesforce org has a My Domain URL of the form `https://<subdomain>.my.salesforce.com` (or `.develop.my.salesforce.com` for dev orgs). It's how we route both production and sandbox auth without a separate toggle.
- **OAuth 2.0 Web Server flow** — three-leg OAuth with authorization code exchange. Standard for desktop apps using a loopback redirect.
- **Ralph loop** — Claude Code plugin that drives autonomous iterative work against a spec.
- **sObject** — Salesforce object (table-like). Includes standard (Account, Contact, Opportunity) and custom (`Foo__c`).
- **SOQL** — Salesforce Object Query Language. SQL-shaped but not SQL.
- **Tooling API** — separate Salesforce API surface for metadata, Apex, triggers, etc. Distinct from the Data API.

---

*End of document.*
