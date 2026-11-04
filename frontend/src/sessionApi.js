// Shared transport and renewal for protected operations.
const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";
// "Close to expiry" requires a threshold; refresh during the final minute.
const RENEW_BEFORE_MS = 60 * 1000;
const SESSION_CHANGE = "pao-session-change";
let redirectingToLogin = false;
let renewalPromise = null;
let logoutPromise = null;
let loggingOut = false;

function cookieValue(name) {
  const part = document.cookie.split(";").map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(name.length + 1)); }
  catch { return null; }
}

export function readSessionToken() {
  return cookieValue("session_token");
}

function expirationTime() {
  const value = Number(cookieValue("session_expires_at"));
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0;
}

function notifySessionChange() {
  // Only a change notification is stored here, never a session credential.
  localStorage.setItem(SESSION_CHANGE, `${Date.now()}:${Math.random()}`);
  window.dispatchEvent(new Event(SESSION_CHANGE));
}

export function clearSession() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  for (const name of ["session_token", "session_expires_at"]) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_name");
  notifySessionChange();
}

export function storeSession(data) {
  if (typeof data.session_token !== "string" || !data.session_token ||
      !Number.isInteger(data.issued_at) || !Number.isInteger(data.expires_at) ||
      data.expires_at - data.issued_at !== 3600) {
    throw new Error("The server returned an invalid login session.");
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const settings = `; Max-Age=3600; Path=/; SameSite=Lax${secure}`;
  document.cookie = `session_token=${encodeURIComponent(data.session_token)}${settings}`;
  document.cookie = `session_expires_at=${data.expires_at}${settings}`;
  redirectingToLogin = false;
  notifySessionChange();
}

function rejectSession(code, message) {
  // Set the guard before notifying activity listeners to prevent recursion.
  if (!redirectingToLogin) {
    redirectingToLogin = true;
    clearSession();
    const reason = code === "SESSION_EXPIRED" ? "expired" : "required";
    window.location.replace(`/login?reason=${reason}`);
  }
  const error = new Error(message);
  error.code = code;
  error.status = 401;
  throw error;
}

function requireToken() {
  const token = readSessionToken();
  if (!token) rejectSession("SESSION_REQUIRED", "Please log in to continue.");
  return token;
}

function waitForReplacement(token) {
  if (readSessionToken() !== token) return Promise.resolve();
  // Another tab may have won the backend's atomic renewal. Wait for its cookie
  // update instead of deleting the shared session while its response arrives.
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("storage", changed);
      window.removeEventListener(SESSION_CHANGE, changed);
      resolve();
    };
    const changed = () => { if (readSessionToken() !== token) finish(); };
    const timeout = window.setTimeout(finish, 20000);
    window.addEventListener("storage", changed);
    window.addEventListener(SESSION_CHANGE, changed);
    changed();
  });
}

async function renewIfNeeded(apiBase) {
  if (renewalPromise) return renewalPromise;
  requireToken();
  if (expirationTime() - Date.now() > RENEW_BEFORE_MS) return;
  renewalPromise = (async () => {
    const oldToken = requireToken();
    // Cookies may have been updated by another request or tab.
    if (expirationTime() - Date.now() > RENEW_BEFORE_MS) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      // Use fetch directly: sessionFetch would recursively attempt renewal.
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/session/refresh`, {
        method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: oldToken }), signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      // A logout or fresh login must not be overwritten by a late response.
      if (readSessionToken() !== oldToken) return;
      if (response.status === 401) {
        if (data?.code === "SESSION_INVALID") {
                  await waitForReplacement(oldToken);
                  if (readSessionToken() && readSessionToken() !== oldToken) return;
                }
        const expired = data?.code === "SESSION_EXPIRED";
        rejectSession(expired ? "SESSION_EXPIRED" : "SESSION_INVALID",
          expired ? "Your session expired. Please log in again." : "Please log in again.");
      }
      if (!response.ok) throw new Error(data?.error || "Unable to renew session.");
      storeSession(data);
    } finally {
      window.clearTimeout(timeout);
    }
  })().finally(() => { renewalPromise = null; });
  return renewalPromise;
}

function requestBody(body, token, headers) {
  if (body instanceof FormData) {
    // Copy to keep concurrent requests and safe retries from mutating caller data.
    const form = new FormData();
    for (const [name, value] of body.entries()) form.append(name, value);
    const metadata = form.has("metadata") ? JSON.parse(form.get("metadata")) : {};
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("Upload metadata must be a JSON object.");
    }
    form.set("metadata", JSON.stringify({ ...metadata, session_token: token }));
    headers.delete("Content-Type");
    return form;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Protected request data must be an object.");
  }
  headers.set("Content-Type", "application/json");
  return JSON.stringify({ ...body, session_token: token });
}

export async function logoutSession(apiBase = API_BASE) {
  if (logoutPromise) return logoutPromise;
  loggingOut = true;
  logoutPromise = (async () => {
    // Revoke the replacement if a renewal was already in progress.
    if (renewalPromise) {
      try { await renewalPromise; } catch { /* Revoke the remaining token, if any. */ }
    }
    const token = readSessionToken();
    if (token) {
      // Logout must not generate another token, so bypass sessionFetch.
      const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/logout`, {
        method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: token }),
      });
      if (readSessionToken() && readSessionToken() !== token) {
        throw new Error("Your session changed. Please try logging out again.");
      }
      // An invalid/expired session is already unusable; clear it locally too.
      if (!response.ok && response.status !== 401) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to log out. Please try again.");
      }
    }
    // Avoid the activity listener treating intentional logout as expiration.
    redirectingToLogin = true;
    clearSession();
  })().finally(() => {
    loggingOut = false;
    logoutPromise = null;
  });
  return logoutPromise;
}

