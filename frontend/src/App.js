import React, { useState } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileSelect = (e) => {
    const selectedFile = e.target.files && e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    }
  };

  return (
    <div>
      <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Welcome to Simulation Surgery</h1>
      </div>
      {file && (
        <div style={{ textAlign: "center" }}>
          <p style={{ padding: "20px" }}>Selected file: {file.name}
          </p>
        </div>
      )}
      {preview && (
        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <img
            src={preview}
            style={{ maxWidth: "800px" }}
          />
        </div>
      )}
      <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)"}}>
        <input id="fileInput"
          type="file"
          accept="image/*"
          onChange={fileSelect}
          style={{ display: "none" }}
          />
        <label htmlFor="fileInput" 
          style={{ padding: "20px" }}> 
        Select File
        </label>
      </div>
    </div>
  );
}

export default App;
