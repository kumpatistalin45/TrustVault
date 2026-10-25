import React, { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { FileDropzone } from "./FileDropzone";
import { parseImportFile } from "../../utils/fileImportParser";
import { generateSampleCsv } from "../../services/masterDataService";
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  RotateCcw
} from "lucide-react";

export function ImportPreviewModal({
  isOpen,
  onClose,
  onConfirmImport,
  type = "owners", // "owners" | "viewers"
  existingEmails = new Set()
}) {
  const isOwners = type === "owners";
  const title = `Bulk Import ${isOwners ? "Document Owners" : "Authorized Viewers"}`;

  const [selectedFile, setSelectedFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parsedResult, setParsedResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(null);
  const [filterView, setFilterView] = useState("all"); // "all" | "valid" | "invalid"

  const handleDownloadSample = () => {
    const csvContent = generateSampleCsv(type);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trustvault_${type}_import_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = async (file) => {
    setSelectedFile(file);
    setParsing(true);
    setParseProgress(20);
    setParsedResult(null);
    setImportSuccess(null);

    try {
      setParseProgress(60);
      const result = await parseImportFile(file, existingEmails);
      setParseProgress(100);
      setTimeout(() => {
        setParsedResult(result);
        setParsing(false);
      }, 300);
    } catch (err) {
      setParsing(false);
      setParsedResult({
        error: err.message || "Failed to parse file."
      });
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedResult(null);
    setParsing(false);
    setParseProgress(0);
    setImportSuccess(null);
  };

  const handleConfirm = async () => {
    if (!parsedResult || !parsedResult.validRows || parsedResult.validRows.length === 0) return;

    setImporting(true);
    try {
      const res = await onConfirmImport(parsedResult.validRows);
      setImportSuccess({
        count: res.addedCount || parsedResult.validRows.length,
        skipped: parsedResult.invalidRows.length
      });
    } catch (_err) {
      // handled
    } finally {
      setImporting(false);
    }
  };

  const allRows = parsedResult
    ? [...(parsedResult.validRows || []), ...(parsedResult.invalidRows || [])].sort(
        (a, b) => a._rowNum - b._rowNum
      )
    : [];

  const displayedRows =
    filterView === "valid"
      ? parsedResult?.validRows || []
      : filterView === "invalid"
      ? parsedResult?.invalidRows || []
      : allRows;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="820px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Step 1: Upload or Template Area */}
        {!parsedResult && !importSuccess && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                flexWrap: "wrap",
                gap: "10px"
              }}
            >
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                Upload spreadsheet with {isOwners ? "Owner" : "Viewer"} credentials. Rows will be validated before import.
              </p>
              <button
                type="button"
                onClick={handleDownloadSample}
                style={{
                  background: "rgba(15, 23, 42, 0.05)",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "10px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0f172a",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Download size={13} />
                <span>Download Sample Template</span>
              </button>
            </div>

            <FileDropzone
              selectedFile={selectedFile}
              onFileSelected={handleFileSelected}
              onClear={handleReset}
              isProcessing={parsing}
              progress={parseProgress}
            />
          </div>
        )}

        {/* Parsing Error */}
        {parsedResult?.error && (
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "16px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px"
            }}
          >
            <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ fontSize: "13.5px", color: "#991b1b" }}>File Parsing Failed</strong>
              <p style={{ fontSize: "12.5px", color: "#dc2626", margin: "4px 0 10px 0" }}>{parsedResult.error}</p>
              <Button size="sm" variant="outline" onClick={handleReset} icon={<RotateCcw size={13} />}>
                Try Another File
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Parsed Rows Preview & Validation Summary */}
        {parsedResult && !parsedResult.error && !importSuccess && (
          <div>
            {/* Header with summary stats */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "16px",
                padding: "14px 18px",
                background: "rgba(248, 250, 252, 0.8)",
                borderRadius: "16px",
                border: "1px solid rgba(226, 232, 240, 0.8)"
              }}
            >
              <div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {parsedResult.filename}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", marginLeft: "8px" }}>
                  ({parsedResult.totalParsed} total rows parsed)
                </span>
              </div>

              {/* Status Pills */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "9999px",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#059669",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  <CheckCircle2 size={12} /> {parsedResult.validRows.length} Valid
                </span>

                {parsedResult.invalidRows.length > 0 && (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      background: "rgba(239, 68, 68, 0.12)",
                      color: "#dc2626",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <XCircle size={12} /> {parsedResult.invalidRows.length} Invalid
                  </span>
                )}

                {parsedResult.duplicateEmails?.length > 0 && (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      background: "rgba(245, 158, 11, 0.12)",
                      color: "#d97706",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <AlertTriangle size={12} /> {parsedResult.duplicateEmails.length} Duplicate Email(s)
                  </span>
                )}
              </div>
            </div>

            {/* Filter Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setFilterView("all")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    background: filterView === "all" ? "#0f172a" : "rgba(15, 23, 42, 0.05)",
                    color: filterView === "all" ? "#ffffff" : "var(--text-secondary)",
                    cursor: "pointer"
                  }}
                >
                  All Rows ({allRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterView("valid")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    border: "none",
                    background: filterView === "valid" ? "#059669" : "rgba(16, 185, 129, 0.1)",
                    color: filterView === "valid" ? "#ffffff" : "#059669",
                    cursor: "pointer"
                  }}
                >
                  Valid Only ({parsedResult.validRows.length})
                </button>
                {parsedResult.invalidRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterView("invalid")}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: "none",
                      background: filterView === "invalid" ? "#dc2626" : "rgba(239, 68, 68, 0.1)",
                      color: filterView === "invalid" ? "#ffffff" : "#dc2626",
                      cursor: "pointer"
                    }}
                  >
                    Invalid Only ({parsedResult.invalidRows.length})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <RotateCcw size={12} />
                <span>Upload Different File</span>
              </button>
            </div>

            {/* Preview Table */}
            <div
              style={{
                maxHeight: "280px",
                overflowY: "auto",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                borderRadius: "14px",
                background: "#ffffff"
              }}
            >
              <table className="table" style={{ width: "100%", margin: 0, fontSize: "12.5px" }}>
                <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 1 }}>
                  <tr>
                    <th style={{ width: "60px" }}>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Mobile</th>
                    <th>Validation Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      style={{
                        background: row._isValid ? "transparent" : "rgba(254, 242, 242, 0.5)",
                        borderBottom: "1px solid rgba(241, 245, 249, 0.8)"
                      }}
                    >
                      <td style={{ fontWeight: 600, color: "var(--text-muted)" }}>#{row._rowNum}</td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.name || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{row.email || "—"}</td>
                      <td>{row.mobile || "—"}</td>
                      <td>
                        {row._isValid ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              color: "#059669",
                              fontSize: "11.5px",
                              fontWeight: 600
                            }}
                          >
                            <CheckCircle2 size={12} /> Ready
                            {row._warnings?.length > 0 && (
                              <span style={{ color: "#d97706", marginLeft: "4px" }}>
                                ({row._warnings.join(", ")})
                              </span>
                            )}
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {row._errors.map((err, eIdx) => (
                              <span
                                key={eIdx}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  color: "#dc2626",
                                  fontSize: "11.5px",
                                  fontWeight: 500
                                }}
                              >
                                <XCircle size={11} /> {err}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Warning when invalid rows exist */}
            {parsedResult.invalidRows.length > 0 && (
              <p style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "10px", margin: "10px 0 0 0" }}>
                <strong>Note:</strong> Only valid rows ({parsedResult.validRows.length}) will be imported. Rows with errors will be skipped.
              </p>
            )}
          </div>
        )}

        {/* Step 3: Success State */}
        {importSuccess && (
          <div
            style={{
              padding: "32px 24px",
              textAlign: "center",
              background: "rgba(16, 185, 129, 0.06)",
              borderRadius: "20px",
              border: "1px solid rgba(16, 185, 129, 0.2)"
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "16px",
                background: "#059669",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px auto",
                boxShadow: "0 8px 20px rgba(5, 150, 105, 0.2)"
              }}
            >
              <CheckCircle2 size={28} />
            </div>

            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "18px",
                fontWeight: 700,
                color: "#065f46",
                margin: "0 0 6px 0"
              }}
            >
              Bulk Import Successfully Completed!
            </h3>
            <p style={{ fontSize: "13.5px", color: "#047857", margin: "0 0 20px 0" }}>
              Successfully added <strong>{importSuccess.count}</strong> {isOwners ? "owner" : "viewer"} records to the local master database.
              {importSuccess.skipped > 0 && ` (${importSuccess.skipped} invalid rows were skipped)`}
            </p>

            <Button variant="primary" onClick={onClose}>
              Done & View Records
            </Button>
          </div>
        )}

        {/* Footer actions */}
        {!importSuccess && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "8px",
              paddingTop: "14px",
              borderTop: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <Button variant="outline" onClick={onClose} disabled={importing}>
              Cancel
            </Button>

            {parsedResult && !parsedResult.error && (
              <Button
                variant="primary"
                onClick={handleConfirm}
                loading={importing}
                disabled={!parsedResult.canImport}
                icon={<ArrowRight size={14} />}
              >
                Confirm Import ({parsedResult.validRows.length} Records)
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ImportPreviewModal;
