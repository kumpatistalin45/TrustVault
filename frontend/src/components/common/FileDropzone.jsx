import React, { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { formatFileSize } from "../../services/mockData";

export function FileDropzone({
  onFileSelected,
  selectedFile,
  onClear,
  accept = ".csv,.xlsx,.xls",
  progress = 0,
  isProcessing = false
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  const isExcel = selectedFile && selectedFile.name.toLowerCase().endsWith(".xlsx");

  return (
    <div style={{ width: "100%" }}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        style={{ display: "none" }}
        id="file-dropzone-input"
      />

      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current && inputRef.current.click()}
          style={{
            border: isDragging ? "2px dashed #0f172a" : "2px dashed rgba(203, 213, 225, 0.9)",
            borderRadius: "20px",
            padding: "36px 24px",
            textAlign: "center",
            background: isDragging ? "rgba(15, 23, 42, 0.04)" : "rgba(248, 250, 252, 0.6)",
            cursor: "pointer",
            transition: "all 0.2s ease"
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "16px",
              background: "#0f172a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px auto",
              boxShadow: "0 8px 20px rgba(15, 23, 42, 0.15)"
            }}
          >
            <UploadCloud size={24} />
          </div>

          <h4
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 6px 0"
            }}
          >
            Upload Excel (.xlsx) or CSV File
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 14px 0" }}>
            Drag and drop your spreadsheet here, or <strong style={{ color: "#0f172a" }}>browse files</strong>
          </p>

          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "11.5px", color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <FileSpreadsheet size={13} color="#10b981" /> Excel (.xlsx)
            </span>
            <span>•</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <FileText size={13} color="#0284c7" /> CSV Format
            </span>
          </div>
        </div>
      ) : (
        <div
          className="card-white"
          style={{
            padding: "18px 20px",
            borderRadius: "18px",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            boxShadow: "0 4px 16px rgba(15, 23, 42, 0.04)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: isExcel ? "rgba(16, 185, 129, 0.1)" : "rgba(14, 165, 233, 0.1)",
                  color: isExcel ? "#059669" : "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                {isExcel ? <FileSpreadsheet size={22} /> : <FileText size={22} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {formatFileSize(selectedFile.size)} • {isExcel ? "Microsoft Excel Spreadsheet" : "Comma-Separated Values (CSV)"}
                </div>
              </div>
            </div>

            {!isProcessing && onClear && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Remove selected file"
                style={{
                  background: "rgba(15, 23, 42, 0.05)",
                  border: "none",
                  borderRadius: "10px",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  flexShrink: 0
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Progress Bar UI */}
          {isProcessing && (
            <div style={{ marginTop: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "4px" }}>
                <span>Parsing spreadsheet rows...</span>
                <span>{progress}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "rgba(226, 232, 240, 0.8)", borderRadius: "9999px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#0f172a",
                    borderRadius: "9999px",
                    transition: "width 0.2s ease"
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FileDropzone;
