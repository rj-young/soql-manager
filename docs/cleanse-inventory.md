# Cleanse inventory — Phase 1 kill list

**Status:** Draft, awaiting human approval. Hard gate per `RALPH_LOOP_BRIEF.md` — Task 1.2 does not begin until this list is signed off.
**Date:** 2026-05-07
**Branch:** `claude/review-prd-ralph-docs-eyWub`

## Scope and method

This is a map, not a deletion. Every file or module that touches SQL-flavored data plumbing is listed under one of three buckets, each with a one-line rationale:

- **Delete** — gone in Phase 1 (Tasks 1.2 / 1.3 / 1.4). No analogue in SOQL Manager.
- **Keep** — preserved as-is; either part of the inert UI shell, the appdb infrastructure, or the editor frame the spec calls out.
- **Refactor** — kept but reshaped during Phase 1 or early Phase 2. Names and call sites change.
- **⚠️ Skip** — Beekeeper Ultimate / paid-tier code. Per PRD anti-goal §4, do not port and do not modify. Flag and ignore.

Test files are not enumerated individually — Task 1.3 says "delete tests with their subjects." Tests under `apps/studio/tests/unit/lib/db/clients/` and `apps/studio/tests/integration/` that exercise deleted clients go with them. Tests for kept code stay. The 274-error tsc baseline (per `docs/upstream-pin.md`) drops sharply once Delete files are gone.

Migrations (`apps/studio/src/migration/*.js`) are append-only history. Don't touch. New SF migration lands on top in Task 2.2.

---

## 1. Dependencies (`apps/studio/package.json`)

### Delete (Task 1.2)

Direct database drivers and dialect packages — none have a Salesforce equivalent:

| Package | Why deleted |
|---|---|
| `@clickhouse/client` | ClickHouse driver |
| `@coresql/mysql2-auth-ed25519` | MySQL ed25519 auth plugin |
| `@duckdb/node-api` | DuckDB native API |
| `@google-cloud/bigquery` | BigQuery |
| `@libsql/knex-libsql` | libSQL Knex dialect |
| `@mongosh/browser-runtime-electron` | MongoDB shell runtime |
| `@mongosh/service-provider-node-driver` | MongoDB shell driver |
| `@redis/client` | Redis client |
| `@surrealdb/codemirror` | SurrealDB CodeMirror mode |
| `cassandra-driver` | Cassandra |
| `cassandra-knex` | Cassandra Knex dialect (forked) |
| `knex` | Query builder used only by the deleted clients |
| `knex-firebird-dialect` | Firebird Knex dialect |
| `libsql` | libSQL native |
| `mongodb` | MongoDB native |
| `mssql` | SQL Server |
| `mysql2` | MySQL |
| `node-firebird` | Firebird |
| `oracledb` | Oracle |
| `pg` | PostgreSQL |
| `pg-cursor` | PostgreSQL cursor |
| `pg-hstore` | PostgreSQL hstore |
| `postgres-interval` | PostgreSQL interval type |
| `redis` | Redis (duplicate of `@redis/client` post-rename) |
| `redis-splitargs` | Redis CLI argument splitter |
| `sqlanywhere` | SAP SQL Anywhere (forked) |
| `surrealdb` | SurrealDB |
| `trino-client` | Trino |
| `kerberos` | Kerberos auth — only used by `mssql` and `mongodb` |
| `mongodb-client-encryption` | Mongo CSFLE — only used by `mongodb` |

### Refactor (Task 1.4 — flagged for follow-up)

| Package | Decision |
|---|---|
| `sql-formatter` | Used by the editor's "Format SQL" button. SOQL syntax is similar enough that a formatter may want to come back, but not in Phase 1. Delete now; revisit when the SOQL editor lands. |
| `sql-query-identifier` | SQL parser for splitting batches at `;`. SOQL is single-statement, so this is dead weight. Delete. |
| `xlsx` (already stubbed via `.yarn/packages/xlsx-stub`) | Excel import/export. Stub stays until Task 1.3 deletes the call sites; then remove the stub package and the `file:` ref together. |

