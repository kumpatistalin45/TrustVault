import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiGetAdminDocuments } from "../services/api";
import { formatDate, formatFileSize } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import {
  FileText,
  Search,
  RotateCcw,
  Shield,
  Lock,
  Eye,
  KeyRound,
  Info,
  Calendar,
  Layers,
  ExternalLink
} from "lucide-react";

export function AdminDocumentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Metadata Inspector Modal
  const [selectedDoc, setSelectedDoc] = useState(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetAdminDocuments({
        search,
        owner: ownerSearch,
        category: categoryFilter
      });
      setDocuments(res.documents || []);
    } catch (err) {
      setError(err.message || "Failed to load document records.");
      showToast(err.message || "Could not retrieve documents", "error");
    } finally {
      setLoading(false);
    }
  }, [search, ownerSearch, categoryFilter, showToast]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const resetFilters = () => {
    setSearch("");
    setOwnerSearch("");
    setCategoryFilter("all");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Document Management & Oversight
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Enterprise document search, cryptographic metadata inspection, and owner assignment oversight.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchDocs} disabled={loading} icon={<RotateCcw size={14} />}>
          Refresh
        </Button>
      </div>

      {/* Zero-Trust Document Oversight Alert */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "14px",
          background: "rgba(14, 165, 233, 0.08)",
          border: "1px solid rgba(14, 165, 233, 0.25)",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          fontSize: "12.5px",
          color: "var(--text-primary)",
          lineHeight: 1.5
        }}
      >
        <Lock size={18} color="#0ea5e9" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong style={{ display: "block", color: "#0284c7", marginBottom: "2px" }}>
            Enforced Cryptographic Access Policy (Section 3)
          </strong>
          Administrators have oversight of vault metadata, ownership, categories, and permission rules.
          In accordance with TrustVault's zero-trust separation policy, having an Admin role does <em>not</em> grant unrestricted
          plaintext file decryption. Decryption keys remain strictly bound to owner-authorized permissions.
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ padding: "18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "14px", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Document Name
            </label>
            <Input
              placeholder="Search filename..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search size={15} color="var(--text-muted)" />}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Document Owner
            </label>
            <Input
              placeholder="Owner name or email..."
              value={ownerSearch}
              onChange={(e) => setOwnerSearch(e.target.value)}
              prefix={<Search size={15} color="var(--text-muted)" />}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Category
            </label>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: "all", label: "All Categories" },
                { value: "Engineering", label: "Engineering" },
                { value: "Security", label: "Security" },
                { value: "Finance", label: "Finance" },
                { value: "Legal", label: "Legal" }
              ]}
            />
          </div>

          <div>
            <Button variant="ghost" size="sm" onClick={resetFilters} style={{ width: "100%", height: "40px" }}>
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Documents Oversight Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "20px" }}>
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: "40px 20px" }}>
            <EmptyState
              title="No documents match search"
              description="Refine your document name, owner, or category filter to inspect documents."
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "rgba(248, 250, 252, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.9)" }}>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Document File
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Owner
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Category
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Size
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Upload Date
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
                    Oversight Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    style={{ borderBottom: "1px solid rgba(226, 232, 240, 0.6)", transition: "background 0.15s ease" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(241, 245, 249, 0.4)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(14, 165, 233, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
                          <FileText size={16} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <span
                            className="truncate-filename"
                            title={doc.name}
                            style={{ display: "block", fontWeight: 700, color: "var(--text-primary)" }}
                          >
                            {doc.name}
                          </span>
                          <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                            ID #{doc.id} • {doc.mime_type || "application/pdf"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary)" }}>
                        {doc.owner_name || "Enterprise Owner"}
                      </span>
                      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {doc.owner_email || "owner@trustvault.internal"}
                      </span>
                    </td>

                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: "8px", background: "rgba(15, 23, 42, 0.06)", fontSize: "11.5px", fontWeight: 600, color: "#334155" }}>
                        {doc.category || "General"}
                      </span>
                    </td>

                    <td style={{ padding: "14px 18px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {formatFileSize(doc.size_bytes)}
                    </td>

                    <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                      {formatDate(doc.created_at)}
                    </td>

                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "8px" }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDoc(doc)}
                          icon={<Eye size={13} />}
                        >
                          Metadata
                        </Button>
                        <Link to="/admin/permissions" style={{ textDecoration: "none" }}>
                          <Button variant="ghost" size="sm" icon={<KeyRound size={13} />}>
                            Permissions
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Metadata Inspection Modal */}
      {selectedDoc && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedDoc(null)}
          title={`Document Metadata: ${selectedDoc.name}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                fontSize: "12.5px",
                background: "rgba(241, 245, 249, 0.7)",
                padding: "16px",
                borderRadius: "14px"
              }}
            >
              <div>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  Internal Document ID
                </span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>#{selectedDoc.id}</strong>
              </div>

              <div>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  Category
                </span>
                <strong>{selectedDoc.category || "General"}</strong>
              </div>

              <div>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  Size (Bytes)
                </span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>
                  {formatFileSize(selectedDoc.size_bytes)} ({selectedDoc.size_bytes} B)
                </strong>
              </div>

              <div>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  MIME Content Type
                </span>
                <strong style={{ fontFamily: "var(--font-mono)" }}>{selectedDoc.mime_type || "application/pdf"}</strong>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  Document Owner
                </span>
                <strong>{selectedDoc.owner_name}</strong> ({selectedDoc.owner_email})
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700 }}>
                  Storage Node Key
                </span>
                <code style={{ fontSize: "11px", wordBreak: "break-all", background: "rgba(0,0,0,0.05)", padding: "4px 6px", borderRadius: "6px" }}>
                  {selectedDoc.storage_key || `vault://enc/docs/${selectedDoc.id}_aes256gcm.bin`}
                </code>
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                fontSize: "12px",
                color: "#92400e",
                lineHeight: 1.45
              }}
            >
              <strong>Content Policy Notice:</strong> Per administrative security policy, file decryption is restricted to
              users with verified document-level Read/Edit grants. Admins oversee metadata without bypassing cryptographic separation.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="primary" onClick={() => setSelectedDoc(null)}>
                Close Inspection
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminDocumentsPage;
