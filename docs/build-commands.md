# Build commands — canonical gate stack

Pinned during Task 0.1. The Ralph brief and PRD reference these names; if they ever drift, this file is the source of truth.

## Local (full gate stack)

Run from repo root. Stop on first failure.

```bash
yarn install
yarn workspace beekeeper-studio lint                                  # currently a no-op (see "Known issues" below)
yarn workspace beekeeper-studio tsc --noEmit -p tsconfig.json         # currently red on baseline (see "Known issues")
yarn test:unit                                                        # studio + ui-kit Jest suites (needs Electron-rebuilt natives)
yarn bks:build                                                        # full Electron bundle via electron-builder
```

## Cloud (`cloud_default` Claude Code on the web)

The proxy blocks `cdn.sheetjs.com`, `www.electronjs.org`, `artifacts.electronjs.org`, and `login.salesforce.com`. Native modules can't be rebuilt for Electron, and electron-builder won't run.

```bash
yarn install --ignore-scripts                                         # skip electron-rebuild postinstall
yarn workspace beekeeper-studio lint                                  # vacuous pass
yarn lib:build                                                        # ui-kit (vite + tsc on its own types)
yarn workspace beekeeper-studio build                                 # studio main + renderer (esbuild + vite, no native rebuild)
```

The static-compile gate (`yarn workspace beekeeper-studio build`) catches syntactic and bundle-level regressions but does not catch type errors (esbuild and Vite strip types without checking) and does not produce a runnable Electron app.

Deferred to local handoff at the Phase 1 / Phase 2 boundary:

- `yarn test:unit` — Jest under Electron, needs native modules rebuilt against Electron's Node ABI.
- `yarn bks:build` — electron-builder rebuilds natives via `@electron/rebuild`, which needs the Electron headers tarball.
- `yarn bks:dev` smoke test — full Electron run.
- A clean `tsc --noEmit` — currently red on baseline (see below); enable once the cleanse phase deletes the offending files.

## Conventions used by this repo

- Node `v22.22.2`, Yarn `1.22.22`. Yarn workspaces; root `package.json` lists `apps/*` as the workspace pattern.
- Workspaces present: `beekeeper-studio` (`apps/studio`), `@beekeeperstudio/ui-kit` (`apps/ui-kit`).
- Workspaces referenced but missing: `sqltools`. Bare-glob lint target `shared/**` also missing. Both are referenced by the upstream `yarn all:lint` script; both fail. Use `yarn workspace beekeeper-studio lint` directly.
- Build tooling: ESBuild for the Electron main process, Vite for the renderer. Both are static — neither typechecks.
- TypeScript ~5.8.3. No `typecheck` script exists; run `tsc --noEmit -p tsconfig.json` ad-hoc.

## Known issues (recorded baseline; do not "fix" in Task 0.1)

1. **Lint is a no-op.** ESLint is v6.8.0 (EOL since 2020) and `apps/studio` has no eslint config file. `eslint` with no args + no config + v6 prints help text and exits 0. `yarn workspace beekeeper-studio lint` therefore passes vacuously. Real lint coverage will require a config + a modern eslint version; that's not Task 0.1 scope.
2. **`tsc --noEmit` is red on HEAD: 274 errors.** Distributed roughly: 135 in `src/`, 69 in `tests/`, 65 in `src-commercial/`, 5 in `e2e/`. The team ships via `ts-jest` with `isolatedModules: true`, which skips cross-module type checks. Most production-code errors are in DB driver files that Phase 1 cleanse deletes, so the count should drop sharply by end of Phase 1.
3. **`yarn all:lint` references nonexistent workspaces.** Use `yarn workspace beekeeper-studio lint` directly; do not call the chain.

## Why these gates and not others

`bks:dev` runs Electron interactively — only useful for the manual smoke tests in Tasks 1.7 and 2.8. `electron:build` produces a packaged release; we don't need that until distribution. The compile gate above is enough to catch what static checks can catch on this fork.
