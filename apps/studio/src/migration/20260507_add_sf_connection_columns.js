// Phase 2 Task 2.2 — add Salesforce-specific columns to saved_connection.
// Tokens themselves are stored in the existing token_cache table; these
// columns hold non-secret metadata + an FK pointer.
//
// All columns nullable so the migration is non-destructive on existing rows.
// The companion 20260507_drop_legacy_dialect_connections.js cleared rows of
// legacy dialect types, so the only surviving rows after these two migrations
// run will be 'salesforce'-typed (in practice: empty on a fresh install).

export default {
  name: "20260507_add_sf_connection_columns",
  async run(runner) {
    await runner.query(`ALTER TABLE saved_connection ADD COLUMN myDomainUrl varchar NULL`);
    await runner.query(`ALTER TABLE saved_connection ADD COLUMN instanceUrl varchar NULL`);
    await runner.query(`ALTER TABLE saved_connection ADD COLUMN userId varchar NULL`);
    await runner.query(`ALTER TABLE saved_connection ADD COLUMN orgId varchar NULL`);
    await runner.query(`ALTER TABLE saved_connection ADD COLUMN tokenCacheId integer NULL`);
  }
};
