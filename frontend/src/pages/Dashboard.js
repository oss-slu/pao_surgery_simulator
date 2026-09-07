import React, { useState, useEffect, useRef } from "react";
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
        {
            id: "mock1-id", patientName: "Alex Morgan",
            addedAt: "2026-09-01T14:30:00Z",
            files: ["001.dcm", "002.dcm", "003.dcm"],
        },
        {
            id: "mock2-id", patientName: "Taylor Reed",
            addedAt: "2026-09-02T17:15:00Z",
            files: ["004.dcm", "005.dcm"],
        },
        {
            id: "mock3-id", patientName: "patient_name",
            addedAt: "2026-09-03T20:45:00Z",
            files: ["006.dcm", "007.dcm", "008.dcm"],
        },
    ]);
    const handleUploadComplete = (fileNames, upload = {}) => {
        const addedAt = upload.addedAt || new Date().toISOString();
        const patientName = typeof upload.patientName === "string"
            ? upload.patientName.trim() : "";
        setScans((previous) => [
            ...previous,
            {
                id: upload.uploadId,
                patientName: patientName || "patient_name",
                addedAt,
                files: [...fileNames],
            },
        ]);
    };
    
    const handlePatientRename = (scanId, value) => {
        setScans((previous) => previous.map((scan) =>
            scan.id === scanId ? { ...scan, patientName: value } : scan
        ));
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
                            This table lists all the scans you have previously uploaded. Click on a patient's name to edit it if needed.
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
                                        <th scope="col" style={cellStyle}>Date Added</th>
                                        <th scope="col" style={cellStyle}>Patient Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scans.map((scan) => (
                                        <tr key={scan.id}>
                                            <th scope="row" style={cellStyle}>
                                                <span style={{ overflowWrap: "anywhere" }}>{scan.id}</span>
                                                <details style={{ marginTop: "0.5rem", fontWeight: 400 }}>
                                                    <summary style={{ cursor: "pointer" }}>DICOM files</summary>
                                                    <div style={{ maxHeight: "10rem", overflowY: "auto", overflowWrap: "anywhere" }}>
                                                    {scan.files.join(", ")}
                                                </div>
                                                </details>
                                            </th>
                                            <td style={cellStyle}>
                                                <time dateTime={scan.addedAt}>
                                                    {new Date(scan.addedAt).toLocaleString()}
                                                </time>
                                            </td>
                                            <td style={cellStyle}>
                                                <EditableScanName
                                                    value={scan.patientName}
                                                    label={`Patient name for ${scan.id}`}
                                                    onSave={(value) => handlePatientRename(scan.id, value)}
                                                />
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

function EditableScanName({ value, label, onSave }) {
    const [draft, setDraft] = useState(null);
    const cancelled = useRef(false);

    if (draft !== null) {
        return (
            <input
                aria-label={label}
                autoFocus
                value={draft}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                    if (!cancelled.current) onSave(draft.trim() || value);
                    setDraft(null);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.blur();
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelled.current = true;
                        setDraft(null);
                    }
                }}
                style={{ font: "inherit", width: "100%", minWidth: "8rem", boxSizing: "border-box" }}
            />
        );
    }

    return (
        <button
            type="button"
            aria-label={`Edit ${label.toLowerCase()}`}
            onClick={() => {
                cancelled.current = false;
                setDraft(value);
            }}
            style={{
                border: 0, padding: 0, background: "none", color: "#2563eb",
                cursor: "pointer", font: "inherit", textAlign: "left",
                textDecoration: "underline", overflowWrap: "anywhere",
            }}
        >
            {value}
        </button>
    );
}

const cellStyle = {
    padding: "0.9rem 1rem",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
};

export default Dashboard;
