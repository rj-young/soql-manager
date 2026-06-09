// .env.local loader for the Salesforce Connected App credentials — Task 2.5.
//
// Nothing in the Electron main process loaded env files before this (Vite's
// env handling is renderer-only, and the secrets must stay out of the
// renderer anyway). PRD §6.4 puts .env.local at the repo root, gitignored.
//
// Hand-rolled rather than dotenv: dotenv is only a transitive dependency
// here, and the format we need (KEY=VALUE lines, # comments) is trivial.
// Existing process.env values always win so real environment configuration
// overrides the file.
//
// Packaged-release credential sourcing is Open Question §11 Q3 — this loader
// silently no-ops when no file exists, which is the packaged case today.

import fs from 'fs';
import path from 'path';

export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // strip an inline comment unless the value is quoted
    const quoted = /^["'].*["']$/.test(value);
    if (!quoted) {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    } else {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// In dev the main process cwd is apps/studio (yarn electron:serve) or the
// repo root (yarn bks:dev) — probe both for the PRD's root-level .env.local.
function candidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, '.env.local'),
    path.join(cwd, '..', '..', '.env.local'),
  ];
}

// Loads the first .env.local found into process.env (existing keys win).
// Returns the path it loaded, or null — callers only log it.
export function loadSfEnv(): string | null {
  for (const file of candidatePaths()) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const vars = parseEnvFile(content);
    for (const [key, value] of Object.entries(vars)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return file;
  }
  return null;
}
