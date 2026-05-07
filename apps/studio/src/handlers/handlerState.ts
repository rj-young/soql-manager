import { IConnection } from "@/common/interfaces/IConnection";
import { BasicDatabaseClient } from "@/lib/db/clients/BasicDatabaseClient";
import { CancelableQuery } from "@/lib/db/models";
import { IDbConnectionPublicServer } from "@/lib/db/serverTypes";
import { MessagePortMain } from "electron";
import { FSWatcher } from "fs";
import fs from "fs";
import tmp from 'tmp';

// SqlGenerator, Export, Import, and ChildProcessWithoutNullStreams (used by
// backup) removed in Tasks 1.3/1.4. State slots that referenced them are gone
// or typed `unknown` until Phase 2 reshapes the connection IPC.

export interface TempFile {
  fileObject: tmp.FileResult,
  fileHandle: fs.promises.FileHandle
}

class State {
  port: MessagePortMain = null
  server: IDbConnectionPublicServer = null;
  usedConfig: IConnection = null;
  connection: BasicDatabaseClient<any, any> = null;
  transactionTimeouts: Map<number, NodeJS.Timeout> = new Map();
  database: string = null;
  username: string = null;
  queries: Map<string, CancelableQuery> = new Map();

  connectionAbortController: AbortController = null;

  // enums
  enumsInitialized = false;

  private enumWatcher: FSWatcher = null;

  set watcher(value: FSWatcher) {
    if (this.enumWatcher != null) this.enumWatcher.close();
    this.enumWatcher = value;
  }

  // temp files
  tempFiles: Map<string, TempFile> = new Map();
}

const states = new Map<string, State>();

// I kinda hate this tbh. modifying could be scary
export function state(id: string): State {
  return states.get(id);
}

export function newState(id: string): void {
  states.set(id, new State());
}

export function removeState(id: string): void {
  states.delete(id);
}

export const errorMessages = {
  noUsername: 'No username provided',
  noDatabase: 'No database connection found',
  noServer: 'No server found',
  noQuery: 'Query not found',
};

export function getDriverHandler(name: string) {
  return async function({sId }: { sId: string }): Promise<any> {
    return await state(sId).connection[name]();
  }
}

export function checkConnection(sId: string) {
  if (!state(sId).connection) {
    throw new Error(errorMessages.noDatabase);
  }
}

