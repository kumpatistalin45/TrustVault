import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiGetDownloadHistory } from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import {
  FileText,
  Clock,
  CheckCircle2,
  Info,
  Calendar,
  Hash,
  ArrowRight,
  ShieldCheck,
  Eye,
  X
} from "lucide-react";

export function DownloadHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await apiGetDownloadHistory();
        setHistory(res.downloads || []);
      } catch (err) {
        console.warn("Failed to load download history:", err);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const formatDateTime = (isoString) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "30px",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                margin: 0
              }}
            >
              Download History
            </h1>
            <span
              style={{
                background: "rgba(15, 23, 42, 0.08)",
                color: "var(--text-primary)",
                padding: "3px 10px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              Read-Only
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14.5px", margin: 0 }}>
            Confirmed records of documents accessed and downloaded by your account.
          </p>
        </div>

        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-primary)",
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            padding: "8px 16px",
            borderRadius: "9999px",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            textDecoration: "none",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)"
          }}
        >
          <span>Browse My Documents</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Service Boundary Informational Banner */}
      <div
        className="frosted-panel"
        style={{
          padding: "16px 20px",
          borderRadius: "20px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: 1.5
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(15, 23, 42, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#0f172a",
            flexShrink: 0
          }}
        >
          <Info size={16} />
        </div>
        <div>
          <span>
            This history is strictly read-only and reflects confirmed downloads completed in your authenticated session. To obtain or re-download an authorized file, initiate a fresh request from{" "}
            <Link to="/" style={{ color: "var(--text-primary)", fontWeight: 700, textDecoration: "underline" }}>
              My Documents
            </Link>.
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card-white" style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading confirmed download records...
        </div>
      ) : history.length === 0 ? (
        <div
          className="card-white"
          style={{
            padding: "64px 32px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            borderRadius: "28px"
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              marginBottom: "16px"
            }}
          >
            <Clock size={28} />
          </div>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "6px"
            }}
          >
            No download records found yet
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", maxWidth: "420px", margin: "0 auto 24px auto", lineHeight: 1.5 }}>
            When you download assigned files from My Documents, your confirmed download events will be tracked and displayed here.
          </p>
          <Link
            to="/"
            className="btn-primary"
            style={{ textDecoration: "none", padding: "10px 22px", fontSize: "13.5px" }}
          >
            Go to My Documents
          </Link>
        </div>
      ) : (
        /* Read-Only History Table */
        <div className="table-container" style={{ borderRadius: "24px" }}>
          <table className="vault-table">
            <thead>
              <tr>
                <th>Document Name & ID</th>
                <th>Category</th>
                <th>File Size</th>
                <th>Download Timestamp</th>
                <th>Verification Status</th>
                <th style={{ textAlign: "right" }}>Record Info</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr
                  key={record.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedRecord(record)}
                  title="Click to view read-only record details"
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "12px",
                          background: "rgba(15, 23, 42, 0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#0f172a",
                          flexShrink: 0
                        }}
                      >
                        <FileText size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span
                          className="truncate-filename"
                          title={record.document_name}
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            display: "block"
                          }}
                        >
                          {record.document_name}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-muted)"
                          }}
                        >
                          #{record.document_id} • Record {record.id}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        background: "rgba(15, 23, 42, 0.05)",
                        color: "var(--text-secondary)",
                        fontWeight: 500
                      }}
                    >
                      {record.category || "General"}
                    </span>
                  </td>

                  <td style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                    {formatFileSize(record.size_bytes)}
                  </td>

                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-primary)" }}>
                      <Calendar size={13} color="var(--text-muted)" />
                      <span>{formatDateTime(record.timestamp)}</span>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "#059669",
                        padding: "3px 10px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.05em"
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>CONFIRMED</span>
                    </span>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn-circle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecord(record);
                      }}
                      title="View read-only details"
                      style={{ width: "32px", height: "32px", display: "inline-flex" }}
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Details Read-Only Modal (No download / retry / delete action) */}
      {selectedRecord && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.35)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)"
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRecord(null);
          }}
        >
          <div
            className="animate-fade-in card-white"
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "32px",
              borderRadius: "28px",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    display: "block",
                    marginBottom: "4px"
                  }}
                >
                  Download Audit Record
                </span>
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0
                  }}
                >
                  {selectedRecord.document_name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="btn-circle"
                style={{ width: "32px", height: "32px" }}
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px"
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Record ID:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>
                  {selectedRecord.id}
                </span>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px"
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Document ID:</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>
                  #{selectedRecord.document_id}
                </span>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px"
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Timestamp:</span>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {formatDateTime(selectedRecord.timestamp)}
                </span>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px"
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Delivery Status:</span>
                <span style={{ color: "#059669", fontWeight: 700 }}>
                  CONFIRMED COMPLETED
                </span>
              </div>
            </div>

            <div
              className="frosted-panel"
              style={{
                borderRadius: "16px",
                padding: "14px",
                fontSize: "12.5px",
                color: "var(--text-muted)",
                lineHeight: 1.45,
                marginBottom: "20px"
              }}
            >
              <strong>Notice:</strong> This record is strictly read-only. In accordance with security policy, repeat downloads cannot be triggered from history; initiate any authorized download from My Documents.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedRecord(null)}
                style={{ padding: "8px 20px", fontSize: "13px" }}
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DownloadHistoryPage;
