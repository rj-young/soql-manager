// OAuth 2.0 Web Server flow — Task 2.4.
//
// Runs entirely in the Electron main process: the renderer never sees the
// client secret (PRD Task 2.4 gotcha). Flow:
//
//   1. Bind a loopback HTTP listener on 127.0.0.1:<port> (default 1717,
//      matching the `sf` CLI convention). EADDRINUSE fails loudly with
//      `port_in_use` — no auto-fallback, the Connected App callback URL is
//      fixed (PRD §10).
//   2. Open `<myDomainUrl>/services/oauth2/authorize` in the system browser.
//   3. Receive the authorization code on /oauth/callback, verified against a
//      random `state` value.
//   4. Exchange the code for tokens at `<myDomainUrl>/services/oauth2/token`.
//
// Electron's `shell.openExternal` is required lazily so this module loads
// under plain Node (unit tests inject `openExternal` and `fetchFn`).
//
// Error contract: returns SfResult<SfTokenResponse>, never throws. Network
// failures bucket into `unknown` per the Task 2.4a POC scope (no `network`
// retry handling this milestone).

import http from 'http';
import crypto from 'crypto';
import { SfResult, ok, err, asSfAuthError } from './errors';

export const CALLBACK_PATH = '/oauth/callback';
export const DEFAULT_PORT = 1717;
const SCOPES = 'api refresh_token offline_access';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface SfOAuthConfig {
  clientId: string;
  clientSecret: string;
  // e.g. https://acme-dev-ed.develop.my.salesforce.com — no trailing slash
  myDomainUrl: string;
  port: number;
}

// Shape returned by the Salesforce token endpoint, camel-cased.
export interface SfTokenResponse {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  // Identity URL: https://login.salesforce.com/id/<orgId>/<userId>
  id: string;
  issuedAt: number; // unix ms
  signature?: string;
}

// Minimal structural type so the module doesn't depend on DOM fetch typings
// and tests can pass a plain object.
export type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface RunOAuthFlowOptions {
  // Defaults to Electron shell.openExternal, required lazily.
  openExternal?: (url: string) => Promise<void>;
  // Defaults to global fetch (Node >= 18 / Electron main).
  fetchFn?: FetchLike;
  // How long to wait for the browser round-trip before giving up.
  timeoutMs?: number;
}

async function defaultOpenExternal(url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { shell } = require('electron');
  await shell.openExternal(url);
}

export function buildAuthUrl(config: SfOAuthConfig, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    prompt: 'login',
  });
  return `${config.myDomainUrl}/services/oauth2/authorize?${params.toString()}`;
}

type CallbackResult = SfResult<string>; // authorization code