### Keep (PRD-protected)

| Package | Why |
|---|---|
| `better-sqlite3` | Powers Beekeeper's encrypted local app DB (saved-connections store). PRD-explicit keep. |
| `typeorm` | ORM for the app DB. Keep. |
| `electron`, `electron-builder`, `@electron/rebuild` | Runtime + build. Keep. |
| `vue`, `vuex`, `vue-router`, `vue-template-compiler`, `vue2-*` | UI framework. Keep. |
| `codemirror`, `@codemirror/*`, `@uiw/codemirror-*`, `@replit/codemirror-*` | Editor frame stays inert in Phase 1, becomes SOQL editor later. PRD-explicit keep. |
| `node-libcurl` | Used by Beekeeper for HTTP calls in some clients; verify before removal in 1.2 — may be referenced by the kept appdb / sync code. List as Keep pending verification. |
| `jsforce` | **Add in Task 2.1.** Not present yet. |

### Add (Task 2.1)

`jsforce` (latest stable) — Salesforce client library.

---

## 2. SQL client implementations — `apps/studio/src/lib/db/clients/*` (community DBs)

### Delete (Task 1.3)

Every dialect-specific client. After deletion the factory throws `NotImplemented` for every connection type, which is expected per PRD §1.3.

| File | Why |
|---|---|
| `bedrock.ts` | Amazon Bedrock RDS dialect |
| `bigquery.ts` + `bigquery/BigQueryCursor.ts` | BigQuery client + cursor |
| `cockroach.ts` | CockroachDB |
| `greengage.ts` | Greengage (Greenplum-derived) |
| `mariadb.ts` | MariaDB |
| `mysql.ts` + `mysql/MySqlCursor.ts` | MySQL |
| `postgresql.ts` + `postgresql/PsqlCursor.ts` + `postgresql/scripts.ts` + `postgresql/types.ts` | PostgreSQL |
| `redis.ts` | Redis |
| `redshift.ts` | Amazon Redshift |
| `sqlite.ts` + `sqlite/SqliteCursor.ts` + `sqlite/utils.ts` | SQLite (the **client**, not better-sqlite3 the dep) |
| `sqlserver.ts` + `sqlserver/SqlServerCursor.ts` | SQL Server |
| `tidb.ts` | TiDB |

### Keep / Refactor (Task 1.3 reshaping)

| File | Decision | Why |
|---|---|---|
| `BasicDatabaseClient.ts` | **Refactor** | The base class for all DB clients. Will be reshaped into the base class for `SfClient` (see Task 2.4). Until then, leave the type signature; remove the SQL-specific helpers it implements once their callers are gone. |
| `BaseV1DatabaseClient.ts` | Refactor | Older base class. Likely deletable once V1 clients are gone — verify dependents in 1.3. |
| `base/types.ts`, `base/wait.ts` | Keep | Shared utility types. Reuse for SF client. |
| `index.ts` | Refactor | Client factory / dispatcher. Becomes a single-branch factory returning `SfClient`. |
| `utils.ts` | Refactor | Shared utilities (column type mapping etc.). Most of this is SQL-shape and goes; some helpers (logging, error wrapping) survive. |

---

## 3. SQL client implementations — `apps/studio/src-commercial/backend/lib/db/clients/*` (paid-tier DBs)

### Delete (Task 1.3)

Per the §4 carve-out: these are DB drivers, not paid-feature gates. They go.

