import React from "react";
import { useNavigate } from "react-router-dom";
import { FileQuestion, ArrowLeft, Home } from "lucide-react";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}
    >
      <div
        className="card-white"
        style={{
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          padding: "52px 36px",
          borderRadius: "32px"
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "#0f172a",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.15)"
          }}
        >
          <FileQuestion size={32} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "26px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "8px",
            letterSpacing: "-0.02em"
          }}
        >
          404 — Page Not Found
        </h1>

        <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "32px" }}>
          The vault resource or page you requested does not exist or has been relocated within the directory.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(-1)}
            style={{ padding: "12px 24px", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <ArrowLeft size={15} />
            <span>Go Back</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate("/")}
            style={{ padding: "12px 28px", display: "inline-flex", alignItems: "center", gap: "8px" }}
          >
            <Home size={15} />
            <span>Return to Vault</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
