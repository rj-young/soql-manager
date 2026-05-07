import { CloudError } from './ClientHelpers'

// Minimal Cloud client shim. See ClientHelpers.ts for context. All methods
// reject so LicenseModule's catch path runs and the app falls through to
// community mode without making any network calls.

export const CloudClient = {
  async getLicense(_url: string, _email?: string, _password?: string): Promise<never> {
    throw new CloudError('Beekeeper Cloud disabled in SOQL Manager', 0)
  },
}
