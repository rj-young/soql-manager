import fs from 'fs';
import path from 'path';
import tmp from 'tmp';
import { parseEnvFile, loadSfEnv } from '@/lib/sf/env';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines and skips blanks and comments', () => {
    const vars = parseEnvFile([
      '# Salesforce Connected App credentials',
      '',
      'SF_CLIENT_ID=abc123',
      'SF_CLIENT_SECRET=s3cret',
      'SF_OAUTH_REDIRECT_PORT=1717',
    ].join('\n'));
    expect(vars).toEqual({
      SF_CLIENT_ID: 'abc123',
      SF_CLIENT_SECRET: 's3cret',
      SF_OAUTH_REDIRECT_PORT: '1717',
    });
  });

  it('strips inline comments from unquoted values but not quoted ones', () => {
    const vars = parseEnvFile([
      'SF_API_VERSION=66.0         # set by Task 0.1',
      'QUOTED="value # not a comment"',
    ].join('\n'));
    expect(vars.SF_API_VERSION).toBe('66.0');
    expect(vars.QUOTED).toBe('value # not a comment');
  });

  it('ignores malformed lines and preserves = inside values', () => {
    const vars = parseEnvFile([
      'NOVALUE',
      '=nokey',
      'TOKEN=abc=def==',
    ].join('\n'));
    expect(vars).toEqual({ TOKEN: 'abc=def==' });
  });
});

describe('loadSfEnv', () => {
  const VAR = 'SF_ENV_SPEC_PROBE';
  let dir: tmp.DirResult;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = tmp.dirSync({ unsafeCleanup: true });
    delete process.env[VAR];
  });

  afterEach(() => {
    process.chdir(originalCwd);
    dir.removeCallback();
    delete process.env[VAR];
  });

  it('loads .env.local from the cwd into process.env', () => {
    fs.writeFileSync(path.join(dir.name, '.env.local'), `${VAR}=from-file\n`);
    process.chdir(dir.name);

    const loaded = loadSfEnv();
    expect(loaded).toBe(path.join(dir.name, '.env.local'));
    expect(process.env[VAR]).toBe('from-file');
  });

  it('never overrides variables already present in the environment', () => {
    fs.writeFileSync(path.join(dir.name, '.env.local'), `${VAR}=from-file\n`);
    process.chdir(dir.name);
    process.env[VAR] = 'from-real-env';

    loadSfEnv();
    expect(process.env[VAR]).toBe('from-real-env');
  });

  it('returns null when no .env.local exists', () => {
    process.chdir(dir.name);
    expect(loadSfEnv()).toBeNull();
    expect(process.env[VAR]).toBeUndefined();
  });
});
