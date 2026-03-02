import React, { useRef, useState } from "react";
import "./UploadSection.css";

function UploadSection({ apiBase, onBack }) {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [renderUrl, setRenderUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  const handleChooseFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setUploadId(null);
    setRenderUrl("");
    setError("");
  };

  const handleUpload = async () => {
    if (!files.length) {
      alert("Please select one or more DICOM files first.");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await fetch(`${apiBase}/api/upload_dicom`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadId(data.upload_id);
      alert("Files uploaded successfully.");
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRender = () => {
    if (!uploadId) {
      alert("Upload a DICOM series before rendering.");
      return;
    }

    setRendering(true);
    setError("");

    try {
      const url = `${apiBase}/api/render_dicom/${uploadId}`;
      setRenderUrl(url);
    } catch (err) {
      console.error(err);
      setError("Failed to start rendering.");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="upload-wrapper">
      <div className="upload-header">
        <h2>Upload DICOM Series</h2>
        <button className="secondary-btn" onClick={onBack}>
          ← Back to dashboard
        </button>
      </div>

      <p className="upload-subtitle">
        Select all slices from a single CT pelvis series (for example
        50–400 DICOM files), then upload and render.
      </p>

      <div className="upload-controls">
        <input
          type="file"
          multiple
          accept=".dcm"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        <button className="primary-btn" onClick={handleChooseFiles}>
          Choose DICOM Files
        </button>
        <button
          className="primary-btn"
          onClick={handleUpload}
          disabled={uploading || !files.length}
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
        <button
          className="primary-btn"
          onClick={handleRender}
          disabled={!uploadId || rendering}
        >
          {rendering ? "Rendering..." : "Render 3D"}
        </button>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <h4>Selected files ({files.length}):</h4>
          <ul>
            {files.map((f, idx) => (
              <li key={idx}>{f.name}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {renderUrl && (
        <div className="rendered-image">
          <h3>3D Rendered Snapshot</h3>
          <img src={renderUrl} alt="3D Render" width="512" height="512" />
        </div>
      )}
    </div>
  );
}

export default UploadSection;
