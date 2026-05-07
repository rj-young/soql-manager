// Salesforce auth error contract — Task 2.4a.
//
// Discriminated union so callers branch on `.kind`. New error modes drop in as
// new variants without rewriting call sites. Phase 2 POC implements
// `invalid_url`, `user_denied`, `port_in_use`, and `unknown` per PRD §8.4a;
// `token_invalid`, `token_revoked`, and `network` are typed but bucketed into
// `unknown` until a later milestone (see `docs/poc-deferred.md`).

export type SfAuthError =
  | { kind: 'invalid_url'; message: string }
  | { kind: 'user_denied'; message: string }
  | { kind: 'port_in_use'; port: number; message: string }
  | { kind: 'token_invalid'; message: string }
  | { kind: 'token_revoked'; message: string }
  | { kind: 'network'; message: string; cause?: unknown }
  | { kind: 'unknown'; message: string; cause?: unknown };

// Result wrapper. Callers do `if (!result.ok) switch (result.error.kind) ...`.
export type SfResult<T> = { ok: true; value: T } | { ok: false; error: SfAuthError };

export const ok = <T>(value: T): SfResult<T> => ({ ok: true, value });
export const err = <T>(error: SfAuthError): SfResult<T> => ({ ok: false, error });

// Helper: anything not already an `SfAuthError` is wrapped as `unknown`. Use at
// the boundary of try/catch in oauth.ts and SfConnectionManager.ts so the rest
// of the code only deals with the typed shape.
export function asSfAuthError(thrown: unknown): SfAuthError {
  if (
    thrown !== null &&
    typeof thrown === 'object' &&
    'kind' in thrown &&
    typeof (thrown as { kind: unknown }).kind === 'string'
  ) {
    return thrown as SfAuthError;
  }
  if (thrown instanceof Error) {
    return { kind: 'unknown', message: thrown.message, cause: thrown };
  }
  return { kind: 'unknown', message: String(thrown), cause: thrown };
}
