import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import WelcomeSection from "../components/WelcomeSection";
import UploadSection from "../components/UploadSection";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";

/**
 * Dashboard page (route: /dashboard)
 *
 * Wraps the existing Sidebar, WelcomeSection, and UploadSection components.
 * Reads the logged-in username from localStorage (set by Login page).
 * On logout, clears localStorage and navigates back to /login.
 * 
 * Now includes a callback to handle successful uploads, which updates the scan list in memory.
 */
function Dashboard() {
    const navigate = useNavigate();
    const [showUpload, setShowUpload] = useState(false);
    const [username, setUsername] = useState("");
    const [scans, setScans] = useState([
        { name: "scan_1", files: ["001.dcm", "002.dcm", "003.dcm"] },
        { name: "scan_2", files: ["004.dcm", "005.dcm"] },
        { name: "scan_3", files: ["006.dcm", "007.dcm", "008.dcm"] },
    ]);
    const handleUploadComplete = (fileNames) => {
        setScans((previous) => [
            ...previous,
            { name: `scan_${previous.length + 1}`, files: [...fileNames] },
        ]);
    };
    
    useEffect(() => {
        const stored = localStorage.getItem("username");
        if (stored) setUsername(stored);
    }, []);


    const handleLogout = () => {
        localStorage.removeItem("username");
        localStorage.removeItem("user_id");
        toast.success("Logged out successfully");
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
                            onUploadComplete={handleUploadComplete}
                            onBack={() => setShowUpload(false)}
                        />
                    ) : (
                        <WelcomeSection
                            username={username}
                            onUploadClick={() => setShowUpload(true)}
                        />
                    )}
                    {!showUpload && <section
                        className="welcome-card"
                        aria-labelledby="patient-scans-heading"
                        style={{ marginTop: "1.5rem" }}
                    >
                        <h2 id="patient-scans-heading" style={{ marginTop: 0 }}>
                            Saved Scans
                        </h2>
                        <p className="welcome-text" id="patient-scans-description">
                            This table lists all the scans you have uploaded. You can use this information to keep track of your uploads 
                            and manage your scans effectively. Click on the upload ID to change the scan's ID or click on the patient name
                            to change the patient name associated with the scan.
                        </p>
                        <p role="status">{scans.length} scans</p>
                        <div style={{ overflowX: "auto" }}>
                            <table
                                aria-labelledby="patient-scans-heading"
                                aria-describedby="patient-scans-description"
                                style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}
                            >
                                <thead style={{ background: "#f4f6fb", color: "#1f2937" }}>
                                    <tr>
                                        <th scope="col" style={cellStyle}>Upload ID</th>
                                        <th scope="col" style={cellStyle}>File count</th>
                                        <th scope="col" style={cellStyle}>DICOM files</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scans.map((scan) => (
                                        <tr key={scan.name}>
                                            <th scope="row" style={cellStyle}>{scan.name}</th>
                                            <td style={cellStyle}>{scan.files.length}</td>
                                            <td style={{ ...cellStyle, overflowWrap: "anywhere" }}>
                                                <div style={{ maxHeight: "10rem", overflowY: "auto" }}>
                                                    {scan.files.join(", ")}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>}
                </div>
            </main>
        </div>
    );
}
const cellStyle = {
    padding: "0.9rem 1rem",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
};

export default Dashboard;
