import React from "react";
import "./WelcomeSection.css";

function WelcomeSection({ username, onUploadClick }) {
  return (
    <div className="welcome-card">
      <h1 className="welcome-title">
        Welcome, <span>{username}</span>
      </h1>
      <p className="welcome-text">
        This dashboard helps you upload DICOM CT series, generate 3D renderings,
        and explore pelvic anatomy for periacetabular osteotomy planning.
      </p>

      <div className="welcome-actions">
        <button className="primary-btn" onClick={onUploadClick}>
          Upload DICOM and Render 3D
        </button>
      </div>

      <div className="welcome-hint">
        Tip: Use a single axial CT pelvis series with 1–3&nbsp;mm slice
        thickness for best results.
      </div>
    </div>
  );
}

export default WelcomeSection;