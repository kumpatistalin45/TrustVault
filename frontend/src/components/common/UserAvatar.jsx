import React, { useState } from "react";

export function getInitials(name) {
  if (!name || typeof name !== "string") return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic gradient generator for fallback avatar based on string seed
function getAvatarGradient(name = "user") {
  const gradients = [
    "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
    "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)",
    "linear-gradient(135deg, #0f2d3d 0%, #0369a1 100%)",
    "linear-gradient(135deg, #1e293b 0%, #0284c7 100%)",
    "linear-gradient(135deg, #2e1065 0%, #7c3aed 100%)",
    "linear-gradient(135deg, #064e3b 0%, #059669 100%)"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

export function UserAvatar({
  user,
  size = 36,
  className = "",
  style = {}
}) {
  const [imageError, setImageError] = useState(false);

  const name = user?.name || user?.email?.split("@")[0] || "User";
  const avatarUrl = user?.avatar_url || user?.avatarUrl || user?.avatar;
  const initials = getInitials(name);
  const background = getAvatarGradient(name);

  const dimension = typeof size === "number" ? `${size}px` : size;
  const fontSize = typeof size === "number" ? `${Math.max(10, Math.floor(size * 0.38))}px` : "13px";

  if (avatarUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={`${name}'s avatar`}
        onError={() => setImageError(true)}
        className={`user-avatar ${className}`}
        style={{
          width: dimension,
          height: dimension,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid rgba(255, 255, 255, 0.9)",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.12)",
          display: "block",
          flexShrink: 0,
          ...style
        }}
      />
    );
  }

  return (
    <div
      className={`user-avatar-initials ${className}`}
      role="img"
      aria-label={`${name}'s avatar`}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        borderRadius: "50%",
        background,
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-heading)",
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.02em",
        border: "1.5px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.12)",
        flexShrink: 0,
        userSelect: "none",
        ...style
      }}
    >
      {initials}
    </div>
  );
}

export default UserAvatar;
