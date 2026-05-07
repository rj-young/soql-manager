# Salesforce API version pin

## Pinned

```
SF_API_VERSION=66.0
```

Spring '26 (released Feb 2026). jsforce expects this format with no `v` prefix.

## How this was determined

The PRD prescribes fetching `https://<my-domain>.my.salesforce.com/services/data/` and picking the highest `version` whose `label` does not contain "Beta" or "Pre-release". The Claude Code on the web `cloud_default` egress proxy blocks `login.salesforce.com`, `test.salesforce.com`, and `www.salesforce.com` (all returned `host_not_allowed`), and no My Domain dev org is provisioned yet, so dynamic determination was not possible during Task 0.1.

Falling back to the Salesforce release calendar:

| Release | API version | GA date |
|---|---|---|
| Spring '24 | 60.0 | Feb 2024 |
| Summer '24 | 61.0 | Jun 2024 |
| Winter '25 | 62.0 | Oct 2024 |
| Spring '25 | 63.0 | Feb 2025 |
| Summer '25 | 64.0 | Jun 2025 |
| Winter '26 | 65.0 | Oct 2025 |
| **Spring '26** | **66.0** | **Feb 2026** ← current GA |
| Summer '26 | 67.0 | ~Jun 2026 (likely in Sandbox preview / Beta as of writing) |

Today is 2026-05-07. v66.0 is the highest GA. v67.0 has likely entered Beta but is not GA yet.

## Verify before any non-trivial use

The first time a real My Domain URL is available (Phase 2 Task 2.1 onward), confirm:

```bash
curl -s "https://<your-domain>.my.salesforce.com/services/data/" | jq '[.[] | select(.label | test("Beta|Pre-release") | not)] | max_by(.version | tonumber)'
```

If the result differs from `66.0`, update `SF_API_VERSION` in `.env.local` and re-run Phase 2 acceptance against the corrected version.

## Why pin a single version

Per PRD §5: avoid scattering API version strings throughout the code. All call sites read from `SF_API_VERSION`. Bumping the pin is a single env-var change.