| File | Why |
|---|---|
| `anywhere.ts` + `anywhere/SqlAnywhereCursor.ts` + `anywhere/SqlAnywherePool.ts` | SAP SQL Anywhere |
| `cassandra.ts` + `cassandra/CassandraCursor.ts` | Cassandra |
| `clickhouse.ts` + `clickhouse/ClickHouseCursor.ts` | ClickHouse |
| `duckdb.ts` + `duckdb/DuckDBCursor.ts` | DuckDB |
| `firebird.ts` + `firebird/FirebirdCursor.ts` + `firebird/NodeFirebirdWrapper.ts` | Firebird |
| `libsql.ts` + `libsql/LibSQLCursor.ts` | libSQL |
| `mongodb.ts` + `mongodb/MongoDBCursor.ts` | MongoDB |
| `oracle.ts` + `oracle/OracleCursor.ts` | Oracle |
| `scylladb.ts` | ScyllaDB |
| `surrealdb.ts` + `surrealdb/SurrealDBCursor.ts` + `surrealdb/SurrealDBPool.ts` | SurrealDB |
| `trino.ts` | Trino |

### Refactor

| File | Decision | Why |
|---|---|---|
| `client.ts` | **Refactor** | Connection-type→client factory. Strip imports of deleted clients; this becomes the SF client factory. |
| `server.ts` | Refactor | Connection setup / SSH tunnel orchestration. Most of it survives for connection metadata; SQL-specific bits go. |
| `connection-provider.ts` (in `src-commercial/backend/lib/`) | Refactor | Provider abstraction over connection types. Single SF provider going forward. |

---

## 4. Backup / restore clients — `apps/studio/src/lib/db/{backup,restore}-clients/*`

### Delete (Task 1.3)

Per-dialect dump/restore scripts. SF has no `pg_dump` analog; the Bulk API is a Phase 3+ concern.

- `backup-clients/cockroach.ts`
- `backup-clients/mysql.ts`
- `backup-clients/postgresql.ts`
- `backup-clients/sqlite.ts`
- `backup-clients/sqlserver.ts`
- `backup-clients/index.ts`
- `restore-clients/mysql.ts`
- `restore-clients/postgresql.ts`
- `restore-clients/sqlite.ts`
- `restore-clients/sqlserver.ts`
- `restore-clients/index.ts`
- `backup-clients/NotImplementedBackupClient.ts`
- `restore-clients/NotImplementedRestoreClient.ts`

### Refactor

| File | Decision | Why |
|---|---|---|
| `models/BackupConfig.ts` | **Delete** with the rest; backup config has no SF analog. |

---

## 5. Db-tier shared infrastructure — `apps/studio/src/lib/db/*`

### Refactor

| File | Decision | Why |
|---|---|---|
| `index.ts` | Refactor | Module barrel. Strip exports of deleted clients. |
| `models.ts` | Refactor | Shared row / cell / cursor types. Most survive; SF-specific types added in 2.2. |
| `serverTypes.ts`, `backendTypes.ts`, `types.ts` | Refactor | Shared connection-type unions. Replace with `'salesforce'` in Task 1.5. |
| `tunnel.ts` | **Refactor** (carefully) | SSH tunnel for DB connections. SF doesn't need it. Removable, but verify nothing else (e.g. proxy support) reuses it before deletion. List as Refactor pending verification. |
| `serialization/transcoders.ts` | Keep | Cell-value serialization. Reusable for SF field values. |
| `sql_tools.ts` | Delete | SQL-specific helpers (statement splitting etc.). |
| `BaseCommandClient.ts`, `CommandClient.ts` | Refactor | Command-channel base classes. Reusable for SF; rename. |
| `authentication/amazon-redshift.ts` | Delete | Redshift IAM auth. |
| `authentication/azure.ts` | Delete | Azure SQL Entra ID auth. |

---

## 6. App DB models — `apps/studio/src/common/appdb/*` (PRD-explicit keep)

This is the encrypted local app DB. **Almost entirely keep**, with one model refactored to add SF fields. Delete only the Ultimate license model.

