import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../components/LoginPage.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";

/**
 * Email verification page (route: /verify?token=...)
 *
 * Public — users land here from the verification email before logging in.
 * Does not create a session or write tokens to localStorage.
 */
function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState(() => (token ? "loading" : "missing"));
  const [message, setMessage] = useState(() =>
    token ? "Verifying your email…" : "This verification link is missing a token."
  );

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      setMessage("This verification link is missing a token.");
      return;
    }

    let cancelled = false;

    async function verify() {
      setStatus("loading");
      setMessage("Verifying your email…");
      try {
        const res = await fetch(`${API_BASE}/api/verify_email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (cancelled) return;

        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified");
          return;
        }

        if (data.code === "token_expired") {
          setStatus("expired");
          setMessage(data.error || "Verification link has expired");
          return;
        }

        if (data.code === "token_invalid") {
          setStatus("invalid");
          setMessage(data.error || "Invalid verification link");
          return;
        }

        setStatus("error");
        setMessage(
          typeof data.error === "string" && data.error
            ? data.error
            : "Unable to verify your email. Please try again later."
        );
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Unable to verify your email. Please try again later.");
      }
    }

    verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const title =
    status === "success"
      ? "Email verified"
      : status === "loading"
        ? "Verifying email"
        : "Verification failed";

  return (
    <div className="auth-wrapper">
      <div className="login-page">
        <div className="left-panel">
          <div className="left-panel-content">
            <h1 className="logo-text">PAO Surgery Simulator</h1>
            <p style={{ color: "white", marginTop: "1rem" }}>
              Confirm your account email to continue using the simulator.
            </p>
          </div>
          <p className="copyright">
            © {new Date().getFullYear()} Simulation Surgery Lab
          </p>
        </div>

        <div className="right-panel">
          <div className="form-container">
            <h2>{title}</h2>
            <p role="status">{message}</p>
            {status === "success" && (
              <p>Your email has been verified. You can log in to continue.</p>
            )}
            {status !== "loading" && (
              <Link className="submit-btn" to="/login" style={{ display: "block", textDecoration: "none" }}>
                Go to login
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;
