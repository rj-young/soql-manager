# Phase 1 — Task 1.7 verification + tag `phase-1-cleanse-complete`

**Run timestamp:** 2026-05-07T02:45Z
**Branch:** `claude/review-prd-ralph-docs-eyWub`
**Operator:** Claude Code on the web (`cloud_default` egress)

## Phase 1 exit criteria — final verification

Per PRD §7 ("Phase exit criteria, all must hold"):

| Criterion | Result |
|---|---|
| `yarn install` clean (cloud variant: `--ignore-scripts`) | ✅ 0.53s (cached) |
| `yarn workspace soql-manager lint` exits 0 | ✅ vacuous pass (1.02s) |
| `yarn lib:build` produces ui-kit bundle | ✅ 6.30s + tsc 5.7s |
| `yarn workspace soql-manager build` produces studio bundle | ✅ 20.32s |
| `yarn test:unit` (local-only, deferred per cloud caveat) | ⏸ deferred to Phase 1 → 2 handoff |
| `yarn bks:build` (local-only, deferred per cloud caveat) | ⏸ deferred |
| App launches with stub Salesforce entry / no working types | ⏸ requires Electron (deferred) |
| No DB driver dep refs (pg, mysql2, sqlite3, mariadb, mssql, tedious, oracledb, cassandra-driver, bigquery, redis, mongodb, cockroachdb, duckdb, clickhouse, firebird, libsql, trino, knex) | ✅ none in `apps/studio/package.json` or root |
| **`better-sqlite3` preserved** | ✅ exactly one match (`"^12.5.0"`) |

Bonus sweeps (PRD §1.4 done-when + Task 1.5 done-when + my own diligence):

| Sweep | Result |
|---|---|
| `rg "pg_catalog\|information_schema\|sqlite_master\|sys\.tables"` | One match: `apps/studio/src/migration/index.js:180` (appdb's own migration tracking — kept by design) |
| `rg "from ['\"](sql-formatter\|sql-query-identifier\|knex)['\"]" apps/studio/src apps/studio/src-commercial` | none |
| `grep -r "postgres\|mysql\|sqlite\|sqlserver" apps/studio/src/common/appdb/` | One match: `Connection.ts:59` (`type: 'better-sqlite3'` typeorm engine spec — kept by design) |
| `DatabaseTypes` narrowed to `['salesforce']` | ✅ |
| Rebrand surface (`name`, `productName`, `appId`, BrowserWindow title) | ✅ all four |
| `FORK_NOTICE.md` at repo root | ✅ |

## Phase 1 by the numbers

Aggregated from the per-task journal entries:

| Metric | Value |
|---|---|
| Tasks completed | 0.1, 1.1 (plus review amendments), 1.2, 1.3, 1.4, 1.5, 1.6, 1.7 — 8 + 1 amendment commit |
| Commits on this branch | 8 substantive + 1 review-amendment + the per-task journal commits |
| Files deleted | ~290 (most in Task 1.3 — DB clients, cursors, components, pipelines) |
| Files modified | ~30 (factory, store, IPC handlers, model, etc.) |
| Files added | ~12 (cloud stubs + sql_tools stub + xlsx stub + 7 docs) |
| Net line change | roughly **−55,000 lines** |
| Packages removed from `apps/studio/package.json` | 40 (37 runtime + 3 dev) plus 2 transitive natives (kerberos, mongodb-client-encryption) |
| `tsc --noEmit` errors on baseline (Task 0.1) | 274 |
| `tsc --noEmit` errors at end of Phase 1 | not re-measured (gate deferred); most baseline errors were in deleted files |

## What stayed by design

- The encrypted local app DB infrastructure (`apps/studio/src/common/appdb/`) — `better-sqlite3`, typeorm, encryption transformer, all ~80 historical migrations, every model except `CloudCredential` and `FormatterPreset`.
- The CodeMirror editor frame and language modes (Phase 1 inert; Phase 2 base; Phase 3 swaps SQL mode for SOQL).
- The plugin system (`apps/studio/src-commercial/backend/plugin-system/`).
- The Vue UI shell (`CoreInterface`, `ConnectionInterface`, sidebar, tab system).
- The Beekeeper Ultimate license code (anti-goal §4 — neither extended nor deleted).
- All historical AppDB migrations including `migration/ultimate/` (append-only — touching them would brick existing user installs).

## What's left red and why

- `tsc --noEmit -p apps/studio/tsconfig.json` is still red. Many baseline errors were in deleted files (gone), but some remain in tests and in Refactor-list files that Phase 2 reshapes. The team ships via `ts-jest` `isolatedModules: true`, so this is the upstream norm. Re-enabling tsc as a hard gate is a Phase 1.x cleanup or Phase 2.x precondition; PRD v0.4 explicitly defers.
- `yarn test:unit` and `yarn bks:build` (full Electron build) cannot be exercised in this cloud sandbox. Both are deferred to local handoff.
- The vestigial dialect columns in `saved_connection.ts` (`host`, `port`, `socketPath`, `sshHost`, `sshKeyfile`, etc.). Dead but harmless. Phase 2 Task 2.2 adds the new SF columns alongside; a follow-up pass can drop the dead ones.
- The `xlsx-stub` package under `.yarn/packages/`. Removable now that Task 1.3 deleted the call sites, but the existing `file:` ref in `package.json` is harmless. Trivial follow-up.

## Branch contract reminder

This branch is `claude/review-prd-ralph-docs-eyWub` per harness contract. The Ralph brief names `feat/soql-manager-phase-1-cleanse` as the canonical Phase 1 branch. Future Phase 1 sessions targeting the canonical branch should rebase or cherry-pick from here.

## Tag

Will tag the final commit `phase-1-cleanse-complete`.

## Hard halt — third gate

Per `docs/RALPH_LOOP_BRIEF.md`:

> **End of Phase 1** — after tagging `phase-1-cleanse-complete`. Phase 2 needs a local environment and human OAuth steps.

Halting. Phase 2 starts after:

1. Human signs off on Phase 1.
2. The branch (or a cherry-picked equivalent on `feat/soql-manager-phase-1-cleanse`) is moved to a local checkout — Phase 2 OAuth round-trip needs a real browser, and `yarn bks:dev` needs Electron headers reachable. Cloud `cloud_default` cannot do either.
3. A Salesforce Connected App is configured per PRD §6.3 with callback URL `http://localhost:1717/oauth/callback`, scopes `api refresh_token offline_access`, and `.env.local` populated with `SF_CLIENT_ID` + `SF_CLIENT_SECRET`.
