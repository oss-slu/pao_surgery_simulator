import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Viewer from "./pages/Viewer";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default: redirect root to /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* :uploadId is read by Viewer via useParams and passed to VTKViewer */}
        <Route path="/viewer/:uploadId" element={<Viewer />} />

        {/* Catch-all → back to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;