export async function sessionFetch(url, { method = "POST", body = {}, ...options } = {}) {
  if (loggingOut) throw new Error("Logout is in progress.");
  method = method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    throw new Error("Protected operations must use a method that accepts JSON.");
  }
  const endpoint = new URL(url, window.location.href);
  const apiBase = endpoint.origin;
  const requestUser = localStorage.getItem("user_id");
  await renewIfNeeded(apiBase);
  if (loggingOut) throw new Error("Logout is in progress.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
      if (localStorage.getItem("user_id") !== requestUser) {
        throw new Error("The signed-in account changed. Please try the operation again.");
      }
      const sentToken = requireToken();
      const headers = new Headers(options.headers);
      const response = await fetch(url, {
        ...options, credentials: "omit", method, headers,
        body: requestBody(body, sentToken, headers),
      });
    if (response.status !== 401) return response;
    const data = await response.clone().json().catch(() => ({}));
    if (renewalPromise) await renewalPromise;
    if (data?.code === "SESSION_INVALID" && readSessionToken() === sentToken &&
            expirationTime() - Date.now() <= RENEW_BEFORE_MS) {
          await waitForReplacement(sentToken);
        }
    // Refresh may have replaced a token that an earlier request submitted.
    // Retry only a known pre-handler auth rejection, never a network/500 failure.
    const replaced = readSessionToken() && readSessionToken() !== sentToken;
    const sameUser = localStorage.getItem("user_id") === requestUser;
    if (replaced) {
      if (attempt === 0 && sameUser &&
          ["SESSION_INVALID", "SESSION_EXPIRED"].includes(data?.code)) continue;
      // Do not clear a newer login because of a stale response.
      throw new Error("Your session changed. Please try the operation again.");
    }
    const expired = data?.code === "SESSION_EXPIRED";
    rejectSession(expired ? "SESSION_EXPIRED" : "SESSION_INVALID",
      expired ? "Your session expired. Please log in again." : "Please log in again.");
  }
}

export function startSessionActivity(apiBase = API_BASE) {
  let stopped = false;
  let checking = false;
  const mountedUser = localStorage.getItem("user_id");
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];

  const check = async () => {
    if (stopped || checking || redirectingToLogin || loggingOut || document.visibilityState !== "visible") return;
    checking = true;
    try {
      await renewIfNeeded(apiBase);
    } catch (error) {
      if (error.status !== 401) {
        console.error("Session renewal failed:", error);
      }
    } finally {
      checking = false;
    }
  };
  const onActivity = (event) => {
    if (!event.isTrusted || document.visibilityState !== "visible") return;
      void check();
  };
  const onChange = () => {
    if (stopped || redirectingToLogin) return;
    if (!readSessionToken()) {
      try { rejectSession("SESSION_REQUIRED", "Please log in again."); } catch { /* navigation started */ }
    } else if (localStorage.getItem("user_id") !== mountedUser) {
      // Discard another account's private page state after a login in another tab.
      window.location.replace("/dashboard");
    }
  };
  const onStorage = (event) => { if (event.key === SESSION_CHANGE) onChange(); };
  events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
  window.addEventListener(SESSION_CHANGE, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    stopped = true;
    events.forEach((name) => window.removeEventListener(name, onActivity));
    window.removeEventListener(SESSION_CHANGE, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
