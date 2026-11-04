import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { clearSession, readSessionToken, startSessionActivity } from "../sessionApi";

/**
 * ProtectedRoute – wraps routes that require authentication.
 * Requires a session cookie before displaying a protected page.
 * The backend validates the token on each protected operation.
 */

function ProtectedRoute({ children }) {
   const hasToken = Boolean(readSessionToken());
   useEffect(() => {
     if (!hasToken) clearSession();
     else return startSessionActivity();
   }, [hasToken]);
   if (!hasToken) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default ProtectedRoute;