# Upstream pin — baseline for SOQL Manager fork

This file records the exact state of the upstream tree we forked from, so we can always diff or roll back.

## Fork repo

`rj-young/soql-manager` (forked from `beekeeper-studio/beekeeper-studio` upstream `master`).

## Working branch

Per the harness contract for this session: `claude/review-prd-ralph-docs-eyWub`.

The Ralph brief (`docs/RALPH_LOOP_BRIEF.md`) names `feat/soql-manager-phase-1-cleanse` as the canonical Phase 1 branch. This session's harness pinned a different name; honoring the harness instruction takes precedence. Future Phase 1 sessions targeting the canonical branch should rebase or cherry-pick from here.

## Starting commit

```
b00c0169124c1597354241a5e6d2cb0462d8242d
```

That's the merge commit `b00c0169 Add files via upload`, which is where the PRD and Ralph brief landed. The most recent upstream Beekeeper merge before that is `4a2ae18f Merge pull request #4018 from beekeeper-studio/feat/driver-dep-auto-download` — that's effectively the upstream commit we forked from.

## Date

Task 0.1 baseline run: 2026-05-07 UTC.

## Tree state when baseline ran

- Already on this branch: `claude/review-prd-ralph-docs-eyWub` (one commit ahead of `b00c0169`: `37201cea docs(soql-manager): align PRD and Ralph brief with actual fork layout`).
- Plus one Task 0.1 prerequisite commit: `fee40491 chore(deps): stub xlsx to unblock yarn install in sandboxed env`.

## Toolchain

```
node    v22.22.2
yarn    1.22.22
typescript ~5.8.3 (declared in apps/studio devDependencies)
electron 39.8.5 (declared in apps/studio devDependencies)
```

## Validation gates run on this baseline

See `docs/build-commands.md` for the canonical set. Cloud-environment gate-coverage gaps are documented in `docs/loop-journal/phase-0-2026-05-07T0106Z-task-0-1.md`.

## Three findings the loop should remember

1. **Upstream `yarn install` is broken in sandboxes without `cdn.sheetjs.com` egress.** Worked around by stubbing `xlsx` (commit `fee40491`); slated for proper removal in PRD Task 1.3.
2. **Upstream `yarn all:lint` is a no-op.** ESLint is v6.8.0 (EOL), there is no eslint config in `apps/studio`, and `yarn all:lint` chains a non-existent `sqltools` workspace + a non-existent `shared/**` glob. Effective lint coverage today is zero.
3. **Upstream `tsc --noEmit` is red on HEAD: 274 errors** (135 in `src/`, 65 in `src-commercial/`, 5 in `e2e/`, 69 in `tests/`). Team ships via `ts-jest` with `isolatedModules: true`, which bypasses cross-module type checks. tsc cannot be a regression gate on this fork until the cleanse deletes the offending files.
