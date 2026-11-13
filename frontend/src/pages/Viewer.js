import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import VTKViewer from "../components/VTKViewer";
import { sessionFetch } from "../sessionApi";
import { fetchHistory, saveHistory } from "../historyApi";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:5000";
const HISTORY_SAVE_DEBOUNCE_MS = 300;

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
    const [historyStatus, setHistoryStatus] = useState("");
    const [markers, setMarkers] = useState([]);
    const [isUploadingMarkers, setIsUploadingMarkers] = useState(false);
    const [restoredHistory, setRestoredHistory] = useState(null);
    const [historyRestoreKey, setHistoryRestoreKey] = useState(0);
    const [historySaveFailed, setHistorySaveFailed] = useState(false);
    const markersRef = useRef([]);
    const uploadedIdsRef = useRef(new Set());
    const isUploadingMarkersRef = useRef(false);
    const revisionRef = useRef(0);
    const pendingSnapshotRef = useRef(null);
    const saveTimerRef = useRef(null);
    const saveGenerationRef = useRef(0);
    const autoRetriedRef = useRef(false);

    const addMarkerStroke = useCallback(({ markers: strokeMarkers }) => {
        const toAdd = strokeMarkers.filter(
            (marker) => !uploadedIdsRef.current.has(marker.id)
        );
        if (toAdd.length === 0) return;

        const updatedMarkers = [...markersRef.current, ...toAdd];
        markersRef.current = updatedMarkers;
        setMarkers(updatedMarkers);
    }, []);

    const removeMarkerStroke = useCallback((strokeId) => {
        const updatedMarkers = markersRef.current.filter(
            (marker) => marker.strokeId !== strokeId
        );
        markersRef.current = updatedMarkers;
        setMarkers(updatedMarkers);
    }, []);

    const persistHistory = useCallback(async (snapshot, { isRetry = false } = {}) => {
        const generation = saveGenerationRef.current;
        if (!uploadId || !snapshot) return;

        try {
            const saved = await saveHistory(uploadId, {
                revision: revisionRef.current,
                cursor: snapshot.cursor,
                actions: snapshot.actions,
            });
            if (generation !== saveGenerationRef.current) return;
            if (!saved || !Number.isInteger(saved.revision)) {
                throw new Error("History save returned an invalid response.");
            }
            revisionRef.current = saved.revision;
            setHistorySaveFailed(false);
            autoRetriedRef.current = false;
            setHistoryStatus("");
        } catch (error) {
            if (generation !== saveGenerationRef.current) return;

            if (error.code === "REVISION_CONFLICT" && error.body) {
                revisionRef.current = error.body.revision ?? 0;
                markersRef.current = [];
                setMarkers([]);
                setRestoredHistory({
                    cursor: error.body.cursor ?? 0,
                    actions: Array.isArray(error.body.actions) ? error.body.actions : [],
                });
                setHistoryRestoreKey((key) => key + 1);
                setHistorySaveFailed(false);
                setHistoryStatus("History conflict — reloaded from server.");
                return;
            }

            if (!isRetry && !autoRetriedRef.current) {
                autoRetriedRef.current = true;
                await persistHistory(snapshot, { isRetry: true });
                return;
            }

            setHistorySaveFailed(true);
            setHistoryStatus("History save failed.");
        }
    }, [uploadId]);

    const scheduleHistorySave = useCallback((snapshot) => {
        pendingSnapshotRef.current = snapshot;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            const pending = pendingSnapshotRef.current;
            pendingSnapshotRef.current = null;
            persistHistory(pending);
        }, HISTORY_SAVE_DEBOUNCE_MS);
    }, [persistHistory]);

    const lastSnapshotRef = useRef(null);

    const handleHistoryChange = useCallback((snapshot) => {
        lastSnapshotRef.current = snapshot;
        autoRetriedRef.current = false;
        scheduleHistorySave(snapshot);
    }, [scheduleHistorySave]);

    const retryLastHistorySave = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        if (!lastSnapshotRef.current) return;
        persistHistory(lastSnapshotRef.current, { isRetry: true });
    }, [persistHistory]);

    const uploadMarkers = async () => {
        if (isUploadingMarkersRef.current || markersRef.current.length === 0) return;
        const markersToUpload = [...markersRef.current];
        isUploadingMarkersRef.current = true;
        setIsUploadingMarkers(true);
        setLabelStatus(`Uploading ${markersToUpload.length} marker(s)...`);
        let uploadedCount = 0;

        try {
            for (const marker of markersToUpload) {
                const response = await sessionFetch(
                    `${API_BASE}/api/scans/${encodeURIComponent(uploadId)}/labels`,
                    {
                        method: "POST",
                        body: {
                            name: "Marker",
                            description: `Drawn marker (${marker.color})`,
                            coordinates: marker.coordinates,
                            scan_2d_id: uploadId,
                            scan_3d_id: uploadId,
                            visible: true,
                        },
                    }
                );
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || `Marker upload failed (${response.status})`);
                }

                uploadedCount += 1;
                uploadedIdsRef.current.add(marker.id);
                const remainingMarkers = markersRef.current.filter(({ id }) => id !== marker.id);
                markersRef.current = remainingMarkers;
                setMarkers(remainingMarkers);
            }
            setLabelStatus(`Uploaded ${uploadedCount} marker(s).`);
        } catch (error) {
            setLabelStatus(
                uploadedCount
                    ? `Uploaded ${uploadedCount} marker(s); some markers could not be uploaded: ${error.message}`
                    : error.message
            );
        } finally {
            isUploadingMarkersRef.current = false;
            setIsUploadingMarkers(false);
        }
    };

    useEffect(() => {
        saveGenerationRef.current += 1;
        const generation = saveGenerationRef.current;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        pendingSnapshotRef.current = null;
        lastSnapshotRef.current = null;
        markersRef.current = [];
        uploadedIdsRef.current = new Set();
        setMarkers([]);
        setLabelStatus("");
        setHistoryStatus("");
        setHistorySaveFailed(false);
        autoRetriedRef.current = false;
        revisionRef.current = 0;
        setRestoredHistory({ cursor: 0, actions: [] });
        setHistoryRestoreKey((key) => key + 1);
        setModelUrl(`${API_BASE}/api/render_dicom/${encodeURIComponent(uploadId)}`);

        let cancelled = false;
        void (async () => {
            try {
                const history = await fetchHistory(uploadId);
                if (cancelled || generation !== saveGenerationRef.current) return;
                revisionRef.current = history.revision;
                setRestoredHistory({
                    cursor: history.cursor,
                    actions: history.actions,
                });
                setHistoryRestoreKey((key) => key + 1);
            } catch (error) {
                if (cancelled || generation !== saveGenerationRef.current) return;
                setHistoryStatus(error.message || "Unable to load edit history.");
            }
        })();

        return () => {
            cancelled = true;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
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
                {historyStatus && (
                    <span role="status" aria-label="History status" style={{ color: "#ffffff" }}>
                        {historyStatus}
                        {historySaveFailed && (
                            <button
                                type="button"
                                onClick={retryLastHistorySave}
                                style={{
                                    marginLeft: "0.5rem",
                                    background: "#0f3460",
                                    border: "1px solid #90cdf4",
                                    color: "#ffffff",
                                    cursor: "pointer",
                                    padding: "0.15rem 0.45rem",
                                }}
                            >
                                Retry
                            </button>
                        )}
                    </span>
                )}
            </header>

            <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {modelUrl && (
                    <VTKViewer
                        modelUrl={modelUrl}
                        onMarkerStrokeAdded={addMarkerStroke}
                        onMarkerStrokeRemoved={removeMarkerStroke}
                        restoredHistory={restoredHistory}
                        historyRestoreKey={historyRestoreKey}
                        onHistoryChange={handleHistoryChange}
                    />
                )}
            </main>
        </div>
    );
}

export default Viewer;
