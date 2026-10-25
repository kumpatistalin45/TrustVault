import React, { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiUploadDocument } from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  FileText,
  X,
  Share2,
  ExternalLink,
  RotateCcw
} from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit from backend

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".png", ".txt"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "text/plain"
];

function isFileTypeAllowed(file) {
  if (!file) return false;
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  const hasValidMime = file.type ? ALLOWED_MIME_TYPES.includes(file.type) : true;
  return hasValidExtension && hasValidMime;
}

export function UploadPage() {
  const { isViewer } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // Success Confirmation State (Only after backend confirms)
  const [confirmedUpload, setConfirmedUpload] = useState(null);

  // If user is a viewer, show security restriction
  if (isViewer) {
    return (
      <div style={{ maxWidth: "600px", margin: "40px auto" }} className="animate-fade-in">
        <div className="card-white" style={{ padding: "48px 32px", textAlign: "center", borderRadius: "30px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#dc2626",
              marginBottom: "16px"
            }}
          >
            <ShieldAlert size={32} />
          </div>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px"
            }}
          >
            Upload Restricted for Viewer Role
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>
            In accordance with TrustVault discretionary access control, accounts assigned the <strong>Viewer</strong> role
            possess read-only privileges and are restricted from uploading new files.
          </p>
          <button
            onClick={() => navigate("/documents")}
            className="btn btn-primary"
            style={{ borderRadius: "9999px" }}
          >
            Return to Vault Library
          </button>
        </div>
      </div>
    );
  }

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelection = (file) => {
    setError("");
    if (!file) return;

    // File type validation
    if (!isFileTypeAllowed(file)) {
      setError("Unsupported file format. TrustVault accepts PDF, DOCX, XLSX, PNG, and TXT files only.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // File size validation (10 MB limit)
    if (file.size > MAX_FILE_SIZE) {
      setError(`File exceeds the 10 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB). Please select a file under 10 MB.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    // Default document title to file name if not already manually edited
    if (!title.trim()) {
      setTitle(file.name);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploading) return; // Prevent duplicate submissions

    if (!selectedFile) {
      setError("Please select a file to upload.");
      return;
    }

    if (!title.trim()) {
      setError("Document title is required.");
      return;
    }

    // Re-verify file limits before initiating request
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("File exceeds the 10 MB limit. Please select a smaller file.");
      return;
    }

    if (!isFileTypeAllowed(selectedFile)) {
      setError("Unsupported file format. Please select a PDF, DOCX, XLSX, PNG, or TXT file.");
      return;
    }

    setUploading(true);
    setError("");
    setUploadProgress(15);

    try {
      const finalCategory = category === "Custom" ? customCategory.trim() || "General" : category;
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", finalCategory);
      formData.append("name", title.trim());
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      // Progress animation
      setUploadProgress(45);
      const res = await apiUploadDocument(formData);
      setUploadProgress(100);

      // Confirm only after server response
      const uploadedDoc = res.document || {
        id: Date.now(),
        name: title.trim(),
        category: finalCategory,
        size_bytes: selectedFile.size,
        mime_type: selectedFile.type || "application/octet-stream",
        created_at: new Date().toISOString()
      };

      setConfirmedUpload(uploadedDoc);
      showToast(`"${uploadedDoc.name}" encrypted and uploaded successfully!`, "success");
    } catch (err) {
      if (err.status === 401 || err.message?.toLowerCase().includes("authentication required")) {
        setError("Your session has expired. Please log out and log back in to upload documents.");
      } else {
        setError(err.message || "Failed to upload document. Please verify network connection and try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setTitle("");
    setCategory("General");
    setCustomCategory("");
    setDescription("");
    setError("");
    setUploadProgress(0);
    setConfirmedUpload(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Render Confirmed Success Screen
  if (confirmedUpload) {
    return (
      <div style={{ maxWidth: "720px", margin: "20px auto" }} className="animate-fade-in">
        <div className="card-white" style={{ padding: "44px 36px", borderRadius: "30px", textAlign: "center" }}>
          <div
            style={{
              width: "68px",
              height: "68px",
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#059669",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "20px"
            }}
          >
            <CheckCircle2 size={36} />
          </div>

          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "24px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px"
            }}
          >
            Document Successfully Encrypted & Vaulted
          </h2>

          <p style={{ color: "var(--text-secondary)", fontSize: "14.5px", maxWidth: "520px", margin: "0 auto 28px auto", lineHeight: 1.5 }}>
            Your document has been verified by the backend, wrapped with AES-256-GCM envelope encryption, and registered in your private vault.
          </p>

          {/* Confirmed Metadata Details Pill Box */}
          <div
            style={{
              background: "rgba(248, 250, 252, 0.9)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "20px",
              padding: "20px 24px",
              textAlign: "left",
              marginBottom: "32px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px"
            }}
          >
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Document Title
              </span>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                {confirmedUpload.name}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Document ID
              </span>
              <div style={{ fontSize: "14px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                #{confirmedUpload.id}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Classification
              </span>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                {confirmedUpload.category || "General"}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Sealed Size
              </span>
              <div style={{ fontSize: "14px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                {formatFileSize(confirmedUpload.size_bytes)}
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Cipher Standard
              </span>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#059669", marginTop: "2px" }}>
                AES-256-GCM (TVE1)
              </div>
            </div>

            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Timestamp
              </span>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                {formatDate(confirmedUpload.created_at)}
              </div>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <Link
              to={`/documents/${confirmedUpload.id}/permissions`}
              className="btn btn-secondary"
              style={{ borderRadius: "9999px", gap: "8px", textDecoration: "none" }}
            >
              <Share2 size={15} />
              <span>Manage Permissions</span>
            </Link>

            <Link
              to="/documents"
              className="btn btn-primary"
              style={{ borderRadius: "9999px", gap: "8px", textDecoration: "none" }}
            >
              <FileText size={15} />
              <span>View in Vault Library</span>
            </Link>

            <button
              onClick={handleReset}
              className="btn btn-ghost"
              style={{ borderRadius: "9999px", gap: "6px" }}
            >
              <RotateCcw size={14} />
              <span>Upload Another File</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Page Header */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "32px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            margin: "0 0 6px 0"
          }}
        >
          Upload & Encrypt Document
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0, fontWeight: 500 }}>
          Files are automatically sealed in a binary TVE1 envelope with AES-256-GCM authenticated encryption.
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
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >
          <AlertTriangle size={18} color="#dc2626" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Upload Card */}
      <div className="card-white responsive-page-card" style={{ padding: "36px", borderRadius: "30px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Drag & Drop Target Zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? "#0f172a" : selectedFile ? "#10b981" : "rgba(148, 163, 184, 0.6)"}`,
              borderRadius: "24px",
              padding: "44px 24px",
              textAlign: "center",
              background: dragActive ? "rgba(241, 245, 249, 0.9)" : selectedFile ? "rgba(236, 253, 245, 0.8)" : "rgba(248, 250, 252, 0.7)",
              cursor: uploading ? "not-allowed" : "pointer",
              transition: "all 0.2s ease"
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.png,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,text/plain"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelection(e.target.files[0]);
                }
              }}
            />

            <div
              style={{
                width: "58px",
                height: "58px",
                borderRadius: "50%",
                background: selectedFile ? "#10b981" : "#0f172a",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(15, 23, 42, 0.15)",
                marginBottom: "16px"
              }}
            >
              {selectedFile ? <CheckCircle2 size={26} /> : <UploadCloud size={26} />}
            </div>

            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "6px"
              }}
            >
              {selectedFile ? selectedFile.name : "Drag and drop your document here"}
            </h4>

            <p style={{ fontSize: "13.5px", color: "var(--text-muted)", margin: 0 }}>
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} • Click to choose a different file`
                : "Or click to browse files from your computer"}
            </p>

            <span
              style={{
                display: "inline-block",
                marginTop: "14px",
                fontSize: "12px",
                color: "var(--text-secondary)",
                background: "#ffffff",
                padding: "5px 14px",
                borderRadius: "9999px",
                border: "1px solid rgba(226, 232, 240, 0.8)",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.02)"
              }}
            >
              Supported: PDF, DOCX, XLSX, PNG, TXT (Maximum 10 MB)
            </span>
          </div>

          {/* Form Fields: Title, Category, Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Document Title */}
            <div className="form-group">
              <label htmlFor="upload-title" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
                Document Title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                id="upload-title"
                type="text"
                placeholder="e.g. Q4_Confidential_Financial_Audit.pdf"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                className="form-control"
                style={{ borderRadius: "14px", padding: "12px 16px" }}
                required
              />
            </div>

            {/* Document Category */}
            <div className="form-group">
              <label htmlFor="upload-category" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
                Document Category
              </label>
              <select
                id="upload-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={uploading}
                className="form-control"
                style={{ borderRadius: "14px", padding: "12px 16px" }}
              >
                <option value="General">General Corporate</option>
                <option value="Finance">Financial & Accounting</option>
                <option value="Legal">Legal & Compliance</option>
                <option value="Engineering">Engineering & Technical</option>
                <option value="Security">Security & Operations</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Custom">+ Custom Category...</option>
              </select>
            </div>

            {category === "Custom" && (
              <div className="form-group">
                <label htmlFor="custom-category" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
                  Enter Custom Category Name
                </label>
                <input
                  id="custom-category"
                  type="text"
                  placeholder="e.g. Audit-2026"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  disabled={uploading}
                  className="form-control"
                  style={{ borderRadius: "14px", padding: "12px 16px" }}
                  required
                />
              </div>
            )}

            {/* Optional Description */}
            <div className="form-group">
              <label htmlFor="upload-description" className="form-label" style={{ fontWeight: 600, fontSize: "13.5px" }}>
                Optional Description
              </label>
              <textarea
                id="upload-description"
                rows={3}
                placeholder="Add optional notes or abstract for this document..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                className="form-control"
                style={{ borderRadius: "14px", padding: "12px 16px", resize: "vertical" }}
              />
            </div>
          </div>

          {/* Upload Progress Bar (when in-flight) */}
          {uploading && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                <span>Encrypting payload & uploading to vault...</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{uploadProgress}%</span>
              </div>
              <div style={{ width: "100%", height: "8px", background: "rgba(15, 23, 42, 0.08)", borderRadius: "9999px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${uploadProgress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #0f172a, #2563eb)",
                    borderRadius: "9999px",
                    transition: "width 0.4s ease"
                  }}
                />
              </div>
            </div>
          )}

          {/* Cryptographic Pipeline Guarantee */}
          <div
            style={{
              padding: "18px 20px",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Lock size={15} color="#0f172a" />
              <strong style={{ fontSize: "13.5px", color: "var(--text-primary)" }}>
                Zero-Trust Encryption Guarantee
              </strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              <div>• 256-bit AES-GCM Ciphertext</div>
              <div>• 12-byte Unique Vector per file</div>
              <div>• 16-byte Tamper Detection Tag</div>
              <div>• In-Memory Stream Processing</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={uploading || (!selectedFile && !title)}
              style={{ borderRadius: "9999px", padding: "10px 20px" }}
            >
              Reset
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedFile || !title.trim() || uploading}
              style={{ borderRadius: "9999px", padding: "10px 24px", gap: "8px" }}
            >
              <UploadCloud size={16} />
              <span>{uploading ? "Encrypting & Sealing..." : "Upload & Seal Document"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UploadPage;
