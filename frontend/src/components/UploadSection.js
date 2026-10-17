import React, { useRef, useState } from "react";
import toast from "react-hot-toast";
import "./UploadSection.css";
import { sessionFetch } from "../sessionApi";

function UploadSection({ apiBase, onBack, onUploadComplete }) {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleChooseFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setError("");
  };

  const handleUpload = async () => {
    if (!files.length) {
      toast.error("Please select one or more DICOM files first.");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    try {
      const res = await sessionFetch(`${apiBase}/api/upload_dicom`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      if (typeof data.upload_id !== "string" || !data.upload_id) {
        throw new Error("The upload response did not include a scan ID.");
      }

      onUploadComplete?.(files.map((file) => file.name), {
        uploadId: data.upload_id,
        addedAt: new Date().toISOString(),
        patientName: data.patient_name,
      });
      toast.success("Files uploaded successfully");
    } catch (err) {
      console.error(err);
      setError(err.message);
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
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
    </div>
  );
}

export default UploadSection;
