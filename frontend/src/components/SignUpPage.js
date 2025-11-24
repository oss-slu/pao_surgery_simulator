import React, { useState } from "react";
import "./LoginPage.css";

function SignUpPage({ onBackToLogin }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Currently just a demo; no backend signup
    alert("Sign up successful! Now log in with your credentials.");
    onBackToLogin();
  };

  return (
    <div className="login-page">
      <div className="left-panel">
        <div className="left-panel-content">
          <h1 className="logo-text">PAO Surgery Simulator</h1>
          <p style={{ color: "white", marginTop: "1rem" }}>
            Create an account to manage simulation cases and collaborate with
            your team.
          </p>
        </div>
        <p className="copyright">
          © {new Date().getFullYear()} Simulation Surgery Lab
        </p>
      </div>

      <div className="right-panel">
        <div className="form-container">
          <div className="tabs">
            <button className="tab" type="button" onClick={onBackToLogin}>
              Login
            </button>
            <button className="tab active">Sign Up</button>
          </div>

          <h2 style={{ marginBottom: "1.5rem" }}>Create an account</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Your name"
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="form-group">
              <label>Organization</label>
              <input
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="Hospital / University (optional)"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Create a password"
              />
            </div>

            <button className="submit-btn" type="submit">
              Sign Up
            </button>

            <button
              type="button"
              className="secondary-link"
              onClick={onBackToLogin}
            >
              Already have an account? Login
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignUpPage;
