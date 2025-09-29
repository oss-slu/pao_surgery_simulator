import React from "react";
import LoginPage from "./LoginPage";
import VTKViewer from "./VTKViewer";

function App() {
  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Welcome to Simulation Surgery</h1>
        <LoginPage />
        <VTKViewer />
    </div>
  );
}

export default App;
