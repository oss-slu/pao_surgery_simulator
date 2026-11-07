import React, { useCallback, useEffect, useRef, useState } from "react";
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
    const [markers, setMarkers] = useState([]);
    const [isUploadingMarkers, setIsUploadingMarkers] = useState(false);
    const markersRef = useRef([]);
    const isUploadingMarkersRef = useRef(false);

    const addMarker = useCallback((marker) => {
        const updatedMarkers = [...markersRef.current, marker];
        markersRef.current = updatedMarkers;
        setMarkers(updatedMarkers);
    }, []);

    const uploadMarkers = async () => {
        if (isUploadingMarkersRef.current || markersRef.current.length === 0) return;
        const markersToUpload = [...markersRef.current];
        isUploadingMarkersRef.current = true;
        setIsUploadingMarkers(true);
        setLabelStatus(`Uploading ${markersToUpload.length} marker(s)...`);

        try {
            const response = await sessionFetch(
                `${API_BASE}/api/scans/${encodeURIComponent(uploadId)}/labels`,
                {
                    method: "POST",
                    body: {
                        labels: markersToUpload.map((marker) => ({
                            name: "Marker",
                            description: `Drawn marker (${marker.color})`,
                            coordinates: marker.coordinates,
                            scan_2d_id: uploadId,
                            scan_3d_id: uploadId,
                            visible: true,
                        })),
                    },
                }
            );
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `Marker upload failed (${response.status})`);
            }

            const uploadedMarkerIds = new Set(markersToUpload.map(({ id }) => id));
            const remainingMarkers = markersRef.current.filter(
                ({ id }) => !uploadedMarkerIds.has(id)
            );
            markersRef.current = remainingMarkers;
            setMarkers(remainingMarkers);
            setLabelStatus(`Uploaded ${markersToUpload.length} marker(s).`);
        } catch (error) {
            setLabelStatus(error.message);
        } finally {
            isUploadingMarkersRef.current = false;
            setIsUploadingMarkers(false);
        }
    };

    useEffect(() => {
        markersRef.current = [];
        setMarkers([]);
        setLabelStatus("");
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
                    onClick={uploadMarkers}
                    disabled={markers.length === 0 || isUploadingMarkers}
                    type="button"
                    style={{
                        background: "#4a90d9",
                        border: "1px solid #90cdf4",
                        borderRadius: "6px",
                        color: "#ffffff",
                        cursor: markers.length === 0 || isUploadingMarkers ? "not-allowed" : "pointer",
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.8rem",
                        whiteSpace: "nowrap",
                    }}
                >
                    {isUploadingMarkers ? "Uploading markers..." : `Upload markers (${markers.length})`}
                </button>
                {labelStatus && <span role="status" style={{ color: "#ffffff" }}>{labelStatus}</span>}
            </header>

            <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {modelUrl && <VTKViewer modelUrl={modelUrl} onMarkerAdded={addMarker} />}
            </main>
        </div>
    );
}

export default Viewer;
