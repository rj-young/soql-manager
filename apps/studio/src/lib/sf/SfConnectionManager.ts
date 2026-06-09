// Salesforce connection manager — Task 2.4.
//
// Main-process registry of live jsforce connections, keyed by
// saved_connection.id. Owns the OAuth handoff (oauth.ts), token persistence
// (tokenStore.ts), and the describeGlobal call that feeds the entity tree.
// The renderer reaches this only through the IPC channels added in Task 2.5 —
// the client secret never crosses the bridge.
//
// Error contract: every public method returns SfResult<T> (Task 2.4a).
// Refresh-token failures bucket into `unknown` for the POC; `token_invalid` /
// `token_revoked` handling is deferred (docs/poc-deferred.md).

import { Connection } from 'jsforce';
import log from '@bksLogger';
import { SavedConnection } from '@/common/appdb/models/saved_connection';
import { SfResult, ok, err, asSfAuthError } from './errors';
import { runOAuthFlow, SfOAuthConfig, SfTokenResponse, DEFAULT_PORT, RunOAuthFlowOptions } from './oauth';
import { readTokens, writeTokens, SfTokenBlob } from './tokenStore';
import type { SObjectSummary, SfConnectInfo } from './ipcTypes';

export type { SObjectSummary, SfConnectInfo } from './ipcTypes';

const DEFAULT_API_VERSION = '66.0'; // docs/api-version.md; override via SF_API_VERSION

function apiVersion(): string {
  return process.env.SF_API_VERSION || DEFAULT_API_VERSION;
}

// Connected App credentials come from the environment (.env.local in dev;
// packaged-release sourcing is Open Question §11 Q3).
function configFor(saved: SavedConnection): SfResult<SfOAuthConfig> {
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return err({ kind: 'unknown', message: 'SF_CLIENT_ID / SF_CLIENT_SECRET not set. Copy .env.example to .env.local and fill in the Connected App credentials.' });
  }
  if (!saved.myDomainUrl) {
    return err({ kind: 'invalid_url', message: 'Saved connection has no My Domain URL.' });
  }
  const port = parseInt(process.env.SF_OAUTH_REDIRECT_PORT || '', 10) || DEFAULT_PORT;
  return ok({ clientId, clientSecret, myDomainUrl: saved.myDomainUrl, port });
}

