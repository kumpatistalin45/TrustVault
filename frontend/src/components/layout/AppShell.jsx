import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { TemporaryAccessBanner } from "../common/TemporaryAccessBanner";
import { useAuth } from "../../context/AuthContext";

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isMockMode, role } = useAuth();

  return (
    <div
      data-role={role || "viewer"}
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        background: "var(--bg-gradient)",
        backgroundAttachment: "fixed"
      }}
    >
      {/* Frosted Glass Atmospheric Left Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%", maxWidth: "100%", position: "relative" }}>
        {/* Frosted Glass Top Navigation */}
        <Header onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} isSidebarOpen={isSidebarOpen} />

        {/* Workspace Canvas */}
        <main
          className="app-main-content"
          style={{
            flex: 1,
            padding: "32px 36px",
            maxWidth: "1440px",
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box"
          }}
        >
          <Outlet />
        </main>

        {/* 5-Minute Floating Temporary Access Banner */}
        <TemporaryAccessBanner />
      </div>
    </div>
  );
}

export default AppShell;
