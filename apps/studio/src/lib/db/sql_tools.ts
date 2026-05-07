// Minimal stubs of the four sql_tools.ts functions still imported by the
// editor + SOQL host. Original implementations relied on the deleted
// sql-formatter and sql-query-identifier packages. Phase 2's SOQL editor
// rewrites the query pipeline; for Phase 1 we just need the imports to
// resolve and call sites to behave safely.

export function canDeparameterize(params: string[]): boolean {
  // Original logic: forbid mixing positional `?` with named params.
  // Stub-safe default: only allow when no parameters are present.
  return params.length === 0
}

export function convertParamsForReplacement(
  placeholders: string[],
  values: string[]
): string[] | Record<string, string> {
  if (placeholders.length === 0) return []
  if (placeholders.includes('?')) return values
  return placeholders.reduce((obj, val, index) => {
    obj[val.slice(1)] = values[index]
    return obj
  }, {} as Record<string, string>)
}

export function deparameterizeQuery(
  queryText: string,
  _dialect: unknown,
  _params: unknown,
  _paramTypes: unknown
): string {
  // Was: format(queryText, { paramTypes, params, language }).
  // Without sql-formatter, return the query unchanged. Phase 2 SOQL editor
  // will reintroduce a proper SOQL-aware formatter.
  return queryText
}

export function removeQueryQuotes(possibleQuery: string, _dialect: unknown): string {
  const trimmed = possibleQuery.trim()
  const quotes = ["'", '"', '`']
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if (trimmed.length >= 2 && quotes.includes(first) && first === last) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}
