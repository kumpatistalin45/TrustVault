import React from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { TableSkeleton } from "./Skeleton";

export function DataTable({
  columns,
  data = [],
  loading = false,
  emptyState = null,
  sortBy,
  sortDir,
  onSort,
  page = 1,
  totalPages = 1,
  totalCount,
  onPageChange,
  renderMobileCard
}) {
  if (loading) {
    return <TableSkeleton rows={5} />;
  }

  if (!data || data.length === 0) {
    return emptyState;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Desktop Table View */}
      <div className="card-white" style={{ padding: 0, borderRadius: "20px", overflow: "hidden", boxShadow: "0 4px 24px rgba(15, 23, 42, 0.04)" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(248, 250, 252, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.8)" }}>
                {columns.map((col) => {
                  const isSorted = sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => col.sortable && onSort && onSort(col.key)}
                      style={{
                        padding: "14px 18px",
                        fontSize: "12px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: isSorted ? "var(--text-primary)" : "var(--text-secondary)",
                        textAlign: col.align || "left",
                        width: col.width || "auto",
                        cursor: col.sortable ? "pointer" : "default",
                        userSelect: "none",
                        whiteSpace: "nowrap"
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          justifyContent: col.align === "right" ? "flex-end" : "flex-start"
                        }}
                      >
                        <span>{col.label}</span>
                        {col.sortable && (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {isSorted && sortDir === "asc" ? (
                              <ChevronUp size={13} color="#0f172a" strokeWidth={3} />
                            ) : isSorted && sortDir === "desc" ? (
                              <ChevronDown size={13} color="#0f172a" strokeWidth={3} />
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", opacity: 0.35 }}>
                                <ChevronUp size={10} />
                                <ChevronDown size={10} style={{ marginTop: "-4px" }} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  style={{
                    borderBottom: "1px solid rgba(241, 245, 249, 0.9)",
                    transition: "background 0.15s ease"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248, 250, 252, 0.6)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: "14px 18px",
                        fontSize: "13.5px",
                        color: "var(--text-primary)",
                        textAlign: col.align || "left",
                        verticalAlign: "middle"
                      }}
                    >
                      {col.render ? col.render(row) : row[col.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards (when renderMobileCard provided) */}
      {renderMobileCard && (
        <div className="mobile-only-cards" style={{ display: "none", flexDirection: "column", gap: "12px" }}>
          {data.map((row, idx) => (
            <div key={row.id || idx}>{renderMobileCard(row)}</div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && onPageChange && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 4px",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            {totalCount !== undefined && ` (${totalCount} total)`}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              aria-label="First page"
              style={paginationButtonStyle(page <= 1)}
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
              style={paginationButtonStyle(page <= 1)}
            >
              <ChevronLeft size={14} />
            </button>

            {/* Page number buttons */}
            {getPageRange(page, totalPages).map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => typeof p === "number" && onPageChange(p)}
                disabled={p === "..." || p === page}
                style={{
                  ...paginationButtonStyle(false),
                  background: p === page ? "#0f172a" : "rgba(255, 255, 255, 0.9)",
                  color: p === page ? "#ffffff" : "var(--text-primary)",
                  fontWeight: p === page ? 700 : 500,
                  minWidth: "32px",
                  cursor: p === "..." || p === page ? "default" : "pointer"
                }}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
              style={paginationButtonStyle(page >= totalPages)}
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Last page"
              style={paginationButtonStyle(page >= totalPages)}
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function paginationButtonStyle(disabled) {
  return {
    padding: "6px 10px",
    borderRadius: "10px",
    border: "1px solid rgba(203, 213, 225, 0.8)",
    background: disabled ? "rgba(241, 245, 249, 0.5)" : "rgba(255, 255, 255, 0.9)",
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    boxShadow: disabled ? "none" : "0 2px 4px rgba(15, 23, 42, 0.02)"
  };
}

function getPageRange(current, total) {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, "...", total];
  }
  if (current >= total - 2) {
    return [1, "...", total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default DataTable;