| File | Decision | Why |
|---|---|---|
| `Connection.ts` | **Keep** | TypeORM bootstrap for the app DB. Critical infrastructure. |
| `models/saved_connection.ts` | **Refactor** | Add `myDomainUrl`, `instanceUrl`, `accessToken`, `refreshToken`, `tokenIssuedAt`, `userId`, `orgId`. Replace the dialect enum with `'salesforce'`. Done in Task 2.2. |
| `models/used_connection.ts` | Keep | Connection history. SF connections logged here. |
| `models/CloseTab.ts`, `OpenTab.ts` | Keep | Tab persistence; shape is generic. |
| `models/CloudCredential.ts` | ⚠️ **Skip / verify** | Beekeeper Cloud workspace creds. May be Ultimate-only or community-shared. Flag; don't touch in Phase 1. |
| `models/EncryptedPluginData.ts`, `models/PluginData.ts` | Keep | Plugin system state. |
| `models/HiddenEntity.ts`, `HiddenSchema.ts` | Refactor | Currently hides tables/schemas. Reusable for hiding sObjects. Same shape, rename in 1.5. |
| `models/LicenseKey.ts` | ⚠️ **Skip** | Beekeeper Ultimate license. Per PRD anti-goal §4 — flag, do not touch. |
| `models/PinnedConnection.ts`, `PinnedEntity.ts`, `UserPin.ts` | Keep | UX state. PinnedEntity becomes pinned-sObject; same shape. |
| `models/QueryFolder.ts`, `favorite_query.ts`, `used_query.ts` | Keep | Query history / saved queries. SOQL queries persist here. |
| `models/FormatterPreset.ts` | **Delete** | SQL formatter presets. No SF analog. |
| `models/installation_id.ts` | Keep | Telemetry install ID — but telemetry is stripped per §5; see telemetry section below. The model itself can stay (it's just an ID); call sites that use it for analytics go. |
| `models/token_cache.ts` | Keep | Already an OAuth token cache (used for Azure / Cloud). Pattern reusable for SF tokens — coordinate with Task 2.2 to decide whether to extend `saved_connection` or use `token_cache`. |
| `models/user_setting.ts` | Keep | App preferences. |
| `models/application_entity.ts`, `models/base.ts` | Keep | Base classes for TypeORM models. |
| `transformers/Transformers.ts` | Keep | TypeORM column transformers (encryption helper lives here — reuse for SF tokens per Task 2.2). |
| `validators/ReadOnlyOrDefault.ts` | Keep | Generic validator. |

### Migrations (`apps/studio/src/migration/*.js`)

**Keep all 80+ historical migrations.** They're append-only. Phase 2 Task 2.2 adds one new migration on top. Do not delete or reorder.

The `apps/studio/src/migration/ultimate/` subdirectory contains Ultimate-specific migrations:
- `20220208_create_license_keys.js`
- `20220415_add_service_name_to_connections.js`
- `index.js`

⚠️ **Skip** per anti-goal §4. Don't delete (would break Ultimate users' DBs); don't extend; treat as untouchable.

---

## 7. Vuex store — `apps/studio/src/store/`

### Top-level modules (`src/store/modules/*.ts`)

| File | Decision | Why |
|---|---|---|
| `CredentialsModule.ts` | ⚠️ Skip | Cloud workspace creds. Likely Ultimate / community-shared boundary. Flag. |
| `HideEntityModule.ts` | Refactor | Hide-sObject; same shape. |
| `LicenseModule.ts` | ⚠️ Skip | Ultimate license state. |
| `MenuBarModule.ts`, `PopupMenuModule.ts` | Keep | UI chrome. |
| `PinConnectionModule.ts`, `PinModule.ts` | Keep / Refactor | UX state. PinnedEntity flow renames at the model layer. |
| `SearchModule.ts` | Keep | Generic search; reusable. |
| `SidebarModule.ts` | Keep | Sidebar UX state. |
| `TabModule.ts` | Keep | Tab system. |
| `UserEnumsModule.ts` | Keep | Enum-friendly settings. |

### Sub-stores (`src/store/modules/*/`)

