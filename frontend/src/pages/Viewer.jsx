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
    const [labelStatus, setLabelStatus] = useState("");
    const [createdLabel, setCreatedLabel] = useState(null);

    const sendDummyLabel = async () => {
        setLabelStatus("Sending label...");
        try {
            const response = await fetch(`${API_BASE}/api/scans/${uploadId}/labels`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "Demo anatomy point",
                    description: "Temporary label sent from the viewer.",
                    coordinates: { x: 12.5, y: 8.25, z: -4.75 },
                    body_part_id: "demo-body-part",
                    scan_2d_id: uploadId,
                    scan_3d_id: uploadId,
                    visible: true,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Label request failed (${response.status})`);
            setCreatedLabel(data);
            setLabelStatus("Dummy label saved");
        } catch (error) {
            setLabelStatus(error.message);
        }
    };

    useEffect(() => {       
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
                <button
                    onClick={sendDummyLabel}
                    type="button"
                    style={{
                        background: "#4a90d9",
                        border: "1px solid #90cdf4",
                        borderRadius: "6px",
                        color: "#ffffff",
                        cursor: "pointer",
                        padding: "0.4rem 0.75rem",
                        fontSize: "0.9rem",
                        whiteSpace: "nowrap",
                    }}
                >
                    Send dummy label
                </button>
                {labelStatus && <span role="status" style={{ color: "#ffffff" }}>{labelStatus}</span>}
            </header>

            {/* VTK Viewer */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                {modelUrl && <VTKViewer modelUrl={modelUrl} label={createdLabel} />}
            </div>
        </div>
    );
}

export default Viewer;