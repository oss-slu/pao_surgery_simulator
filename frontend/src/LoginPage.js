import React, { useState } from "react";
import './LoginPage.css'; 

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // toggle between Sign In / Sign Up

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = isSignUp ? "/api/signup" : "/api/login";
      const body = isSignUp 
        ? { username, password, email, birthdate } 
        : { username, password };

      const res = await fetch(url, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errMsg = await res.json();
        throw new Error(errMsg.error || "Something went wrong");
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
          <h1 className="logo-text"><strong><em>Welcome to Surgery Simulator</em></strong></h1>
        </div>
        <p className="copyright">OSS-SLU/pao_Surgery_simulator</p>
      </div>
      <div className="right-panel">
        <div className="form-container">
          <div className="tabs">
            <button 
              className={`tab ${isSignUp ? "active" : ""}`} 
              onClick={() => setIsSignUp(true)}
            >
              Sign Up
            </button>
            <button 
              className={`tab ${!isSignUp ? "active" : ""}`} 
              onClick={() => setIsSignUp(false)}
            >
              Sign In
            </button>
          </div>
          <form onSubmit={handleSubmit}>
            {isSignUp && (
              <>
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
              </>
            )}
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
              {loading ? (isSignUp ? "Signing Up..." : "Signing In...") : (isSignUp ? "Sign Up" : "Sign In")}
            </button>
          </form>
          {!isSignUp && (
            <button 
              type="button" 
              className="secondary-link"
              onClick={() => setIsSignUp(true)}
            >
              Don't have an account? Sign Up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;