import React, { useState, useRef } from "react";
import LoginPage from "./Components/LoginPage.js";
import VTKViewer from "./VTKViewer";
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [fileName, setFileName] = useState("No file chosen");
  const fileInputRef = useRef(null);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedImage(null);
    setFileName("No file chosen");
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(URL.createObjectURL(file));
      setFileName(file.name);
    } else {
      setSelectedImage(null);
      setFileName("No file chosen");
      if (file) {
        alert("Please select an image file!");
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      <div className="welcome-card">
        <h2>
          Welcome to Simulation Surgery, {user.username}!
        </h2>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          ref={fileInputRef}
          className="input-file-hidden"
        />

        <button onClick={handleButtonClick} className="file-upload-button">
          Choose Image
        </button>
        
        {/* --- NEW FILE DISPLAY --- */}
        <div className="file-display">
          <svg
            className="file-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
          </svg>
          <span className="file-name">{fileName}</span>
        </div>

        {selectedImage && (
          <>
            <div className="image-preview">
            <img src={selectedImage} alt="Preview" />
            </div>

            <div className="vtk-viewer-container">
              <h3>3D Model Viewer</h3>
                <VTKViewer />
            </div>
        </>
        )}

        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
    </div>
  );
}

export default App;