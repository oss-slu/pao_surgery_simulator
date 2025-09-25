import React, { useState } from "react";
import LoginPage from "./LoginPage";

function App() {
  const [user, setUser] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // When login is successful
  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  // Logout
  const handleLogout = () => {
    setUser(null);
    setSelectedImage(null);
  };

  // Handle file select & preview
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedImage(URL.createObjectURL(file));
    } else {
      setSelectedImage(null);
      alert("Please select an image file!");
    }
  };

  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-md text-center">
        <h2 className="text-2xl font-bold mb-6">
          Welcome to Simulation Surgery, {user.username}!
        </h2>

        {/* File upload */}
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 mb-4"
        />

        {/* Image preview */}
        {selectedImage && (
          <div className="mb-4">
            <img
              src={selectedImage}
              alt="Preview"
              className="mx-auto max-h-64 rounded-lg shadow"
            />
          </div>
        )}

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default App;
