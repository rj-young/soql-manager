// Task 2.4 "Done when": unit tests for oauth.ts with mocked HTTP listener +
// token endpoint. The flow binds a real loopback listener on an ephemeral
// port (port 0); the "browser" is an injected openExternal that immediately
// requests the callback URL; the token endpoint is an injected fetchFn.

import http from 'http';
import { buildAuthUrl, runOAuthFlow, SfOAuthConfig, FetchLike, CALLBACK_PATH } from '@/lib/sf/oauth';

const CONFIG: SfOAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  myDomainUrl: 'https://acme-dev-ed.develop.my.salesforce.com',
  port: 0, // ephemeral — the flow reflects the bound port into redirect_uri
};

const TOKEN_PAYLOAD = {
  access_token: 'access-123',
  refresh_token: 'refresh-456',
  instance_url: 'https://acme-dev-ed.develop.my.salesforce.com',
  id: 'https://login.salesforce.com/id/00D000000000001EAA/005000000000001AAA',
  issued_at: '1750000000000',
  signature: 'sig==',
  token_type: 'Bearer',
};

function fetchOk(payload: unknown = TOKEN_PAYLOAD): jest.MockedFunction<FetchLike> {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(payload)),
  });
}

function fetchFail(status: number, body: string): jest.MockedFunction<FetchLike> {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

// Plays the browser: takes the auth URL the flow tried to open, lifts
// redirect_uri + state out of it, and hits the callback like Salesforce would.
function browserRedirect(transform?: (params: URLSearchParams, authParams: URLSearchParams) => void) {
  return async (authUrl: string): Promise<void> => {
    const authParams = new URL(authUrl).searchParams;
    const redirectUri = authParams.get('redirect_uri');
    if (!redirectUri) throw new Error('auth URL missing redirect_uri');

    const params = new URLSearchParams({
      code: 'auth-code-789',
      state: authParams.get('state') ?? '',
    });
    transform?.(params, authParams);

    const callbackUrl = `${redirectUri}?${params.toString()}`;
    await new Promise<void>((resolve, reject) => {
      http.get(callbackUrl, (res) => {
        res.resume();
        res.on('end', resolve);
      }).on('error', reject);
    });
  };
}

describe('buildAuthUrl', () => {
  it('builds the authorize URL off the My Domain with all required params', () => {
    const url = new URL(buildAuthUrl(CONFIG, 'http://localhost:1717/oauth/callback', 'state-abc'));
    expect(url.origin).toBe('https://acme-dev-ed.develop.my.salesforce.com');
    expect(url.pathname).toBe('/services/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:1717/oauth/callback');
    expect(url.searchParams.get('scope')).toBe('api refresh_token offline_access');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('prompt')).toBe('login');
  });

  it('never includes the client secret', () => {
    const url = buildAuthUrl(CONFIG, 'http://localhost:1717/oauth/callback', 's');
    expect(url).not.toContain(CONFIG.clientSecret);
  });
});

describe('runOAuthFlow', () => {
  it('completes the happy path: browser round-trip, code exchange, camel-cased tokens', async () => {
    const fetchFn = fetchOk();
    const result = await runOAuthFlow(CONFIG, { openExternal: browserRedirect(), fetchFn });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      instanceUrl: 'https://acme-dev-ed.develop.my.salesforce.com',
      id: 'https://login.salesforce.com/id/00D000000000001EAA/005000000000001AAA',
      issuedAt: 1750000000000,
      signature: 'sig==',
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [tokenUrl, init] = fetchFn.mock.calls[0];
    expect(tokenUrl).toBe(`${CONFIG.myDomainUrl}/services/oauth2/token`);
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code-789');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
    expect(body.get('redirect_uri')).toMatch(new RegExp(`^http://localhost:\\d+${CALLBACK_PATH}$`));
  });

  it('maps ?error=access_denied to user_denied without hitting the token endpoint', async () => {
    const fetchFn = fetchOk();
    const denied = browserRedirect((params) => {
      params.delete('code');
      params.set('error', 'access_denied');
    });

    const result = await runOAuthFlow(CONFIG, { openExternal: denied, fetchFn });
    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('user_denied');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a state mismatch', async () => {
    const fetchFn = fetchOk();
    const tampered = browserRedirect((params) => params.set('state', 'forged-state'));

    const result = await runOAuthFlow(CONFIG, { openExternal: tampered, fetchFn });
    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('unknown');
    expect(result.error.message).toContain('state mismatch');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fails with port_in_use on EADDRINUSE and names the port', async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const busyPort = typeof address === 'object' && address ? address.port : 0;

    try {
      const result = await runOAuthFlow(
        { ...CONFIG, port: busyPort },
        { openExternal: jest.fn(), fetchFn: fetchOk() }
      );
      expect(result.ok).toBe(false);
      if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
      expect(result.error.kind).toBe('port_in_use');
      if (result.error.kind === 'port_in_use') {
        expect(result.error.port).toBe(busyPort);
      }
    } finally {
      blocker.close();
    }
  });

  it('surfaces the full body of a non-2xx token exchange', async () => {
    const fetchFn = fetchFail(400, '{"error":"invalid_grant","error_description":"expired authorization code"}');
    const result = await runOAuthFlow(CONFIG, { openExternal: browserRedirect(), fetchFn });

    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('unknown');
    expect(result.error.message).toContain('HTTP 400');
    expect(result.error.message).toContain('expired authorization code');
  });

  it('rejects a token response with no refresh_token', async () => {
    const { refresh_token, ...withoutRefresh } = TOKEN_PAYLOAD;
    const result = await runOAuthFlow(CONFIG, {
      openExternal: browserRedirect(),
      fetchFn: fetchOk(withoutRefresh),
    });

    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('unknown');
    expect(result.error.message).toContain('refresh_token');
  });

  it('rejects a non-https My Domain URL before binding anything', async () => {
    const openExternal = jest.fn();
    const result = await runOAuthFlow(
      { ...CONFIG, myDomainUrl: 'http://insecure.example.com' },
      { openExternal, fetchFn: fetchOk() }
    );

    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('invalid_url');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('times out when the browser never comes back', async () => {
    const result = await runOAuthFlow(CONFIG, {
      openExternal: jest.fn(), // browser "opens" but no callback ever arrives
      fetchFn: fetchOk(),
      timeoutMs: 100,
    });

    expect(result.ok).toBe(false);
    if (result.ok !== false) return; // literal compare — narrows without strictNullChecks
    expect(result.error.kind).toBe('unknown');
    expect(result.error.message).toContain('Timed out');
  });
});
