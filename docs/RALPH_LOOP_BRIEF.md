# Ralph Loop Brief — SOQL Manager

**Use this as the loop's starter prompt.** It sets scope, gates, and halt conditions. The full spec is `SOQL_MANAGER_PRD.md` — read it before doing anything.

---

## Mission

Drive `SOQL_MANAGER_PRD.md` to completion, one task at a time, in order. Phase 1 first. Phase 2 only after Phase 1 is tagged complete and a human says go.

## Read this first

1. `SOQL_MANAGER_PRD.md` — full spec. Don't skim. The "Decisions baked in" panel up top is your guardrails.
2. `CLAUDE.md` at repo root — authoritative list of build, test, and lint commands for this fork. The PRD's gate stack is paraphrased; treat `CLAUDE.md` as the source of truth if they disagree.

## Operating rules

- **One task at a time.** Don't merge tasks, don't skip ahead. The PRD ordering is intentional.
- **One logical commit per task.** Conventional Commits. `chore(cleanse): ...`, `feat(sf): ...`, `refactor(connection): ...`.
- **Push only to `feat/soql-manager-phase-1-cleanse` (Phase 1) or `feat/soql-manager-phase-2-poc` (Phase 2).** Never to `main`. Never force-push.
- **Validate after every meaningful edit** (real script names, run from repo root):
  - `yarn all:lint` — ESLint across studio + sqltools + shared.
  - `yarn test:unit` — Jest unit tests (studio + ui-kit).
  - `yarn bks:build` — full Electron bundle. Run only at task end, not after every edit.
  - There is no `typecheck` script. esbuild and Vite strip TypeScript types without checking. If a task needs type verification, run `yarn workspace soql-manager tsc --noEmit -p tsconfig.json` ad-hoc and note it in the journal.
  - Stop on the first failure.
- **If a path in the PRD doesn't exist in the actual tree, do not invent.** Run `rg -l <hint>` to find the equivalent, update the PRD via PR, then proceed.

## Hard halt conditions — stop and wait for a human

You must halt and wait for explicit human approval (chat reply, commit comment, issue update — pick one and stick with it) at:

1. **End of Task 0.1** — after baseline build proves the fork is green as-is. Confirm the starting commit hash, API version, and "fork builds clean" before going further.
2. **End of Task 1.1** — after `docs/cleanse-inventory.md` is committed. Hard gate. Do not begin Task 1.2 until a human approves the kill list.
3. **End of Phase 1** — after tagging `phase-1-cleanse-complete`. Phase 2 needs a local environment and human OAuth steps.
4. **End of Phase 2** — after tagging `phase-2-poc-complete`. Run the manual acceptance script in §8.8 of the PRD with a human present.

## Soft halt conditions — log and wait, don't improvise

Halt and write `docs/blockers/<utc-timestamp>.md` with the error and last 3 attempts if any of these fire:

- Edited the same file 3+ times trying to make lint or `tsc --noEmit` pass.
- `yarn install` fails with a peer-dep conflict. **Do not** add *new* entries to root `resolutions`. (Two pre-existing entries — `cpu-features`, `**/axios` — are inherited from upstream and stay.)
- An OAuth round-trip fails with a non-2xx from Salesforce. Capture the full body. Do not retry blindly.
- `better-sqlite3` shows up on a delete candidate list. Stop — the spec explicitly preserves it.
- Any task in the PRD has a "Done when" criterion you can't satisfy after one honest attempt.

## Scope guards — do NOT do these in this run

- ❌ Do not upgrade Electron, Vue, TypeScript, or jsforce versions.
- ❌ Do not implement SOQL execution, autocomplete, or result-grid SF rendering. That's Phase 3.
- ❌ Do not add OS keychain / keytar storage. Reuse Beekeeper's encrypted app DB.
- ❌ Do not implement the deferred OAuth failure modes (`token_invalid`, `token_revoked`, `network` retry). Bucket them into `unknown` per Task 2.4a.
- ❌ Do not port any Beekeeper Ultimate / paid-tier code if you find references. Flag and skip.
- ❌ Do not rebrand beyond Task 1.6 (name, productName, window title). Icons, splash, theming are later.
- ❌ Do not delete LICENSE / NOTICE files. GPLv3 attribution stays.
- ❌ Do not enable telemetry or crash reporting. Telemetry is stripped per §5; crash reporting is deferred.

## Definition of done for the run

- `phase-1-cleanse-complete` tag pushed, gate stack (`yarn all:lint`, `yarn test:unit`, `yarn bks:build`) green on the cleansed tree.
- `phase-2-poc-complete` tag pushed, manual acceptance script (`docs/poc-acceptance.md`) passes end-to-end against a real dev org.
- `docs/loop-journal/` populated with one entry per task.
- `docs/poc-deferred.md` lists everything POC explicitly didn't build.
- No orphaned skipped tests. No *new* `resolutions` overrides beyond the two inherited from upstream. No commits to `main`.

## Reporting cadence

After each task: append a one-paragraph entry to `docs/loop-journal/phase-<n>-<utc-timestamp>.md` covering:

- Task ID and name.
- What changed (files touched, commit hash).
- Validation gate results.
- Anything surprising — paths that didn't match the PRD, deps that wouldn't remove, behaviors that differed from spec.
- Next task you're starting.

## When in doubt

Halt. Write the blocker doc. Wait. The spec was designed with halt-and-ask gates because rework after the fact is more expensive than a five-minute human check.

---

*Loop start command: `Begin Task 0.1 of SOQL_MANAGER_PRD.md. Halt at the first hard gate.`*