// Binds the loopback listener and resolves with the authorization code once
// the browser redirects back. Rejects nothing — all failure modes resolve as
// err(...) so runOAuthFlow stays a single error channel.
function waitForCallback(
  server: http.Server,
  port: number,
  state: string,
  timeoutMs: number
): Promise<CallbackResult> {
  return new Promise<CallbackResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve(err({ kind: 'unknown', message: `Timed out after ${timeoutMs}ms waiting for the OAuth callback. The browser window may have been closed.` }));
    }, timeoutMs);

    const finish = (result: CallbackResult) => {
      clearTimeout(timer);
      resolve(result);
    };

    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        finish(err({ kind: 'port_in_use', port, message: `Port ${port} is in use, likely by another Salesforce tool (e.g. the sf CLI). Close it and retry.` }));
      } else {
        finish(err(asSfAuthError(e)));
      }
    });

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }

      const respond = (body: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body><p>${body}</p></body></html>`);
      };

      const errorParam = url.searchParams.get('error');
      if (errorParam === 'access_denied') {
        respond('Login cancelled. You can close this tab.');
        finish(err({ kind: 'user_denied', message: 'Login cancelled.' }));
        return;
      }
      if (errorParam) {
        respond('Login failed. You can close this tab.');
        const description = url.searchParams.get('error_description') ?? '';
        finish(err({ kind: 'unknown', message: `Salesforce returned error "${errorParam}": ${description}` }));
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      if (!code || returnedState !== state) {
        respond('Login failed. You can close this tab.');
        finish(err({ kind: 'unknown', message: 'OAuth callback missing code or state mismatch.' }));
        return;
      }

      respond('Login complete. You can close this tab.');
      finish(ok(code));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function exchangeCode(
  config: SfOAuthConfig,
  code: string,
  redirectUri: string,
  fetchFn: FetchLike
): Promise<SfResult<SfTokenResponse>> {
  const tokenUrl = `${config.myDomainUrl}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
  });

  let status: number;
  let text: string;
  try {
    const response = await fetchFn(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    status = response.status;
    text = await response.text();
    if (!response.ok) {
      // Capture the full body per the loop brief — Salesforce error payloads
      // carry the actionable detail (invalid_grant, redirect_uri mismatch...).
      return err({ kind: 'unknown', message: `Token exchange failed with HTTP ${status}: ${text}` });
    }
  } catch (e) {
    return err(asSfAuthError(e));
  }

  let payload: Record<string, string>;
  try {
    payload = JSON.parse(text);
  } catch {
    return err({ kind: 'unknown', message: `Token endpoint returned non-JSON response: ${text.slice(0, 200)}` });
  }

  if (!payload.access_token || !payload.instance_url || !payload.id) {
    return err({ kind: 'unknown', message: 'Token response missing access_token, instance_url, or id.' });
  }
  if (!payload.refresh_token) {
    return err({ kind: 'unknown', message: 'Token response has no refresh_token. Check the Connected App grants the refresh_token / offline_access scope.' });
  }

  return ok({
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    instanceUrl: payload.instance_url,
    id: payload.id,
    issuedAt: payload.issued_at ? parseInt(payload.issued_at, 10) : Date.now(),
    signature: payload.signature,
  });
}

// Full browser round-trip: listener up, browser out, code in, tokens back.
export async function runOAuthFlow(
  config: SfOAuthConfig,
  options: RunOAuthFlowOptions = {}
): Promise<SfResult<SfTokenResponse>> {
  if (!/^https:\/\//.test(config.myDomainUrl)) {
    return err({ kind: 'invalid_url', message: `My Domain URL must start with https:// — got "${config.myDomainUrl}".` });
  }

  const openExternal = options.openExternal ?? defaultOpenExternal;
  const fetchFn = options.fetchFn ?? ((globalThis as any).fetch as FetchLike);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const state = crypto.randomBytes(16).toString('hex');

  const server = http.createServer();
  try {
    const callbackPromise = waitForCallback(server, config.port, state, timeoutMs);

    // Wait for the listener to actually bind (or fail with EADDRINUSE) before
    // sending the user to the browser. `listening` never fires on bind errors,
    // so race against the callback promise, which captures server errors.
    const bound = await Promise.race([
      new Promise<'listening'>((resolve) => server.once('listening', () => resolve('listening'))),
      callbackPromise,
    ]);
    if (bound !== 'listening') return bound as CallbackResult as SfResult<SfTokenResponse>;

    // Port 0 means "any free port" (used by tests); reflect the bound port in
    // the redirect URI. In production the configured port is 1717 and must
    // match the Connected App callback URL exactly.
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : config.port;
    const redirectUri = `http://localhost:${boundPort}${CALLBACK_PATH}`;

    try {
      await openExternal(buildAuthUrl(config, redirectUri, state));
    } catch (e) {
      return err(asSfAuthError(e));
    }

    const callback = await callbackPromise;
    if (!callback.ok) return callback as SfResult<never>;

    return await exchangeCode(config, callback.value, redirectUri, fetchFn);
  } finally {
    server.close();
  }
}
