import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VTKViewer from "../components/VTKViewer";

const API_BASE = "http://127.0.0.1:5000";

/**
 * Viewer page (route: /viewer/:uploadId)
 *
 * Reads :uploadId from the URL, builds the model URL, and
 * passes it to the existing VTKViewer component.
 *
 * Model URL convention (matches backend):
 *   GET /api/uploads/<uploadId>/model  → returns the .vti file
 */
function Viewer() {
    const { uploadId } = useParams();
    const navigate = useNavigate();
    const [modelUrl, setModelUrl] = useState("");

    useEffect(() => {
        if (!localStorage.getItem("username")) {
            navigate("/login", { replace: true });
            return;
        }
        // Construct the VTI model URL served by the Flask backend
        setModelUrl(`${API_BASE}/api/uploads/${uploadId}/model`);
    }, [uploadId, navigate]);

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                background: "#1a1a2e",
                fontFamily: "sans-serif",
            }}
        >
            {/* Top bar */}
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1.5rem",
                    background: "#16213e",
                    borderBottom: "1px solid #0f3460",
                    flexShrink: 0,
                }}
            >
                <button
                    onClick={() => navigate("/dashboard")}
                    style={{
                        background: "none",
                        border: "1px solid #4a90d9",
                        color: "#4a90d9",
                        padding: "0.4rem 1rem",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                    }}
                >
                    ← Dashboard
                </button>
                <span style={{ color: "#a0aec0", fontSize: "0.9rem" }}>
                    Viewing upload:{" "}
                    <code
                        style={{
                            background: "#0f3460",
                            color: "#90cdf4",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "4px",
                        }}
                    >
                        {uploadId}
                    </code>
                </span>
            </header>

            {/* VTK Viewer */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                {modelUrl && <VTKViewer modelUrl={modelUrl} />}
            </div>
        </div>
    );
}

export default Viewer;