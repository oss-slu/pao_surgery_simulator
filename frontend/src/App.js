import React, { useState, useRef } from "react";
import LoginPage from "./LoginPage";
import SignupPage from "./signup";
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login"); // "login" | "signup"
  const [selectedImage, setSelectedImage] = useState(null);
  const [fileName, setFileName] = useState("No file chosen");
  const fileInputRef = useRef(null);

  const handleLoginSuccess = (userData) => setUser(userData);
  const handleSignupSuccess = (userData) => setUser(userData);
  const handleLogout = () => {
    setUser(null);
    setSelectedImage(null);
    setFileName("No file chosen");
    setPage("login");
  };
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(URL.createObjectURL(file));
      setFileName(file.name);
    } else {
      setSelectedImage(null);
      setFileName("No file chosen");
      if (file) alert("Please select an image file!");
    }
  };
  const handleButtonClick = () => fileInputRef.current.click();

  if (!user) {
    return page === "login" ? (
      <LoginPage 
        onLoginSuccess={handleLoginSuccess} 
        onSwitchToSignup={() => setPage("signup")} 
      />
    ) : (
      <SignupPage 
        onSignupSuccess={handleSignupSuccess} 
        onSwitchToLogin={() => setPage("login")} 
      />
    );
  }

  return (
    <div className="app-container">
      <h2>Welcome to Simulation Surgery, {user.username}!</h2>

      <input type="file" accept="image/*" onChange={handleFileChange} ref={fileInputRef} className="input-file-hidden" />
      <button onClick={handleButtonClick} className="file-upload-button">Choose Image</button>

      <div className="file-display">
        <span>{fileName}</span>
      </div>
      {selectedImage && <img src={selectedImage} alt="Preview" />}
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default App;