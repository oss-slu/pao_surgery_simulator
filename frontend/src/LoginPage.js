import React, { useState } from "react";
import './LoginPage.css'; 

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/login", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Invalid username or password");
        }
        throw new Error("Something went wrong. Please try again.");
      }
      const data = await res.json();
      if (onLoginSuccess) {
        onLoginSuccess({ username, ...data });
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
          <h1 className="logo-text"><bold><italic>Welcome to Surgery Simulator</italic></bold></h1>
        </div>
        <p className="copyright">OSS-SLU/pao_Surgery_simulator</p>
      </div>
      <div className="right-panel">
        <div className="form-container">
          <div className="tabs">
            <button className="tab">Sign Up</button>
            <button className="tab active">Sign In</button>
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
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>
          <a href="#" className="secondary-link">
            Don't have an Account?
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;