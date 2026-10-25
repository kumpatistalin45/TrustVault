import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetDocuments,
  apiSubmitComplaint,
  apiGetMyComplaints,
  apiSubmitSecurityReport
} from "../services/api";
import { InlineAlert } from "../components/auth/InlineAlert";
import {
  HelpCircle,
  FileQuestion,
  MessageSquarePlus,
  Inbox,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  CheckCircle2,
  Clock,
  ArrowRight,
  AlertTriangle,
  Info,
  X,
  Send,
  Lock
} from "lucide-react";

export function HelpPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  // Active Tab: 'faq' | 'raise' | 'my-complaints' | 'security'
  const [activeTab, setActiveTab] = useState("faq");

  // Documents for the "Related Document" dropdown
  const [documents, setDocuments] = useState([]);

  // ----------------------------------------------------------------
  // 1. FAQ STATE & CATEGORIES
  // ----------------------------------------------------------------
  const [faqCategory, setFaqCategory] = useState("all");
  const [openFaq, setOpenFaq] = useState(null);

  const FAQ_ITEMS = [
    {
      id: 1,
      category: "Login/OTP",
      q: "Why do I need an email verification code on login and document unlock?",
      a: "TrustVault utilizes two-factor verification to safeguard enterprise files. When signing in or unlocking a sensitive document, an OTP is dispatched to your verified corporate email to confirm your physical ownership of the account before cryptographic decryption keys are loaded."
    },
    {
      id: 2,
      category: "Document Permissions",
      q: "How are documents assigned to my account?",
      a: "Enterprise Administrators upload encrypted documents and assign them specifically to your corporate email. You will only see files that have been explicitly designated for your account in the 'My Documents' portal."
    },
    {
      id: 3,
      category: "Preview/Download",
      q: "Why does document access expire after five minutes?",
      a: "In accordance with zero-trust security standards, decrypted files in the browser runtime have an in-memory lifespan of five minutes (300 seconds). After this countdown expires, temporary blob URLs and decrypted buffers are purged to prevent unauthorized inspection on unattended workstations."
    },
    {
      id: 4,
      category: "Account Sessions",
      q: "What is the single-device session policy?",
      a: "TrustVault permits exactly one active workstation or browser session per employee account. If your credentials are authenticated on a new computer or browser, any prior active session is immediately invalidated to prevent unauthorized concurrent access."
    },
    {
      id: 5,
      category: "Privacy",
      q: "Are my downloads and document views logged?",
      a: "Yes. Every document unlock, successful download, and access request is recorded with a cryptographic timestamp in an immutable enterprise audit trail. You can review your confirmed downloads anytime under 'Download History'."
    },
    {
      id: 6,
      category: "Document Permissions",
      q: "Can I upload or share documents as an employee/viewer?",
      a: "No. The employee portal is strictly a secure document access and download portal. Only designated Administrators and Document Owners have privileges to upload files and assign permissions."
    }
  ];

  const filteredFaqs = faqCategory === "all"
    ? FAQ_ITEMS
    : FAQ_ITEMS.filter((f) => f.category === faqCategory);

  // ----------------------------------------------------------------
  // 2. RAISE A COMPLAINT FORM STATE
  // ----------------------------------------------------------------
  const [category, setCategory] = useState("Document Access");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [relatedDoc, setRelatedDoc] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintSuccess, setComplaintSuccess] = useState(null);

  // ----------------------------------------------------------------
  // 3. MY COMPLAINTS STATE
  // ----------------------------------------------------------------
  const [myComplaints, setMyComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  // ----------------------------------------------------------------
  // 4. SECURITY REPORTING STATE
  // ----------------------------------------------------------------
  const [secType, setSecType] = useState("Suspicious Login Activity");
  const [secSubject, setSecSubject] = useState("");
  const [secDesc, setSecDesc] = useState("");
  const [secSubmitting, setSecSubmitting] = useState(false);
  const [secError, setSecError] = useState("");
  const [secSuccess, setSecSuccess] = useState(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const docsRes = await apiGetDocuments();
        setDocuments(docsRes.documents || []);
      } catch (_e) {}
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === "my-complaints") {
      fetchComplaints();
    }
  }, [activeTab]);

  const fetchComplaints = async () => {
    setComplaintsLoading(true);
    try {
      const res = await apiGetMyComplaints();
      setMyComplaints(res.complaints || []);
    } catch (_e) {
      setMyComplaints([]);
    } finally {
      setComplaintsLoading(false);
    }
  };

  // Attachment handler with size & type validation
  const handleAttachmentChange = (e) => {
    setAttachmentError("");
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf", "text/plain"];
    if (!allowedTypes.includes(file.type)) {
      setAttachmentError("Invalid file type. Only PNG, JPG, PDF, and TXT files are accepted.");
      return;
    }

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      setAttachmentError("Attachment exceeds the maximum allowed size of 5 MB.");
      return;
    }

    setAttachment(file);
  };

  // Submit Complaint
  const handleComplaintSubmit = async (e) => {
    e.preventDefault();
    setComplaintError("");
    setComplaintSuccess(null);

    const trimmedSubject = subject.trim();
    const trimmedDesc = description.trim();

    if (!trimmedSubject) {
      setComplaintError("Subject line is required.");
      return;
    }
    if (trimmedSubject.length < 5) {
      setComplaintError("Subject must be at least 5 characters in length.");
      return;
    }
    if (!trimmedDesc) {
      setComplaintError("Detailed description is required.");
      return;
    }
    if (trimmedDesc.length < 20) {
      setComplaintError("Description must contain at least 20 characters to explain the issue.");
      return;
    }

    setComplaintSubmitting(true);
    try {
      const selectedDocObj = documents.find((d) => String(d.id) === String(relatedDoc));
      const payload = {
        category,
        subject: trimmedSubject,
        description: trimmedDesc,
        relatedDocumentId: relatedDoc || null,
        relatedDocumentName: selectedDocObj?.name || "N/A",
        attachmentName: attachment ? attachment.name : null,
        attachmentSize: attachment ? attachment.size : null
      };

      const res = await apiSubmitComplaint(payload);
      if (res && res.success) {
        setComplaintSuccess(res.complaint);
        showToast(`Complaint submitted successfully (${res.complaint.referenceId})`, "success");
        // Clear inputs
        setSubject("");
        setDescription("");
        setRelatedDoc("");
        setAttachment(null);
      } else {
        setComplaintError("Unable to register complaint with server. Please try again.");
      }
    } catch (err) {
      setComplaintError(err?.message || "Failed to submit complaint. Your entered information has been retained.");
    } finally {
      setComplaintSubmitting(false);
    }
  };

  // Submit Security Report
  const handleSecuritySubmit = async (e) => {
    e.preventDefault();
    setSecError("");
    setSecSuccess(null);

    if (!secSubject.trim() || secSubject.trim().length < 5) {
      setSecError("Subject must contain at least 5 characters.");
      return;
    }
    if (!secDesc.trim() || secDesc.trim().length < 20) {
      setSecError("Incident details must contain at least 20 characters.");
      return;
    }

    setSecSubmitting(true);
    try {
      const res = await apiSubmitSecurityReport({
        incidentType: secType,
        subject: secSubject.trim(),
        description: secDesc.trim()
      });
      if (res && res.success) {
        setSecSuccess(res.report);
        showToast("Security report escalated to Enterprise SOC.", "success");
        setSecSubject("");
        setSecDesc("");
      } else {
        setSecError("Failed to submit security report.");
      }
    } catch (err) {
      setSecError(err?.message || "Submission failed. Please try again.");
    } finally {
      setSecSubmitting(false);
    }
  };

  const getStatusBadge = (status = "Submitted") => {
    const config = {
      Submitted: { bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb" },
      "In Review": { bg: "rgba(245, 158, 11, 0.12)", color: "#d97706" },
      "Awaiting User": { bg: "rgba(139, 92, 246, 0.12)", color: "#7c3aed" },
      Resolved: { bg: "rgba(16, 185, 129, 0.12)", color: "#059669" },
      Closed: { bg: "rgba(100, 116, 139, 0.12)", color: "#475569" }
    }[status] || { bg: "rgba(15, 23, 42, 0.08)", color: "#0f172a" };

    return (
      <span
        style={{
          background: config.bg,
          color: config.color,
          padding: "3px 10px",
          borderRadius: "9999px",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase"
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Header */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "30px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 6px 0",
            letterSpacing: "-0.02em"
          }}
        >
          Help & Support Center
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          Find answers, submit support requests, track your complaints, or report security incidents.
        </p>
      </div>

      {/* Help Navigation Toolbar */}
      <div
        className="help-toolbar-container"
        style={{
          padding: "8px",
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          borderRadius: "14px",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)"
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("faq")}
          className="help-nav-btn"
          style={{
            border: activeTab === "faq" ? "1px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.85)",
            cursor: "pointer",
            background: activeTab === "faq" ? "#0f172a" : "rgba(255, 255, 255, 0.85)",
            color: activeTab === "faq" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: activeTab === "faq" ? 700 : 500,
            borderRadius: "10px",
            padding: "9px 16px",
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.18s ease"
          }}
        >
          <FileQuestion size={15} />
          <span>Knowledge Base & FAQs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("raise")}
          className="help-nav-btn"
          style={{
            border: activeTab === "raise" ? "1px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.85)",
            cursor: "pointer",
            background: activeTab === "raise" ? "#0f172a" : "rgba(255, 255, 255, 0.85)",
            color: activeTab === "raise" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: activeTab === "raise" ? 700 : 500,
            borderRadius: "10px",
            padding: "9px 16px",
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.18s ease"
          }}
        >
          <MessageSquarePlus size={15} />
          <span>Raise a Complaint</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("my-complaints")}
          className="help-nav-btn"
          style={{
            border: activeTab === "my-complaints" ? "1px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.85)",
            cursor: "pointer",
            background: activeTab === "my-complaints" ? "#0f172a" : "rgba(255, 255, 255, 0.85)",
            color: activeTab === "my-complaints" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: activeTab === "my-complaints" ? 700 : 500,
            borderRadius: "10px",
            padding: "9px 16px",
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.18s ease"
          }}
        >
          <Inbox size={15} />
          <span>My Complaints</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className="help-nav-btn"
          style={{
            border: activeTab === "security" ? "1px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.85)",
            cursor: "pointer",
            background: activeTab === "security" ? "#0f172a" : "rgba(255, 255, 255, 0.85)",
            color: activeTab === "security" ? "#ffffff" : "var(--text-secondary)",
            fontWeight: activeTab === "security" ? 700 : 500,
            borderRadius: "10px",
            padding: "9px 16px",
            fontSize: "13px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.18s ease"
          }}
        >
          <ShieldAlert size={15} />
          <span>Report Security Issue</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: KNOWLEDGE BASE & FAQS                             */}
      {/* ======================================================== */}
      {activeTab === "faq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Category Filter Pills */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Filter by Topic:
            </span>
            {["all", "Login/OTP", "Document Permissions", "Preview/Download", "Account Sessions", "Privacy"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFaqCategory(cat)}
                style={{
                  padding: "5px 14px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: faqCategory === cat ? "#0f172a" : "rgba(255, 255, 255, 0.7)",
                  color: faqCategory === cat ? "#ffffff" : "var(--text-secondary)",
                  transition: "all 0.15s ease"
                }}
              >
                {cat === "all" ? "All Questions" : cat}
              </button>
            ))}
          </div>

          {/* FAQ Accordion List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {filteredFaqs.map((faq) => {
              const isOpen = openFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className="card-white card-white-hover"
                  style={{
                    borderRadius: "20px",
                    overflow: "hidden",
                    cursor: "pointer"
                  }}
                  onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                >
                  <div
                    style={{
                      padding: "20px 24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "rgba(15, 23, 42, 0.06)",
                          color: "var(--text-muted)",
                          textTransform: "uppercase"
                        }}
                      >
                        {faq.category}
                      </span>
                      <h3
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          margin: 0
                        }}
                      >
                        {faq.q}
                      </h3>
                    </div>

                    <div style={{ color: "var(--text-muted)" }}>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {isOpen && (
                    <div
                      style={{
                        padding: "0 24px 20px 24px",
                        fontSize: "13.5px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                        borderTop: "1px solid rgba(226, 232, 240, 0.6)"
                      }}
                    >
                      <p style={{ marginTop: "14px", margin: "14px 0 0 0" }}>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: RAISE A COMPLAINT FORM                            */}
      {/* ======================================================== */}
      {activeTab === "raise" && (
        <div className="card-white" style={{ padding: "36px", borderRadius: "28px" }}>
          <div style={{ marginBottom: "20px" }}>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 6px 0"
              }}
            >
              Raise a Formal Complaint
            </h2>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: 0 }}>
              Submit an issue ticket directly to Enterprise Support. Tickets are tracked with unique reference IDs.
            </p>
          </div>

          {/* Mandatory Security Notice Banner */}
          <div
            className="frosted-panel"
            style={{
              padding: "14px 18px",
              borderRadius: "18px",
              background: "rgba(239, 68, 68, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              marginBottom: "24px",
              fontSize: "12.5px",
              color: "#991b1b"
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Security Protocol Warning:</strong> Never submit passwords, verification OTPs, authorization session cookies, cryptographic keys, or proprietary document content in this form or attachments.
            </div>
          </div>

          {/* Success Confirmation Card */}
          {complaintSuccess && (
            <div
              style={{
                padding: "24px",
                borderRadius: "20px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                marginBottom: "24px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <CheckCircle2 size={20} color="#059669" />
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#065f46", margin: 0 }}>
                  Complaint Registered Successfully
                </h3>
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                Your complaint has been assigned tracking ID:{" "}
                <strong style={{ fontFamily: "var(--font-mono)", color: "#065f46" }}>
                  {complaintSuccess.referenceId}
                </strong>
                . Enterprise Support has been notified.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("my-complaints")}
                className="btn-primary"
                style={{
                  padding: "8px 18px",
                  fontSize: "12.5px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>View in My Complaints</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Inline Red Error */}
          {complaintError && (
            <InlineAlert
              type="error"
              message={complaintError}
              onClose={() => setComplaintError("")}
            />
          )}

          {/* Complaint Form */}
          <form onSubmit={handleComplaintSubmit} noValidate>
            {/* Category & Contact Email */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "18px", marginBottom: "18px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  Issue Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(203, 213, 225, 0.8)",
                    background: "rgba(255, 255, 255, 0.8)",
                    fontSize: "13.5px",
                    color: "var(--text-primary)",
                    outline: "none"
                  }}
                >
                  <option value="Document Access">Document Access</option>
                  <option value="Login/OTP">Login / Email OTP</option>
                  <option value="Download Problem">Download & Decryption Problem</option>
                  <option value="Security/Privacy">Security & Privacy Issue</option>
                  <option value="Profile/Settings">Profile & Settings</option>
                  <option value="Other">Other Operational Concern</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                  Submitter Contact Email
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || "employee@trustvault.internal"}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: "14px",
                    border: "1px solid rgba(226, 232, 240, 0.8)",
                    background: "rgba(248, 250, 252, 0.7)",
                    color: "var(--text-muted)",
                    fontSize: "13.5px"
                  }}
                />
              </div>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                  Subject Line *
                </label>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{subject.length}/120</span>
              </div>
              <input
                type="text"
                maxLength={120}
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of the issue (e.g. Permission denied on Q4 Tax Report)"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>

            {/* Related Document (Optional, only accessible documents) */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Related Document (Optional)
              </label>
              <select
                value={relatedDoc}
                onChange={(e) => setRelatedDoc(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              >
                <option value="">-- No specific document / General issue --</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.category || "General"})
                  </option>
                ))}
              </select>
            </div>

            {/* Detailed Description */}
            <div style={{ marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                  Detailed Description *
                </label>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{description.length}/2000 (min 20)</span>
              </div>
              <textarea
                rows={5}
                maxLength={2000}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what occurred, any error messages encountered, and relevant steps to reproduce the issue."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Supporting Attachment (Optional) */}
            <div style={{ marginBottom: "26px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Screenshot or Supporting Log (Optional, Max 5 MB)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 18px",
                    borderRadius: "12px",
                    background: "rgba(15, 23, 42, 0.06)",
                    border: "1px solid rgba(203, 213, 225, 0.8)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    cursor: "pointer"
                  }}
                >
                  <Paperclip size={14} />
                  <span>{attachment ? "Change Attachment" : "Choose File..."}</span>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf,.txt"
                    onChange={handleAttachmentChange}
                    style={{ display: "none" }}
                  />
                </label>

                {attachment && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-primary)" }}>
                    <span>{attachment.name}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      ({Math.round(attachment.size / 1024)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", display: "flex" }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
              {attachmentError && (
                <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "6px" }}>
                  {attachmentError}
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={complaintSubmitting}
              className="btn-primary"
              style={{
                padding: "12px 28px",
                borderRadius: "9999px",
                fontSize: "14px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                cursor: complaintSubmitting ? "not-allowed" : "pointer"
              }}
            >
              <Send size={15} />
              <span>{complaintSubmitting ? "Submitting Complaint..." : "Submit Complaint"}</span>
            </button>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: MY COMPLAINTS LIST                                */}
      {/* ======================================================== */}
      {activeTab === "my-complaints" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {complaintsLoading ? (
            <div className="card-white" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading your submitted complaints...
            </div>
          ) : myComplaints.length === 0 ? (
            <div className="card-white" style={{ padding: "50px 24px", textAlign: "center", borderRadius: "28px" }}>
              <Inbox size={40} color="var(--text-muted)" style={{ margin: "0 auto 12px auto" }} />
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                No Complaints Filed
              </h3>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginBottom: "18px" }}>
                You have not submitted any complaint tickets. If you encounter an issue, file a ticket above.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("raise")}
                className="btn-primary"
                style={{ padding: "9px 20px", fontSize: "13px" }}
              >
                Raise a Complaint
              </button>
            </div>
          ) : (
            myComplaints.map((c) => {
              const isSelected = selectedComplaint?.id === c.id;
              const formattedDate = new Date(c.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
                <div
                  key={c.id}
                  className="card-white"
                  style={{
                    borderRadius: "22px",
                    overflow: "hidden",
                    border: isSelected ? "1.5px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.8)"
                  }}
                >
                  <div
                    style={{
                      padding: "20px 24px",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      cursor: "pointer"
                    }}
                    onClick={() => setSelectedComplaint(isSelected ? null : c)}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {c.referenceId}
                        </span>
                        <span>•</span>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{c.category}</span>
                      </div>
                      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                        {c.subject}
                      </h3>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                        Submitted {formattedDate}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {getStatusBadge(c.status)}
                      <div style={{ color: "var(--text-muted)" }}>
                        {isSelected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Timeline View */}
                  {isSelected && (
                    <div
                      style={{
                        padding: "0 24px 24px 24px",
                        borderTop: "1px solid rgba(226, 232, 240, 0.6)",
                        fontSize: "13px"
                      }}
                    >
                      <div style={{ margin: "16px 0 20px 0" }}>
                        <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: "4px" }}>
                          Submitted Description:
                        </strong>
                        <p style={{ color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
                          {c.description}
                        </p>
                      </div>

                      {c.relatedDocumentName && c.relatedDocumentName !== "N/A" && (
                        <div style={{ marginBottom: "16px", fontSize: "12.5px", color: "var(--text-muted)" }}>
                          Related Document: <strong style={{ color: "var(--text-primary)" }}>{c.relatedDocumentName}</strong>
                        </div>
                      )}

                      {/* Audit Timeline */}
                      <strong style={{ display: "block", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "12px" }}>
                        Status Timeline & Agent Responses
                      </strong>

                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {(c.timeline || []).map((step, sIdx) => (
                          <div
                            key={step.id || sIdx}
                            style={{
                              padding: "12px 16px",
                              borderRadius: "14px",
                              background: step.type === "agent" ? "rgba(99, 102, 241, 0.08)" : "rgba(15, 23, 42, 0.04)",
                              borderLeft: step.type === "agent" ? "3px solid #6366f1" : "3px solid #94a3b8"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span style={{ fontWeight: 700, color: step.type === "agent" ? "#4338ca" : "var(--text-primary)", fontSize: "12.5px" }}>
                                {step.author}
                              </span>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {new Date(step.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                            <p style={{ color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                              {step.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: REPORT A SECURITY ISSUE                           */}
      {/* ======================================================== */}
      {activeTab === "security" && (
        <div className="card-white" style={{ padding: "36px", borderRadius: "28px" }}>
          <div style={{ marginBottom: "20px" }}>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 6px 0"
              }}
            >
              Report a Security or Privacy Vulnerability
            </h2>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: 0 }}>
              Direct channel to the Enterprise Security Operations Center (SOC) for urgent privacy concerns.
            </p>
          </div>

          <div
            className="frosted-panel"
            style={{
              padding: "14px 18px",
              borderRadius: "18px",
              background: "rgba(220, 38, 38, 0.06)",
              border: "1px solid rgba(220, 38, 38, 0.2)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              marginBottom: "24px",
              fontSize: "12.5px",
              color: "#991b1b"
            }}
          >
            <Lock size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Strict Confidentiality:</strong> Do not include secrets, credentials, or customer document content. Security incident tickets trigger high-priority alerts to corporate administrators.
            </div>
          </div>

          {secSuccess && (
            <div
              style={{
                padding: "20px",
                borderRadius: "18px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                marginBottom: "24px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <CheckCircle2 size={18} color="#059669" />
                <strong style={{ color: "#065f46" }}>Security Incident Escalated</strong>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                Tracking reference: <strong style={{ fontFamily: "var(--font-mono)" }}>{secSuccess.referenceId}</strong>. Enterprise SOC has been paged.
              </p>
            </div>
          )}

          {secError && (
            <InlineAlert
              type="error"
              message={secError}
              onClose={() => setSecError("")}
            />
          )}

          <form onSubmit={handleSecuritySubmit}>
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Incident Classification *
              </label>
              <select
                value={secType}
                onChange={(e) => setSecType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              >
                <option value="Suspicious Login Activity">Suspicious Login Activity (Unknown Device/IP)</option>
                <option value="Unexpected Document Assignment">Unexpected Document Assignment or Access</option>
                <option value="Potential Data Leak">Potential Document Leak or Exposure</option>
                <option value="Session Token Anomaly">Session Token Anomaly / Desync</option>
                <option value="Privacy Concern">Personal Data Privacy Concern</option>
              </select>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Incident Summary *
              </label>
              <input
                type="text"
                required
                value={secSubject}
                onChange={(e) => setSecSubject(e.target.value)}
                placeholder="Brief summary of the security concern"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Incident Details & Observation *
              </label>
              <textarea
                rows={5}
                required
                value={secDesc}
                onChange={(e) => setSecDesc(e.target.value)}
                placeholder="Describe the timestamp, observed anomaly, and why it appears suspicious. Never paste secret keys or passwords."
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.8)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={secSubmitting}
              className="btn-primary"
              style={{
                background: "#dc2626",
                color: "#ffffff",
                padding: "12px 28px",
                borderRadius: "9999px",
                fontSize: "13.5px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                cursor: secSubmitting ? "not-allowed" : "pointer"
              }}
            >
              <ShieldAlert size={16} />
              <span>{secSubmitting ? "Escalating Report..." : "Submit Incident Report"}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default HelpPage;
