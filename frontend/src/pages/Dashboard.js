import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import WelcomeSection from "../components/WelcomeSection";
import UploadSection from "../components/UploadSection";

const API_BASE = "http://127.0.0.1:5000";

/**
 * Dashboard page (route: /dashboard)
 *
 * Wraps the existing Sidebar, WelcomeSection, and UploadSection components.
 * Reads the logged-in username from localStorage (set by Login page).
 * On logout, clears localStorage and navigates back to /login.
 */
function Dashboard() {
    const navigate = useNavigate();
    const [showUpload, setShowUpload] = useState(false);
    const [username, setUsername] = useState("");

    useEffect(() => {
        const stored = localStorage.getItem("username");
        if (!stored) {
            // Not logged in – redirect to login
            navigate("/login", { replace: true });
        } else {
            setUsername(stored);
        }
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem("username");
        navigate("/login", { replace: true });
    };

    if (!username) return null; // still resolving auth

    return (
        <div className="app-shell">
            <Sidebar username={username} onLogout={handleLogout} />
            <main className="main-content">
                <div className="page-container">
                    {showUpload ? (
                        <UploadSection
                            apiBase={API_BASE}
                            onBack={() => setShowUpload(false)}
                        />
                    ) : (
                        <WelcomeSection
                            username={username}
                            onUploadClick={() => setShowUpload(true)}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

export default Dashboard;