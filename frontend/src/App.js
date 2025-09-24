import React, { useState } from "react";
import LoginPage from "./LoginPage";

function App() {
  const [file, setFile] = useState(null);

  const fileSelect = (e) => {
    const selectedFile = e.target.files && e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <div>
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h1>Welcome to Simulation Surgery</h1>
        <LoginPage />
      </div>

      {file && (
        <div>
          <p style={{ padding: "20px" }}>
            Selected file: {file.name}
          </p>
        </div>
      )}

      <div style={{ position: "fixed", bottom: 20, display: "flex", alignItems: "center" }}>
        {/* You can add footer elements here if needed */}
      </div>

      <input
        id="fileInput"
        type="file"
        accept="image/*"
        onChange={fileSelect}
        style={{ display: "none" }}
      />
      <label htmlFor="fileInput" style={{ padding: "20px" }}>
        Select File
      </label>
    </div>
  );
}

export default App;
