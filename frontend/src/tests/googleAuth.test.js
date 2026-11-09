/**
 * googleAuth: credential exchange with POST /api/auth/google (mocked fetch).
 */
import {
  GoogleAuthError,
  _resetGoogleAuthInFlightForTests,
  authenticateWithGoogleCredential,
  handleGoogleCredentialResponse,
} from '../googleAuth';
import { clearAuthStorage } from './test-utils';
import { readSessionToken } from '../sessionApi';

const API_BASE = 'http://127.0.0.1:5000';

function loginPayload(overrides = {}) {
  return {
    message: 'Login successful',
    user_id: 11,
    user_name: 'googleuser',
    session_token: 'google-session-token',
    issued_at: 1_800_000_000,
    expires_at: 1_800_003_600,
    ...overrides,
  };
}

beforeEach(() => {
  clearAuthStorage();
  _resetGoogleAuthInFlightForTests();
  jest.restoreAllMocks();
});

test('authenticateWithGoogleCredential stores session like password login', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => loginPayload(),
  });

  const data = await authenticateWithGoogleCredential(API_BASE, 'id-token');

  expect(global.fetch).toHaveBeenCalledWith(
    `${API_BASE}/api/auth/google`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ credential: 'id-token' }),
    })
  );
  expect(readSessionToken()).toBe('google-session-token');
  expect(localStorage.getItem('user_id')).toBe('11');
  expect(localStorage.getItem('user_name')).toBe('googleuser');
  expect(data.user_name).toBe('googleuser');
});

test('authenticateWithGoogleCredential rejects missing credential', async () => {
  global.fetch = jest.fn();
  await expect(
    authenticateWithGoogleCredential(API_BASE, '')
  ).rejects.toBeInstanceOf(GoogleAuthError);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('authenticateWithGoogleCredential maps ACCOUNT_CONFLICT', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({
      error: 'Unable to sign in with Google for this email. Sign in with your existing password instead.',
      code: 'ACCOUNT_CONFLICT',
    }),
  });

  await expect(
    authenticateWithGoogleCredential(API_BASE, 'token')
  ).rejects.toMatchObject({
    name: 'GoogleAuthError',
    code: 'ACCOUNT_CONFLICT',
    status: 409,
  });
  expect(localStorage.getItem('user_id')).toBeNull();
});

test('authenticateWithGoogleCredential maps EMAIL_NOT_VERIFIED', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    }),
  });

  await expect(
    authenticateWithGoogleCredential(API_BASE, 'token')
  ).rejects.toMatchObject({
    code: 'EMAIL_NOT_VERIFIED',
    status: 403,
  });
});

test('authenticateWithGoogleCredential maps invalid credential failures', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Invalid Google credential' }),
  });

  await expect(
    authenticateWithGoogleCredential(API_BASE, 'bad')
  ).rejects.toMatchObject({
    message: 'Invalid Google credential',
    status: 401,
  });
});

test('handleGoogleCredentialResponse ignores duplicate in-flight calls', async () => {
  let resolveFetch;
  global.fetch = jest.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
  );

  const first = handleGoogleCredentialResponse(API_BASE, {
    credential: 'token-a',
  });
  const second = handleGoogleCredentialResponse(API_BASE, {
    credential: 'token-b',
  });

  expect(global.fetch).toHaveBeenCalledTimes(1);

  resolveFetch({
    ok: true,
    status: 200,
    json: async () => loginPayload(),
  });

  await expect(first).resolves.toMatchObject({ user_id: 11 });
  await expect(second).resolves.toBeNull();
});

test('handleGoogleCredentialResponse notifies onSuccess and onError', async () => {
  const onSuccess = jest.fn();
  const onError = jest.fn();

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => loginPayload(),
  });

  await handleGoogleCredentialResponse(
    API_BASE,
    { credential: 'ok' },
    { onSuccess, onError }
  );
  expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ user_id: 11 }));
  expect(onError).not.toHaveBeenCalled();

  _resetGoogleAuthInFlightForTests();
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Invalid Google credential' }),
  });

  await expect(
    handleGoogleCredentialResponse(
      API_BASE,
      { credential: 'bad' },
      { onSuccess, onError }
    )
  ).rejects.toBeInstanceOf(GoogleAuthError);
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Invalid Google credential' })
  );
});
