// Copyright (c) 2015 The SQLECTRON Team, 2020 Beekeeper Studio team
// SOQL Manager: factory throws NotImplemented for every connection type until
// Phase 2 Task 2.4 wires SfClient.
import { IDbConnectionDatabase } from "@/lib/db/types"
import { IDbConnectionServer } from "@/lib/db/backendTypes";

export class ClientError extends Error {
  helpLink = null
  constructor(message: string, helpLink: string) {
    super(message)
    this.helpLink = helpLink
  }
}

class NotImplementedClient {
  constructor() {
    throw new Error(
      "No connection client wired yet. Salesforce client lands in Phase 2 Task 2.4. " +
      "See PRD section 8."
    )
  }
}

export function createConnection(_server: IDbConnectionServer, _database: IDbConnectionDatabase) {
  return new NotImplementedClient();
}
