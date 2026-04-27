import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginPage from "../components/LoginPage";
import SignUpPage from "../components/SignUpPage";

const API_BASE = "http://127.0.0.1:5000";

/**
 * Login page (route: /login)
 *
 * Wraps the existing LoginPage and SignUpPage components.
 * On successful login, stores the username in localStorage
 * and navigates to /dashboard via React Router.
 */
function Login() {
    const navigate = useNavigate();
    const [showSignUp, setShowSignUp] = useState(false);

    const handleLoginSuccess = (username) => {
        localStorage.setItem("username", username);
        navigate("/dashboard");
    };

    if (showSignUp) {
        return (
            <div className="auth-wrapper">
                <SignUpPage onBackToLogin={() => setShowSignUp(false)} />
            </div>
        );
    }

    return (
        <div className="auth-wrapper">
            <LoginPage
                apiBase={API_BASE}
                onLoginSuccess={handleLoginSuccess}
                onShowSignUp={() => setShowSignUp(true)}
            />
        </div>
    );
}

export default Login;