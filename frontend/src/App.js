import React, { useState } from "react";
import "./App.css";
import LoginPage from "./components/LoginPage";
import SignUpPage from "./components/SignUpPage";
import Sidebar from "./components/Sidebar";
import WelcomeSection from "./components/WelcomeSection";
import UploadSection from "./components/UploadSection";

const API_BASE = "http://127.0.0.1:5000";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const handleLoginSuccess = (userName) => {
    setUsername(userName);
    setIsLoggedIn(true);
    setShowSignUp(false);
    setShowUpload(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername("");
    setShowUpload(false);
  };

  const handleShowSignUp = () => {
    setShowSignUp(true);
  };

  const handleBackToLogin = () => {
    setShowSignUp(false);
  };

  const handleUploadClick = () => {
    setShowUpload(true);
  };

  const handleBackToHome = () => {
    setShowUpload(false);
  };

  // Not logged in → show login or signup
  if (!isLoggedIn) {
    if (showSignUp) {
      return (
        <div className="auth-wrapper">
          <SignUpPage onBackToLogin={handleBackToLogin} />
        </div>
      );
    }

    return (
      <div className="auth-wrapper">
        <LoginPage
          apiBase={API_BASE}
          onLoginSuccess={handleLoginSuccess}
          onShowSignUp={handleShowSignUp}
        />
      </div>
    );
  }

  // Logged in → dashboard shell
  return (
    <div className="app-shell">
      <Sidebar username={username} onLogout={handleLogout} />
      <main className="main-content">
        <div className="page-container">
          {showUpload ? (
            <UploadSection apiBase={API_BASE} onBack={handleBackToHome} />
          ) : (
            <WelcomeSection
              username={username}
              onUploadClick={handleUploadClick}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
