// SOQL Manager Phase 1 Task 1.5: ConnectionType narrowed from a 23-dialect
// union to the single value 'salesforce'. Existing dev-install rows with
// the legacy values (postgresql, mysql, sqlite, sqlserver, ...) cannot be
// connected to anymore. Drop them so the connection list shows a clean
// slate. Saved tokens (if any landed in token_cache) survive — Task 2.2
// will rewire token_cache to the SF connection model.
//
// On a fresh install this migration is a no-op (the table is empty).

export default {
  name: "20260507_drop_legacy_dialect_connections",
  async run(runner) {
    await runner.query(
      `DELETE FROM saved_connection WHERE connectionType != 'salesforce'`
    )
    await runner.query(
      `DELETE FROM used_connection WHERE connectionType != 'salesforce'`
    )
  }
}
