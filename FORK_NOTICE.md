# Fork notice

**SOQL Manager** is a fork of [Beekeeper Studio](https://beekeeperstudio.io/) community edition, originally created by [Beekeeper Studio Team](https://github.com/beekeeper-studio/beekeeper-studio) and licensed under GPLv3.

This fork retargets the Beekeeper Studio UI shell — connection manager, entity tree, tabbed editor frame, encrypted local connection store — at Salesforce orgs instead of SQL databases. The Salesforce-specific functionality (`jsforce` integration, OAuth Web Server flow, sObject explorer) is added on top; the SQL data layer is removed.

## License

Inherited from upstream: **GNU General Public License v3.0**. See `LICENSE` for full terms. The fork preserves all upstream LICENSE and NOTICE files unchanged. There is no commercial intent for SOQL Manager — every feature is community-edition-equivalent.

## Upstream attribution

- Original project: <https://github.com/beekeeper-studio/beekeeper-studio>
- Original author: Matthew Rathbone and the Beekeeper Studio Team
- Forked from upstream `master` at commit `4a2ae18f` (Beekeeper Studio v5.7.1).

## Upstream code preserved verbatim

- The entire `apps/studio/src/components/`, `apps/studio/src/store/`, `apps/studio/src/common/appdb/`, and `apps/studio/src/migration/` directories (with the SQL-driver subset removed in Phase 1 of this fork).
- The CodeMirror editor frame and its language modes (slated to swap for SOQL in a later milestone).
- The encrypted SQLite app DB (`better-sqlite3` + `typeorm`) used to store saved connections.
- The plugin system.

## What this fork removed

See `docs/cleanse-inventory.md` and the `docs/loop-journal/phase-1-*` files for an exhaustive list. Highlights:

- All 23 database driver implementations (Postgres, MySQL, SQLite as a *user* DB, SQL Server, Oracle, MongoDB, BigQuery, Cassandra, ClickHouse, DuckDB, Firebird, Redis, Redshift, etc.).
- The `knex`, `sql-formatter`, `sql-query-identifier`, `mssql`, `pg`, `mysql2`, `oracledb`, `mongodb`, and ~30 other DB-related packages.
- Beekeeper Cloud workspace integration (`lib/cloud/`, `CloudCredential` model, `CredentialsModule`).
- Data import / export pipelines (CSV / JSON / Excel).
- Database backup / restore tooling.
- SSH tunneling infrastructure.

## What this fork added

- Phase 1 cleanse documentation under `docs/`.
- Vendored stub package `.yarn/packages/xlsx-stub/` (replaces the upstream pinned `cdn.sheetjs.com` URL that was unreachable in our build environment; harmless given the import call sites are gone after Task 1.3).
- Salesforce client integration (Phase 2 onwards — see `docs/SOQL_MANAGER_PRD.md`).

## Security and privacy

This fork inherits Beekeeper Studio's security posture for the encrypted local app DB. The encryption is real but the key derivation is reachable to anyone with filesystem access — fine for a developer tool, **not** strong enough to overclaim "encrypted at rest" against motivated adversaries. The README will surface this honestly before any non-developer distribution.

No telemetry. No crash reporting (deferred). No analytics. No phone-home of any kind.

## Reporting issues

Issues with the SOQL Manager fork: open in this repository.
Issues that pre-date the fork or are also present in upstream: please report to the upstream Beekeeper Studio project.

## Trademarks

"Beekeeper Studio" is the property of Rathbone Labs, LLC. SOQL Manager does not claim any rights in that trademark and does not imply endorsement by the Beekeeper Studio team.
