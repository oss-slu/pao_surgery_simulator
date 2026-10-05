import React from "react";
import { Navigate } from "react-router-dom";

/**
 * ProtectedRoute – wraps routes that require authentication.
 * Checks for "user_id" in localStorage (set by LoginPage.js on successful login).
 * If not found, redirects to /login.
 */

function ProtectedRoute({ children }) {
  const userId = localStorage.getItem("user_id");
  if (!userId) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default ProtectedRoute;