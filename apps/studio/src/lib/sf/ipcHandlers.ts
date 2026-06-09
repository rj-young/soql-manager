// sf:* IPC channel registration — Task 2.5.
//
// Main process only. The renderer reaches the Salesforce layer exclusively
// through these channels (via the preload bridge); the client secret and
// token blobs never cross into the renderer. Registration mirrors the
// initializeFileHelpers() pattern in @/backend/lib/FileHelpers.

import { ipcMain } from 'electron';
import { sfConnectionManager } from './SfConnectionManager';
import { SfAuthError } from './errors';
import {
  SfConnectResponse,
  SfDisconnectResponse,
  SfListSObjectsResponse,
  SfStatusResponse,
} from './ipcTypes';

let initialized = false;

// IPC return values are structured-cloned. `cause` can hold anything a
// library threw (sockets, circular refs) — strip it; kind/message/port carry
// everything the renderer acts on.
function serializableError(error: SfAuthError): SfAuthError {
  if (error.kind === 'port_in_use') {
    return { kind: error.kind, port: error.port, message: error.message };
  }
  return { kind: error.kind, message: error.message } as SfAuthError;
}

export function initializeSfHandlers(): void {
  if (initialized) return;

  ipcMain.handle('sf:connect', async (_event, savedConnectionId: number): Promise<SfConnectResponse> => {
    const result = await sfConnectionManager.connect(savedConnectionId);
    if (result.ok !== false) {
      return { ok: true, ...result.value };
    }
    return { ok: false, error: serializableError(result.error) };
  });

  ipcMain.handle('sf:disconnect', async (_event, savedConnectionId: number): Promise<SfDisconnectResponse> => {
    sfConnectionManager.disconnect(savedConnectionId);
    return { ok: true };
  });

  ipcMain.handle('sf:listSObjects', async (_event, savedConnectionId: number): Promise<SfListSObjectsResponse> => {
    const result = await sfConnectionManager.listSObjects(savedConnectionId);
    if (result.ok !== false) {
      return { ok: true, sobjects: result.value };
    }
    return { ok: false, error: serializableError(result.error) };
  });

  ipcMain.handle('sf:status', async (_event, savedConnectionId: number): Promise<SfStatusResponse> => {
    return { connected: sfConnectionManager.isConnected(savedConnectionId) };
  });

  initialized = true;
}
