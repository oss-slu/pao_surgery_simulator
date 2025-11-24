 import React from "react";
import "./Sidebar.css";

function Sidebar({ username, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">PAO</div>
        <div className="sidebar-title">Surgery Simulator</div>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-label">User</p>
        <div className="sidebar-user">{username}</div>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-label">Navigation</p>
        <ul className="sidebar-nav">
          <li className="sidebar-nav-item active">Dashboard</li>
          <li className="sidebar-nav-item">Upload &amp; Render</li>
        </ul>
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
