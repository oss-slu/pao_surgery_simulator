import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VTKViewer from "../components/VTKViewer";
import { sessionFetch } from "../sessionApi";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";

/**
 * Viewer page (route: /viewer/:uploadId)
 *
 * Reads :uploadId from the URL, builds the model URL, and
 * passes it to the existing VTKViewer component.
 *
 * Model URL convention (matches backend):
 *   GET /api/render_dicom/<uploadId> returns the .vti file
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
            const response = await sessionFetch(`${API_BASE}/api/scans/${encodeURIComponent(uploadId)}/labels`, {
                method: "POST",
                body: {
                    name: "Demo anatomy point",
                    description: "Temporary label sent from the viewer.",
                    coordinates: { x: 12.5, y: 8.25, z: -4.75 },
                    body_part_id: "demo-body-part",
                    scan_2d_id: uploadId,
                    scan_3d_id: uploadId,
                    visible: true,
                },
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
        setModelUrl(`${API_BASE}/api/render_dicom/${encodeURIComponent(uploadId)}`);
    }, [uploadId]);

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100vh",
                minHeight: 0,
                background: "#1a1a2e",
                fontFamily: "sans-serif",
                overflow: "hidden",
            }}
        >
            <header
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    minHeight: "3rem",
                    boxSizing: "border-box",
                    padding: "0.4rem 1rem",
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
                        padding: "0.3rem 0.7rem",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        whiteSpace: "nowrap",
                    }}
                >
                    ← Dashboard
                </button>
                <span style={{ color: "#a0aec0", fontSize: "0.8rem", minWidth: 0, overflowWrap: "anywhere" }}>
                    Model ID:{" "}
                    <code
                        style={{
                            background: "#0f3460",
                            color: "#90cdf4",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "4px",
                        }}
                        aria-label={`Model ID ${uploadId}`}
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
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.8rem",
                        whiteSpace: "nowrap",
                    }}
                >
                    Send dummy label
                </button>
                {labelStatus && <span role="status" style={{ color: "#ffffff" }}>{labelStatus}</span>}
            </header>

            <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {modelUrl && <VTKViewer modelUrl={modelUrl} label={createdLabel} />}
            </main>
        </div>
    );
}

export default Viewer;