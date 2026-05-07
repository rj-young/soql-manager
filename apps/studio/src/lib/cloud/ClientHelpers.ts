// Minimal Cloud surface shim. The full Beekeeper Cloud client was removed in
// Phase 1 cleanse (Task 1.1 review). LicenseModule (anti-goal §4: untouched
// Ultimate code) still imports CloudError for instanceof checks; this stub
// preserves the type so LicenseModule compiles, but no actual cloud calls
// happen — license fetch always fails and falls through to community mode.

export class CloudError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'CloudError'
    this.status = status
  }
}
