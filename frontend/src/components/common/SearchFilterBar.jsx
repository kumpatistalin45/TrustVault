import React from "react";
import { Search, X, RotateCcw } from "lucide-react";
import { Button } from "./Button";

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search records...",
  filters = [],
  onReset,
  totalCount,
  filteredCount
}) {
  const hasActiveFilters = Boolean(
    search || filters.some((f) => f.value && f.value !== "all")
  );

  return (
    <div
      className="card-white"
      style={{
        padding: "16px 20px",
        borderRadius: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
        boxShadow: "0 4px 20px rgba(15, 23, 42, 0.04)"
      }}
    >
      {/* Search Input Box */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(241, 245, 249, 0.7)",
          padding: "8px 14px",
          borderRadius: "14px",
          border: "1px solid rgba(203, 213, 225, 0.6)",
          flex: "1 1 280px",
          minWidth: "220px",
          position: "relative"
        }}
      >
        <Search size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "13.5px",
            color: "var(--text-primary)",
            width: "100%",
            fontFamily: "inherit"
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search input"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
              alignItems: "center",
              color: "var(--text-muted)"
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dynamic Filter Dropdowns */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {filters.map((filter, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {filter.label && (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
                {filter.label}:
              </span>
            )}
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              aria-label={filter.label || `Filter ${idx}`}
              style={{
                padding: "8px 12px",
                borderRadius: "12px",
                border: "1px solid rgba(203, 213, 225, 0.8)",
                background: "rgba(255, 255, 255, 0.9)",
                fontSize: "13px",
                color: "var(--text-primary)",
                fontWeight: 500,
                outline: "none",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(15, 23, 42, 0.02)"
              }}
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {/* Reset Filters Action */}
        {hasActiveFilters && onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            icon={<RotateCcw size={13} />}
            style={{ fontSize: "12.5px" }}
          >
            Reset
          </Button>
        )}

        {/* Record Counter */}
        {totalCount !== undefined && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--text-muted)",
              fontWeight: 500,
              padding: "6px 10px",
              background: "rgba(15, 23, 42, 0.03)",
              borderRadius: "10px",
              whiteSpace: "nowrap"
            }}
          >
            {filteredCount !== undefined && filteredCount !== totalCount ? (
              <span>
                Showing <strong>{filteredCount}</strong> of {totalCount}
              </span>
            ) : (
              <span>
                Total: <strong>{totalCount}</strong>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchFilterBar;
