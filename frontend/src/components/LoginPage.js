import React, { useState } from "react";
import "./LoginPage.css";

function LoginPage({ apiBase, onLoginSuccess, onShowSignUp }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: username,
          user_password: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid username or password");
        return;
      }

      onLoginSuccess(data.username);

    } catch (err) {
      setError("Network error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left panel */}
      <div className="left-panel">
        <div className="left-panel-content">
          <h1 className="logo-text">PAO Surgery Simulator</h1>
          <p style={{ color: "white", marginTop: "1rem" }}>
            Upload CT DICOM data and generate 3D visualizations for surgical
            planning.
          </p>
        </div>
        <p className="copyright">
          © {new Date().getFullYear()} Simulation Surgery Lab
        </p>
      </div>

      {/* Right panel */}
      <div className="right-panel">
        <div className="form-container">
          <div className="tabs">
            <button className="tab active">Login</button>
            <button className="tab" type="button" onClick={onShowSignUp}>
              Sign Up
            </button>
          </div>

          <h2 style={{ marginBottom: "1.5rem" }}>Welcome back</h2>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <p style={{ color: "red", marginBottom: "0.75rem" }}>{error}</p>
            )}

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>

            <button
              type="button"
              className="secondary-link"
              onClick={onShowSignUp}
            >
              Don&apos;t have an account? Sign up
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