| Path | Decision | Why |
|---|---|---|
| `data/DataModuleBase.ts`, `data/StoreHelpers.ts`, `data/connection/`, `data/connection_folder/`, `data/query/`, `data/query_folder/`, `data/used_connection/`, `data/used_query/` | **Refactor** | All connection / query state. Same shape, single connection-type going forward. SF-specific actions (connect, listSObjects) added here in Task 2.5. |
| `exports/ExportStoreModule.ts`, `exports/MultiTableExportModule.ts` | **Delete** | CSV/JSON/Excel export of query results. No SF analog in POC scope. |
| `imports/ImportStoreModule.ts` | **Delete** | Data import. No SF analog in POC scope. |
| `backup/BackupModule.ts` | **Delete** | DB backup state. |
| `plugins/` | Keep | Plugin system. |
| `settings/` | Keep | Settings system. |

---

## 8. Components — `apps/studio/src/components/`

### Connection forms (`components/connection/*Form.vue`)

**Delete every dialect-specific form** (Task 1.5):

- `BedrockForm.vue`
- `BigQueryForm.vue`
- `CassandraForm.vue`
- `ClickHouseForm.vue`
- `DuckDBForm.vue`
- `FirebirdForm.vue`
- `LibSQLForm.vue`
- `MongoDBForm.vue`
- `MysqlForm.vue`
- `OracleForm.vue`
- `PostgresForm.vue`
- `RedisForm.vue`
- `RedshiftForm.vue`
- `SqlAnywhereForm.vue`
- `SqlServerForm.vue`
- `SqliteForm.vue`
- `SurrealDBForm.vue`
- `TrinoForm.vue`

**Refactor**:

| File | Why |
|---|---|
| `AddDatabaseForm.vue` | Becomes "Add Salesforce Org" — name + My Domain URL (Task 2.3). |
| `SaveConnectionForm.vue` | Persists the saved connection row. Shape unchanged; field set narrows. |
| `CommonAdvanced.vue`, `CommonSsl.vue`, `CommonServerInputs.vue` | Mostly delete (SQL connection-string concepts). Anything generic (e.g. nickname) survives in `AddDatabaseForm`. |
| `CommonEntraId.vue`, `CommonIam.vue` | Delete — Azure / AWS auth forms; not relevant to SF OAuth. |
| `AutoModeStatus.vue`, `PlatformWarning.vue`, `ImportButton.vue` | Inspect during 1.5 — likely keep, but verify they aren't dialect-specific. |

### Sidebar / entity tree (`components/sidebar/`)

**Refactor**:

| File | Why |
|---|---|
| `ConnectionSidebar.vue`, `CoreSidebar.vue`, `GlobalSidebar.vue`, `WorkspaceSidebar.vue`, `SecondarySidebar.vue` | Sidebar shells. Keep; remove SQL-flavored children. |
| `core/TableList.vue`, `core/table_list/StatelessTableListItem.vue`, `core/table_list/TableListItem.vue`, `core/table_list/VirtualTableList.vue` | **Rename to `EntityList*` per PRD §12.6.** Source of data flips from `getSchema()` to `sf:listSObjects` (Task 2.6). |
| `core/PinnedTableList.vue` | Refactor → `PinnedEntityList.vue`. |
| `core/DatabaseDropdown.vue` | **Delete.** No "current database" concept in Salesforce. |

### Result grid / editor (`components/editor/`)

**Refactor / Keep**:

| File | Why |
|---|---|
| `ResultTable.vue` | Keep, refactor in a later phase. Field-type-aware rendering for SF results is Phase 3. For Phase 2, leaves the grid inert. xlsx download path is Delete (will be removed in 1.3 with the `xlsx` stub). |
| `QueryEditorStatusBar.vue` | Refactor. Keep the status bar; strip the xlsx/SQL download buttons. |
| Other editor children | Inspect on demand during 1.6 / Phase 2; default Keep. |

### Table-info panes (`components/tableinfo/`)

**Delete** (Task 1.3 — these expose SQL DDL concepts):

