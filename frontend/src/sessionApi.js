// Shared transport for protected operations.
export function readSessionToken() {
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("session_token="));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice("session_token=".length));
  } catch {
    return null;
  }
}

export async function sessionFetch(url, { method = "POST", body = {}, ...options } = {}) {
  const token = readSessionToken();
  if (!token) {
    const error = new Error("Please log in to continue.");
    error.code = "SESSION_REQUIRED";
    throw error;
  }
  method = method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    throw new Error("Protected operations must use a method that accepts JSON.");
  }

  const headers = new Headers(options.headers);
  let requestBody;
  if (body instanceof FormData) {
    const metadata = body.has("metadata") ? JSON.parse(body.get("metadata")) : {};
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("Upload metadata must be a JSON object.");
    }
    body.set("metadata", JSON.stringify({ ...metadata, session_token: token }));
    // The browser supplies the multipart boundary.
    headers.delete("Content-Type");
    requestBody = body;
  } else {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Protected request data must be an object.");
    }
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify({ ...body, session_token: token });
  }

  // Return the raw response so callers can read JSON, binary models, or ZIP files.
  return fetch(url, { ...options, credentials: "omit", method, headers, body: requestBody });
}
