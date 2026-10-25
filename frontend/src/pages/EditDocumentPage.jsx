import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { apiGetDocument, apiUpdateDocument, apiDeleteDocument } from "../services/api";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { ArrowLeft, Save, ShieldAlert, Lock, Trash2 } from "lucide-react";

export function EditDocumentPage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDurationMinutes, setTimerDurationMinutes] = useState(5);
  const [autoDelete, setAutoDelete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    async function loadDoc() {
      setLoading(true);
      try {
        const res = await apiGetDocument(id);
        if (!res.document) throw new Error("Document not found");
        setDocument(res.document);
        setName(res.document.name);
        setCategory(res.document.category || "General");
        setTimerEnabled(Boolean(res.document.timer_enabled));
        setTimerDurationMinutes(Number(res.document.timer_duration_minutes || 5));
        setAutoDelete(res.document.auto_delete !== false);
      } catch (err) {
        setError(err.message || "Failed to load document for editing.");
      } finally {
        setLoading(false);
      }
    }
    loadDoc();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Document title cannot be blank.");
      return;
    }

    setSaving(true);
    try {
      await apiUpdateDocument(id, {
        name: name.trim(),
        category: category.trim() || undefined,
        timer_enabled: timerEnabled,
        timer_duration_minutes: Number(timerDurationMinutes),
        auto_delete: autoDelete
      });
      showToast("Document metadata and timer policy updated atomically", "success");
      navigate(`/documents/${id}`);
    } catch (err) {
      setError(err.message || "Failed to update document metadata.");
      showToast(err.message || "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      await apiDeleteDocument(id);
      showToast("Document deleted successfully from vault.", "success");
      setDeleteModalOpen(false);
      navigate("/documents");
    } catch (err) {
      showToast(err.message || "Failed to delete document", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center", color: "var(--text-muted)" }}>
        Loading document information...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }} className="animate-fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          to={`/documents/${id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13.5px",
            color: "var(--text-secondary)",
            fontWeight: 600,
            textDecoration: "none",
            background: "rgba(255, 255, 255, 0.6)",
            padding: "8px 16px",
            borderRadius: "9999px",
            width: "fit-content",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to Document Details</span>
        </Link>

        <button
          type="button"
          onClick={() => setDeleteModalOpen(true)}
          className="btn btn-danger btn-sm"
          style={{ borderRadius: "9999px", gap: "6px" }}
        >
          <Trash2 size={13} />
          <span>Delete Document</span>
        </button>
      </div>

      <div className="card-white responsive-page-card" style={{ padding: "36px", borderRadius: "30px" }}>
        <div style={{ marginBottom: "26px" }}>
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
            Vault Record
          </span>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 6px 0",
              letterSpacing: "-0.01em"
            }}
          >
            Edit Document Metadata
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
            Modify title and classification category for Document <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{id}</span>.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: "13px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div className="form-group">
            <label htmlFor="edit-doc-name" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
              Document Title <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              id="edit-doc-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-control"
              style={{
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                fontSize: "14px"
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-doc-category" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
              Classification Category
            </label>
            <input
              id="edit-doc-category"
              type="text"
              placeholder="e.g. Finance, Legal, Operations"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-control"
              style={{
                borderRadius: "14px",
                padding: "12px 16px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                fontSize: "14px"
              }}
            />
          </div>

          {/* Access Timer & Auto-Delete Configuration */}
          <div
            style={{
              padding: "16px",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "18px",
              display: "flex",
              flexDirection: "column",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                id="edit-timer-enabled"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              <label htmlFor="edit-timer-enabled" style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}>
                Enable Time-Limited Access (Countdown starts when viewer verifies secret key)
              </label>
            </div>

            {timerEnabled && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Access Duration:
                  </span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    {[1, 2, 5, 10, 15, 30, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setTimerDurationMinutes(mins)}
                        className={`btn btn-sm ${timerDurationMinutes === mins ? "btn-primary" : "btn-secondary"}`}
                        style={{ borderRadius: "8px", fontSize: "11.5px", padding: "4px 10px", height: "30px" }}
                      >
                        {mins} Min{mins > 1 ? "s" : ""}
                      </button>
                    ))}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={timerDurationMinutes}
                        onChange={(e) => setTimerDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: "60px",
                          height: "30px",
                          padding: "2px 6px",
                          borderRadius: "8px",
                          border: "1px solid rgba(203, 213, 225, 0.9)",
                          fontSize: "12px",
                          textAlign: "center"
                        }}
                      />
                      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>mins custom</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    id="edit-auto-delete"
                    checked={autoDelete}
                    onChange={(e) => setAutoDelete(e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <label htmlFor="edit-auto-delete" style={{ fontSize: "12.5px", fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>
                    Automatically delete document from vault when time exceeds (Self-Destruct)
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Concurrency Notice */}
          <div
            className="frosted-panel"
            style={{
              padding: "14px 18px",
              borderRadius: "18px",
              fontSize: "12.5px",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <Lock size={15} color="#0f172a" />
            <span>
              Metadata mutations are executed within atomic PostgreSQL transactions to prevent TOCTOU race conditions.
            </span>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "12px" }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(`/documents/${id}`)}
              disabled={saving}
              style={{ padding: "12px 24px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
              style={{ padding: "12px 28px", display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              <Save size={15} />
              <span>{saving ? "Saving Changes..." : "Save Metadata"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Document"
        message={`Are you sure you want to permanently delete "${name}"? This action cannot be undone.`}
        confirmText="Delete Document"
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}

export default EditDocumentPage;
