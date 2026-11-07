/**
 * Google Identity Services helpers and backend credential exchange.
 * Uses GIS (accounts.google.com/gsi/client), not the deprecated Google Sign-In platform library.
 */
import { storeSession } from "./sessionApi";

const GIS_SRC = "https://accounts.google.com/gsi/client";

let scriptPromise = null;
let authInFlight = false;

export class GoogleAuthError extends Error {
  constructor(message, { code = null, status = null } = {}) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
    this.status = status;
  }
}

export function getGoogleClientId() {
  return (process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
}

export function loadGoogleIdentityScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is unavailable in this environment."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const fail = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Google sign-in."));
    };

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Exchange a GIS ID token for an application session.
 * Does not store the Google credential.
 */
export async function authenticateWithGoogleCredential(apiBase, credential) {
  if (typeof credential !== "string" || !credential.trim()) {
    throw new GoogleAuthError("Missing Google credential");
  }

  const base = (apiBase || "").replace(/\/$/, "");
  const response = await fetch(`${base}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: credential.trim() }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      (typeof data.error === "string" && data.error) ||
      "Google sign-in failed";
    throw new GoogleAuthError(message, {
      code: typeof data.code === "string" ? data.code : null,
      status: response.status,
    });
  }

  storeSession(data);
  localStorage.setItem("user_id", String(data.user_id));
  localStorage.setItem("user_name", data.user_name);
  return data;
}

/**
 * Single-flight wrapper so duplicate GIS callbacks cannot race.
 */
export async function handleGoogleCredentialResponse(
  apiBase,
  gisResponse,
  { onSuccess, onError } = {}
) {
  if (authInFlight) {
    return null;
  }
  authInFlight = true;
  try {
    const data = await authenticateWithGoogleCredential(
      apiBase,
      gisResponse?.credential
    );
    onSuccess?.(data);
    return data;
  } catch (error) {
    onError?.(error);
    throw error;
  } finally {
    authInFlight = false;
  }
}

/** Test-only: reset the in-flight guard between cases. */
export function _resetGoogleAuthInFlightForTests() {
  authInFlight = false;
}
