import React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft, Home } from "lucide-react";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";

export function AccessDeniedPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "65vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}
    >
      <Card
        style={{
          maxWidth: "500px",
          width: "100%",
          textAlign: "center",
          padding: "48px 32px"
        }}
      >
        <div
          style={{
            width: "68px",
            height: "68px",
            borderRadius: "50%",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#dc2626",
            marginBottom: "20px"
          }}
        >
          <ShieldAlert size={34} />
        </div>

        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "8px"
          }}
        >
          403 Access Denied Screen
        </h2>

        <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "28px" }}>
          You do not have the necessary security authorization or role privileges to view this resource.
          Server-side access controls blocked this request and recorded the attempt in the audit logs.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          <Button variant="secondary" onClick={() => navigate(-1)} icon={<ArrowLeft size={15} />}>
            Go Back
          </Button>
          <Button variant="primary" onClick={() => navigate("/")} icon={<Home size={15} />}>
            Return to Overview
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default AccessDeniedPage;
