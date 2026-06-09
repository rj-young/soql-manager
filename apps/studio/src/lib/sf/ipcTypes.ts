// Shared types for the sf:* IPC channels — Task 2.5.
//
// Lives apart from ipcHandlers.ts / SfConnectionManager.ts so the preload
// bridge and renderer store can import these shapes without pulling jsforce,
// TypeORM models, or `electron`'s main-process API into their bundles.
// Channel contract per PRD Task 2.5.

import { SfAuthError } from './errors';

export interface SObjectSummary {
  name: string;
  label: string;
  custom: boolean;
  queryable: boolean;
}

export interface SfConnectInfo {
  orgId: string;
  userId: string;
  instanceUrl: string;
}

// `error.cause` is stripped before crossing the bridge (not reliably
// structured-cloneable); everything else survives as-is.
export type SfConnectResponse =
  | ({ ok: true } & SfConnectInfo)
  | { ok: false; error: SfAuthError };

export type SfDisconnectResponse = { ok: true };

export type SfListSObjectsResponse =
  | { ok: true; sobjects: SObjectSummary[] }
  | { ok: false; error: SfAuthError };

export type SfStatusResponse = { connected: boolean };
