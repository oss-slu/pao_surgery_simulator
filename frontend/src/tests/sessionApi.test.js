import { Headers } from 'whatwg-fetch';

const API = 'http://127.0.0.1:5000';
const NOW = Math.floor(Date.now() / 1000) * 1000;
const originalLocation = window.location;
const originalFetch = global.fetch;
let session;
let redirect;

function loginData(token = 'original-token', secondsLeft = 3600) {
  const expires = NOW / 1000 + secondsLeft;
  return { session_token: token, issued_at: expires - 3600, expires_at: expires };
}

function response(status, data = {}) {
  const result = { status, ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(data) };
  result.clone = () => result;
  return result;
}

function signIn(secondsLeft = 3600) {
  session.storeSession(loginData('original-token', secondsLeft));
  localStorage.setItem('user_id', '1');
  localStorage.setItem('user_name', 'testuser');
}

beforeEach(() => {
  jest.resetModules();
  localStorage.clear();
  for (const name of ['session_token', 'session_expires_at']) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  redirect = jest.fn();
  delete window.location;
  window.location = { href: 'http://localhost/dashboard', protocol: 'http:', replace: redirect };
  global.Headers = Headers;
  global.fetch = jest.fn();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  session = require('../sessionApi');
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

afterAll(() => {
  window.location = originalLocation;
  global.fetch = originalFetch;
});

test('stores the backend token and expiry in cookies', () => {
  session.storeSession(loginData());
  expect(session.readSessionToken()).toBe('original-token');
  expect(document.cookie).toContain(`session_expires_at=${NOW / 1000 + 3600}`);
});

test.each([
  {}, { ...loginData(), session_token: '' },
  { ...loginData(), expires_at: NOW / 1000 + 7200 },
])('rejects malformed login session responses (%p)', data => {
  expect(() => session.storeSession(data)).toThrow('invalid login session');
  expect(session.readSessionToken()).toBeNull();
});

test('sends the cookie token in JSON and preserves request fields', async () => {
  signIn();
  global.fetch.mockResolvedValue(response(200));
  await session.sessionFetch(`${API}/api/scans/owned/labels`, {
    body: { name: 'label', session_token: 'forged-value' },
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(`${API}/api/scans/owned/labels`);
  expect(options.method).toBe('POST');
  expect(options.headers.get('Content-Type')).toBe('application/json');
  expect(JSON.parse(options.body)).toEqual({ name: 'label', session_token: 'original-token' });
});

test('uploads carry token in JSON metadata without mutating the original form', async () => {
  signIn();
  global.fetch.mockResolvedValue(response(200));
  const form = new FormData();
  form.append('files', new File(['DICOM'], 'scan.dcm'));
  form.set('metadata', JSON.stringify({ description: 'scan' }));
  await session.sessionFetch(`${API}/api/upload_dicom`, { body: form });
  const sent = global.fetch.mock.calls[0][1];
  expect(JSON.parse(sent.body.get('metadata'))).toEqual({
    description: 'scan', session_token: 'original-token',
  });
  expect(sent.body.get('files').name).toBe('scan.dcm');
  expect(sent.headers.has('Content-Type')).toBe(false);
  expect(JSON.parse(form.get('metadata'))).toEqual({ description: 'scan' });
});

test('missing cookie redirects without submitting a protected operation', async () => {
  await expect(session.sessionFetch(`${API}/api/sessions`)).rejects.toMatchObject({ status: 401 });
  expect(redirect).toHaveBeenCalledWith('/login?reason=required');
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  ['SESSION_EXPIRED', 'expired'], ['SESSION_INVALID', 'required'],
  ['SESSION_REQUIRED', 'required'],
])('handles backend %s by clearing the cookie and redirecting', async (code, reason) => {
  signIn();
  global.fetch.mockResolvedValue(response(401, { code }));
  await expect(session.sessionFetch(`${API}/api/sessions`)).rejects.toMatchObject({ status: 401 });
  expect(session.readSessionToken()).toBeNull();
  expect(document.cookie).not.toContain('session_expires_at=');
  expect(localStorage.getItem('user_id')).toBeNull();
  expect(localStorage.getItem('user_name')).toBeNull();
  expect(redirect).toHaveBeenCalledWith(`/login?reason=${reason}`);
});

test.each([403, 404, 500])('preserves the session for HTTP %s errors', async status => {
  signIn();
  const backend = response(status, { code: status === 403 ? 'ACCESS_DENIED' : undefined });
  global.fetch.mockResolvedValue(backend);
  expect(await session.sessionFetch(`${API}/api/sessions`)).toBe(backend);
  expect(session.readSessionToken()).toBe('original-token');
  expect(redirect).not.toHaveBeenCalled();
});

test('returns binary responses unchanged', async () => {
  signIn();
  const backend = response(200);
  backend.arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(8));
  global.fetch.mockResolvedValue(backend);
  const result = await session.sessionFetch(`${API}/api/render_dicom/owned`);
  expect(result).toBe(backend);
  expect((await result.arrayBuffer()).byteLength).toBe(8);
});

test.each([60, 59, 1])('renews with %s seconds left before submitting the operation', async seconds => {
  signIn(seconds);
  global.fetch.mockResolvedValueOnce(response(200, loginData('replacement-token')))
    .mockResolvedValueOnce(response(200));
  await session.sessionFetch(`${API}/api/sessions`);
  expect(global.fetch.mock.calls[0][0]).toBe(`${API}/api/session/refresh`);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).session_token).toBe('original-token');
  expect(JSON.parse(global.fetch.mock.calls[1][1].body).session_token).toBe('replacement-token');
  expect(session.readSessionToken()).toBe('replacement-token');
});

test('does not renew outside the final minute', async () => {
  signIn(61);
  global.fetch.mockResolvedValue(response(200));
  await session.sessionFetch(`${API}/api/sessions`);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe(`${API}/api/sessions`);
});

test('an idle expired session is rejected during renewal and requires login', async () => {
  signIn(-1);
  global.fetch.mockResolvedValue(response(401, { code: 'SESSION_EXPIRED' }));
  await expect(session.sessionFetch(`${API}/api/sessions`)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(session.readSessionToken()).toBeNull();
  expect(redirect).toHaveBeenCalledWith('/login?reason=expired');
});

test('an invalid renewal token eventually requires login if no tab replaces it', async () => {
  jest.useFakeTimers();
  signIn(30);
  global.fetch.mockResolvedValue(response(401, { code: 'SESSION_INVALID' }));
  const pending = session.sessionFetch(`${API}/api/sessions`);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  // Let the refresh response establish the replacement-token wait timer.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  jest.advanceTimersByTime(20000);
  await rejected;
  expect(session.readSessionToken()).toBeNull();
  expect(redirect).toHaveBeenCalledWith('/login?reason=required');
});

test.each([500, 'network', 'malformed'])('failed renewal (%s) does not send the operation or erase the token', async kind => {
  signIn(30);
  if (kind === 'network') global.fetch.mockRejectedValue(new Error('Network unavailable'));
  else global.fetch.mockResolvedValue(response(kind === 500 ? 500 : 200,
    kind === 500 ? { error: 'Unable to renew session' } : {}));
  await expect(session.sessionFetch(`${API}/api/sessions`)).rejects.toThrow();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(session.readSessionToken()).toBe('original-token');
  expect(redirect).not.toHaveBeenCalled();
});

test('concurrent protected requests share one renewal', async () => {
  signIn(30);
  let completeRefresh;
  global.fetch.mockImplementation(url => url.endsWith('/refresh')
    ? new Promise(resolve => { completeRefresh = resolve; })
    : Promise.resolve(response(200)));
  const first = session.sessionFetch(`${API}/api/sessions`);
  const second = session.sessionFetch(`${API}/api/users/1/scans`);
  completeRefresh(response(200, loginData('replacement-token')));
  await Promise.all([first, second]);
  expect(global.fetch.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  expect(global.fetch.mock.calls.slice(1).map(([, options]) =>
    JSON.parse(options.body).session_token)).toEqual(['replacement-token', 'replacement-token']);
});

test('being idle does not start background refreshes', async () => {
  jest.useFakeTimers();
  signIn(30);
  const stop = session.startSessionActivity(API);
  try {
    jest.advanceTimersByTime(3600001);
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { stop(); }
});

test('trusted user activity near expiry renews the session', async () => {
  signIn(30);
  let activity;
  const realAddListener = window.addEventListener.bind(window);
  jest.spyOn(window, 'addEventListener').mockImplementation((name, listener, options) => {
    if (name === 'pointerdown') activity = listener;
    realAddListener(name, listener, options);
  });
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  global.fetch.mockResolvedValue(response(200, loginData('replacement-token')));
  const stop = session.startSessionActivity(API);
  try {
    activity({ isTrusted: false });
    expect(global.fetch).not.toHaveBeenCalled();
    activity({ isTrusted: true });
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(global.fetch.mock.calls[0][0]).toBe(`${API}/api/session/refresh`);
    expect(session.readSessionToken()).toBe('replacement-token');
  } finally { stop(); }
});

test.each([200, 401])('logout clears the session after HTTP %s without renewal', async status => {
  signIn(30);
  global.fetch.mockResolvedValue(response(status));
  await session.logoutSession(API);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toBe(`${API}/api/logout`);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).session_token).toBe('original-token');
  expect(session.readSessionToken()).toBeNull();
  expect(localStorage.getItem('user_id')).toBeNull();
});

test('failed logout preserves the session so the user can retry', async () => {
  signIn();
  global.fetch.mockResolvedValue(response(500, { error: 'Unable to log out' }));
  await expect(session.logoutSession(API)).rejects.toThrow('Unable to log out');
  expect(session.readSessionToken()).toBe('original-token');
});