// Identity URL looks like https://login.salesforce.com/id/<orgId>/<userId>.
function parseIdentityUrl(id: string): { orgId: string; userId: string } | null {
  const match = /\/id\/([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)\/?$/.exec(id);
  if (!match) return null;
  return { orgId: match[1], userId: match[2] };
}

export class SfConnectionManager {
  private active = new Map<number, Connection>();

  // Injection seam for tests; production callers pass nothing and oauth.ts
  // falls back to shell.openExternal + global fetch.
  constructor(private oauthOptions: RunOAuthFlowOptions = {}) {}

  isConnected(savedConnectionId: number): boolean {
    return this.active.has(savedConnectionId);
  }

  // First connect runs the browser OAuth flow; reconnect rebuilds the jsforce
  // connection from stored tokens (jsforce silently refreshes on 401).
  async connect(savedConnectionId: number): Promise<SfResult<SfConnectInfo>> {
    try {
      const saved = await SavedConnection.findOneBy({ id: savedConnectionId });
      if (!saved) {
        return err({ kind: 'unknown', message: `No saved connection with id ${savedConnectionId}.` });
      }

      const config = configFor(saved);
      if (!config.ok) return config as SfResult<never>;

      const existing = this.active.get(savedConnectionId);
      if (existing && saved.orgId && saved.userId && saved.instanceUrl) {
        return ok({ orgId: saved.orgId, userId: saved.userId, instanceUrl: saved.instanceUrl });
      }

      const tokens = await readTokens(savedConnectionId);
      if (tokens) {
        return await this.resumeFromTokens(saved, config.value, tokens);
      }
      return await this.connectViaOAuth(saved, config.value);
    } catch (e) {
      return err(asSfAuthError(e));
    }
  }

  // Clears in-memory state only. Does not revoke or delete stored tokens —
  // explicit revoke is a later milestone; "Delete connection" clears tokens
  // via tokenStore.clearTokens in the Task 2.7 lifecycle work.
  disconnect(savedConnectionId: number): SfResult<void> {
    this.active.delete(savedConnectionId);
    return ok(undefined);
  }

  // Alphabetical, queryable-only sObject list for the entity tree (Task 2.6).
  async listSObjects(savedConnectionId: number): Promise<SfResult<SObjectSummary[]>> {
    const conn = this.active.get(savedConnectionId);
    if (!conn) {
      return err({ kind: 'unknown', message: 'Not connected. Open the connection before listing objects.' });
    }
    try {
      const described = await conn.describeGlobal();
      const sobjects = described.sobjects
        .filter((s) => s.queryable)
        .map((s) => ({ name: s.name, label: s.label, custom: s.custom, queryable: s.queryable }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok(sobjects);
    } catch (e) {
      return err(asSfAuthError(e));
    }
  }

  private buildConnection(config: SfOAuthConfig, instanceUrl: string, tokens: SfTokenBlob): Connection {
    return new Connection({
      instanceUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      version: apiVersion(),
      oauth2: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: `http://localhost:${config.port}/oauth/callback`,
        loginUrl: config.myDomainUrl,
      },
    });
  }

  // Persist rotated access tokens so the next app start reconnects silently.
  private persistRefreshedTokens(savedConnectionId: number, refreshToken: string, orgId?: string) {
    return (newAccessToken: string) => {
      writeTokens(savedConnectionId, {
        accessToken: newAccessToken,
        refreshToken,
        tokenIssuedAt: Date.now(),
      }, orgId).catch((e) => log.error('Failed to persist refreshed SF access token', e));
    };
  }

  private async resumeFromTokens(
    saved: SavedConnection,
    config: SfOAuthConfig,
    tokens: SfTokenBlob
  ): Promise<SfResult<SfConnectInfo>> {
    const conn = this.buildConnection(config, saved.instanceUrl || config.myDomainUrl, tokens);
    conn.on('refresh', this.persistRefreshedTokens(saved.id, tokens.refreshToken, saved.orgId ?? undefined));

    try {
      // identity() both validates the stored tokens and refreshes the
      // post-auth metadata; an expired access token auto-refreshes here.
      const identity = await conn.identity();
      saved.userId = identity.user_id;
      saved.orgId = identity.organization_id;
      await saved.save();

      this.active.set(saved.id, conn);
      return ok({
        orgId: identity.organization_id,
        userId: identity.user_id,
        instanceUrl: saved.instanceUrl || config.myDomainUrl,
      });
    } catch (e) {
      // POC: refresh failure (revoked/expired grant) buckets into `unknown`.
      // Silent re-auth fallback is deferred — see docs/poc-deferred.md.
      return err(asSfAuthError(e));
    }
  }

  private async connectViaOAuth(
    saved: SavedConnection,
    config: SfOAuthConfig
  ): Promise<SfResult<SfConnectInfo>> {
    const result = await runOAuthFlow(config, this.oauthOptions);
    if (!result.ok) return result as SfResult<never>;
    const response: SfTokenResponse = result.value;

    const identity = parseIdentityUrl(response.id);
    if (!identity) {
      return err({ kind: 'unknown', message: `Could not parse identity URL from token response: ${response.id}` });
    }

    const blob: SfTokenBlob = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      tokenIssuedAt: response.issuedAt,
      signature: response.signature,
    };
    const tokenCacheId = await writeTokens(saved.id, blob, identity.orgId);

    saved.instanceUrl = response.instanceUrl;
    saved.orgId = identity.orgId;
    saved.userId = identity.userId;
    saved.tokenCacheId = tokenCacheId;
    await saved.save();

    const conn = this.buildConnection(config, response.instanceUrl, blob);
    conn.on('refresh', this.persistRefreshedTokens(saved.id, blob.refreshToken, identity.orgId));
    this.active.set(saved.id, conn);

    return ok({ orgId: identity.orgId, userId: identity.userId, instanceUrl: response.instanceUrl });
  }
}

// Main-process singleton; the Task 2.5 IPC handlers import this.
export const sfConnectionManager = new SfConnectionManager();
