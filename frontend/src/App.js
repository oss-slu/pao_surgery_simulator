import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./App.css";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Viewer from "./pages/Viewer";
import ProtectedRoute from "./components/ProtectedRoute";


function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        {/* Default: redirect root to /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />
        
        <Route path="/dashboard" element={<ProtectedRoute> <Dashboard /> </ProtectedRoute> } />

        {/* :uploadId is read by Viewer via useParams and passed to VTKViewer */}
        <Route path="/viewer/:uploadId" element={<ProtectedRoute> <Viewer /> </ProtectedRoute>}/>

        {/* Catch-all → back to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
