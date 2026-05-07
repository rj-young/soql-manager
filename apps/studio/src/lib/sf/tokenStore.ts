// Salesforce token persistence — Task 2.2.
//
// Tokens are stored in the existing `token_cache` table (homeId + cache + name,
// both encrypted-string columns) per the PRD v0.4 schema-split decision:
// `saved_connection` holds non-secret post-auth metadata (instanceUrl, userId,
// orgId), `token_cache.cache` holds the encrypted JSON blob of access /
// refresh tokens. This helper is the only place that touches `token_cache`
// directly so callers (`SfConnectionManager`) never deal with the model.
//
// Encryption is handled by the existing `EncryptTransformer` on the
// `token_cache` columns — no new crypto path.

import { TokenCache } from '@/common/appdb/models/token_cache';

export type SfTokenBlob = {
  accessToken: string;
  refreshToken: string;
  tokenIssuedAt: number; // unix ms
  signature?: string;    // from Salesforce id_token if available
};

const HOME_ID_PREFIX = 'sf:';

function homeIdFor(savedConnectionId: number): string {
  return `${HOME_ID_PREFIX}${savedConnectionId}`;
}

export async function readTokens(savedConnectionId: number): Promise<SfTokenBlob | null> {
  const row = await TokenCache.findOneBy({ homeId: homeIdFor(savedConnectionId) });
  if (!row || !row.cache) return null;
  try {
    return JSON.parse(row.cache) as SfTokenBlob;
  } catch {
    return null;
  }
}

// Returns the token_cache.id, suitable for storing in saved_connection.tokenCacheId.
export async function writeTokens(
  savedConnectionId: number,
  tokens: SfTokenBlob,
  orgId?: string
): Promise<number> {
  const homeId = homeIdFor(savedConnectionId);
  let row = await TokenCache.findOneBy({ homeId });
  if (!row) {
    row = new TokenCache();
    row.homeId = homeId;
  }
  row.cache = JSON.stringify(tokens);
  row.name = orgId ? `sf:${orgId}` : homeId;
  await row.save();
  return row.id;
}

export async function clearTokens(savedConnectionId: number): Promise<void> {
  const row = await TokenCache.findOneBy({ homeId: homeIdFor(savedConnectionId) });
  if (row) await row.remove();
}