- `TableIndexes.vue`
- `TablePartitions.vue`
- `TableRelations.vue`
- `TableSchema.vue`
- `TableSchemaValidation.vue`
- `TableTriggers.vue`

(SF Field metadata is structurally different; Phase 3+ work, separate components.)

### Top-level tabs (`src/components/Tab*.vue`)

| File | Decision | Why |
|---|---|---|
| `TabQueryEditor.vue` | Refactor | Becomes the SOQL editor host. Phase 2 keeps it inert. |
| `TabImportTable.vue` | Delete | Data import flow. |
| `TabTableBuilder.vue` | Delete | DDL builder. |
| `TabTableProperties.vue` | Delete | Inspect → property editor. |
| `TabDatabaseBackup.vue` | Delete | DB backup. |
| `TabShell.vue` | Delete | DB shell (mongosh / psql etc.). |
| `TabPluginBase.vue`, `TabPluginShell.vue` | Keep | Plugin tabs. |
| `Titlebar.vue`, `CoreTabs.vue`, `CoreTabHeader.vue`, `ConnectionInterface.vue`, `CoreInterface.vue`, `LostConnectionModal.vue`, `GlobalStatusBar.vue`, `Dropzone.vue`, etc. | Keep | App chrome. Rebrand surface in Task 1.6. |

### Import / export / backup tabs

**Delete**:

- `components/importexportdatabase/ImportExportDatabase.vue`
- `components/importtable/ImportTable.vue`
- `components/importtable/ImportFile.vue`
- `components/export/forms/ExportFormSQL.vue`
- `components/common/modals/SqlFilesImportModal.vue`
- `components/common/modals/RenameDatabaseElementModal.vue`
- `components/backup/*` (DB-backup-specific forms)

### Common / texteditor

| File | Decision | Why |
|---|---|---|
| `common/texteditor/SQLTextEditor.vue` | Refactor | Becomes the SOQL editor base. Phase 2 inert; Phase 3 wires SOQL completion. |
| `common/TabWithTable.vue` | Refactor | Generic table-row shape; reusable. |
| `common/TableIcon.vue`, `common/TableLength.vue` | Refactor / Rename | Generic icon/badge components; rename to `EntityIcon` / `EntityLength`. |
| `common/form/QueryRenameForm.vue` | Keep | Generic. |
| `GroupedTables.vue` | Refactor | Entity grouping component. Renamed to `GroupedEntities.vue`. |

### Ultimate-flagged components

| Path | Decision | Why |
|---|---|---|
| `components/license/*` | ⚠️ Skip | Ultimate license UI. |
| `components/managers/*` | ⚠️ Verify then skip | "Managers" panes — likely Ultimate. Inspect; default skip. |

---

## 9. `src-commercial/backend/handlers/*` (IPC handlers)

| File | Decision | Why |
|---|---|---|
| `awsHandlers.ts` | Delete | AWS-specific (Redshift IAM, Bedrock). |
| `backupHandlers.ts` | Delete | DB backup. |
| `connHandlers.ts` | **Refactor** | Connection IPC. Becomes SF connection IPC in Task 2.5. |
| `enumHandlers.ts` | Refactor | Enum lookups; strip dialect enums. |
| `exportHandlers.ts` | Delete | Data export. |
| `handlers.ts` | Refactor | Handler registry; strip deleted handler imports. |
| `importHandlers.ts` | Delete | Data import. |
| `pluginHandlers.ts` | Keep | Plugin system. |

---

## 10. `src-commercial/backend/lib/import/*`

**Delete** (Task 1.3, alongside the xlsx stub):

- `import/utils.js`
- `import/formats/xlsx.ts`
- (and any other format files in `import/formats/`)

The `xlsx-stub` package under `.yarn/packages/xlsx-stub/` is removed once the call sites are gone.

---

## 11. `src-commercial/backend/plugin-system/`

**Keep all.** Plugin system is core infrastructure independent of database type.

---

