import React, { useState } from "react";
import './LoginPage.css';

function SignupPage({ onSignupSuccess, onSwitchToLogin }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_name: username,
            user_email: email,
            user_birthdate: birthdate,
            user_password: password,
        }),
      });

      // Try parsing JSON, otherwise fallback to text (handles proxy errors)
      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text();
        throw new Error(`Server returned status ${res.status}: ${text}`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Signup failed");
      }

      if (onSignupSuccess) {
        onSignupSuccess({ username, ...data });
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="left-panel">
        <div className="left-panel-content">
          <h1 className="logo-text">
            <strong>Welcome to Surgery Simulator</strong>
          </h1>
        </div>
        <p className="copyright">OSS-SLU/pao_Surgery_simulator</p>
      </div>

      <div className="right-panel">
        <div className="form-container">
          <div className="tabs">
            <button className="tab active">Sign Up</button>
            <button className="tab" onClick={onSwitchToLogin}>Sign In</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="birthdate">Birthdate</label>
              <input
                id="birthdate"
                type="date"
                value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="error-message">{error}</p>}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? "Signing Up..." : "Sign Up"}
            </button>
          </form>

          <p className="secondary-link">
            Already have an account?{" "}
            <span onClick={onSwitchToLogin} style={{ cursor: "pointer", color: "blue" }}>
              Sign In
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignupPage;