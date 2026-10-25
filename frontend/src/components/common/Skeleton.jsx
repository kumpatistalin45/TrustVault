import React from "react";

export function Skeleton({ width = "100%", height = "20px", borderRadius = "var(--radius-sm)", style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, #141824 25%, #1e2436 50%, #141824 75%)",
        backgroundSize: "200% 100%",
        animation: "pulseGlow 1.8s infinite ease-in-out",
        ...style
      }}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: "16px" }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="28px" width={c === 0 ? "35%" : "15%"} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;