## 12. `apps/studio/src/lib/*` (other libraries)

| Path | Decision | Why |
|---|---|---|
| `cloud/` (`CloudClient.ts`, `ClientHelpers.ts`, `controllers/`) | ⚠️ **Verify then keep / skip** | Beekeeper Cloud workspace integration. Possibly Ultimate-adjacent. Inspect and default Keep — these are not SQL-specific. |
| `data/` | Refactor | Data normalisation. Inspect during 1.4. |
| `db/` | Covered above (sections 2 and 5). |
| `editor/` (`CodeMirrorDefinitions.ts`, `CodeMirrorPlugins.ts`, `extensions/`, `languageData.ts`, `plugins/`, `utils.ts`, `vim.ts`) | **Keep all** | Editor frame. PRD-explicit keep. SQL language modes stay for now (will swap for SOQL in a later phase). |
| `export/` (`export.ts`, `formats/`, `models.ts`, `index.ts`) | Delete | Export pipeline (CSV / JSON / Excel of query results). |
| `import/` | Delete | Import pipeline. |
| `errors.ts`, `events/`, `time/`, `uuid.ts`, `magic/`, `validation.js`, `converter.js`, `NativeWrapper.ts`, `TempFileManager.ts`, `UserProvidedEnum.ts`, `menu/`, `log/`, `utility/` | Keep | Generic utilities. |
| `ssh/` | **Verify then refactor** | SSH tunnel infrastructure. Beekeeper used it for DB tunnels; SF over OAuth doesn't need it. Likely deletable once `db/tunnel.ts` is gone, but check for non-DB uses (e.g. SSH-via-bastion connection options). Default Refactor pending Phase 2 verification. |
| `license.ts` | ⚠️ Skip | Ultimate license helper. |
| `typeorm_plugin.js` | Keep | Required by the appdb. |

---

## 13. Telemetry strip (PRD §5)

PRD specifies "All upstream Beekeeper telemetry / analytics call sites and the telemetry library itself are removed during the cleanse."

Action items for Task 1.3:
- `rg "telemetry|analytics|posthog|mixpanel|segment|amplitude|sentry"` across `apps/studio/src`. Catalog hits before deletion.
- Most likely homes: `lib/log/`, possibly `store/`, possibly background-process startup. Surface in Task 1.3 inventory; remove call sites; remove the SDK packages (probably `posthog-node`, `posthog-js`, or similar — check `package.json`).

Not enumerated here because the telemetry surfaces aren't in the directories Task 1.1 was asked to read. Recommend Task 1.3 begins with a `rg` sweep dedicated to telemetry and produces a sub-inventory before deletion.

---

## 14. Items deferred to later tasks

- **Brand surface inventory (Task 1.6)** — `package.json` name/productName/description, `src-commercial/entrypoints/main.ts` window title, `electron-builder-config.js` appId. Touched in 1.6, not 1.3.
- **`FORK_NOTICE.md` and the README "Security and Privacy" section** — per PRD §12.4, land before any non-developer distribution. Not Phase 1 scope.
- **Test inventory** — Task 1.3 deletes tests with their subjects. A sub-inventory of orphaned tests will surface naturally; track in the journal entry for Task 1.3.

---

## 15. Counts (rough)

| Bucket | Approx files |
|---|---|
| Delete (dialect-specific code) | ~120 |
| Refactor (kept but reshaped) | ~45 |
| Keep | ~80 (in scope; not exhaustive) |
| ⚠️ Skip (Ultimate / community boundary) | ~10 to be verified |

Final tsc baseline at end of Phase 1 should be substantially better than the current 274 errors — most of those are in the Delete files.

---

## Approval gate

Per `RALPH_LOOP_BRIEF.md`:

> **End of Task 1.1** — after `docs/cleanse-inventory.md` is committed. Hard gate. Do not begin Task 1.2 until a human approves the kill list.

Sign off when ready. Task 1.2 begins from this list with no further interpretation.
