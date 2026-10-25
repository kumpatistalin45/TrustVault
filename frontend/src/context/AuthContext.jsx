import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  apiGetMe,
  apiLogin,
  apiFirebaseLogin,
  apiSendEmailOtp,
  apiVerifyEmailOtp,
  apiRetryEmailOtp,
  apiCompleteEmailLink,
  apiRegister,
  apiLogout,
  apiGetTermsStatus,
  apiAcceptTerms,
  CURRENT_TERMS_VERSION
} from "../services/api";
import { MOCK_USERS } from "../services/mockData";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("tv_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);

  // Terms & Conditions compliance gating
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => {
    try {
      const savedVersion = localStorage.getItem("tv_terms_accepted_version");
      return savedVersion === CURRENT_TERMS_VERSION;
    } catch {
      return false;
    }
  });
  const [termsLoading, setTermsLoading] = useState(false);

  // Default to connected/live backend mode. Only use mock if explicitly configured.
  const [isMockMode, setIsMockMode] = useState(() => {
    const val = localStorage.getItem("tv_mock_mode");
    if (val === "true") return true;
    if (val === "false") return false;
    return import.meta.env?.VITE_USE_MOCK === "true";
  });

  const checkTerms = useCallback(async () => {
    setTermsLoading(true);
    try {
      const status = await apiGetTermsStatus();
      const accepted = Boolean(status?.accepted && status?.acceptedVersion === CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(accepted);
      return status;
    } catch (_e) {
      const savedVersion = localStorage.getItem("tv_terms_accepted_version");
      setHasAcceptedTerms(savedVersion === CURRENT_TERMS_VERSION);
    } finally {
      setTermsLoading(false);
    }
  }, []);

  const acceptTerms = async () => {
    const res = await apiAcceptTerms({ version: CURRENT_TERMS_VERSION });
    if (res && res.success) {
      setHasAcceptedTerms(true);
      return res;
    }
    throw new Error(res?.error || "Failed to confirm Terms & Conditions acceptance.");
  };

  const updateUser = (fields) => {
    setUser((prev) => {
      const updated = { ...prev, ...fields };
      try {
        localStorage.setItem("tv_user", JSON.stringify(updated));
      } catch (_e) {}
      return updated;
    });
  };

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      if (isMockMode) {
        const saved = localStorage.getItem("tv_user");
        if (saved) {
          setUser(JSON.parse(saved));
        } else {
          setUser(null);
        }
      } else {
        const data = await apiGetMe();
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem("tv_user", JSON.stringify(data.user));
        } else {
          setUser(null);
          localStorage.removeItem("tv_user");
        }
      }
    } catch (_error) {
      if (!isMockMode) {
        setUser(null);
        localStorage.removeItem("tv_user");
      }
    } finally {
      setLoading(false);
    }
  }, [isMockMode]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const currentRole = user?.role || "viewer";
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.setAttribute("data-role", currentRole);
    }
  }, [user?.role]);

  const login = async ({ username, email, password, role }) => {
    if (isMockMode) {
      const identifier = (username || email || "").trim() || "employee@trustvault.internal";
      const lower = identifier.toLowerCase();

      let matchedRole = role;
      if (!matchedRole) {
        if (lower.includes("admin")) matchedRole = "admin";
        else if (lower.includes("viewer")) matchedRole = "viewer";
        else matchedRole = "owner";
      }

      const rawName = identifier.split("@")[0] || "Test Employee";
      const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

      const matchedUser = MOCK_USERS[matchedRole] || {
        id: Math.floor(Math.random() * 900) + 100,
        name: displayName,
        email: identifier.includes("@") ? identifier : `${identifier}@trustvault.internal`,
        role: matchedRole,
        created_at: new Date().toISOString()
      };

      const userToSet = {
        ...matchedUser,
        role: matchedRole,
        email: identifier.includes("@") ? identifier : `${identifier}@trustvault.internal`,
        name: matchedUser.name || displayName
      };

      localStorage.setItem("tv_user", JSON.stringify(userToSet));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(userToSet);
      return { user: userToSet, csrfToken: "mock-csrf-token" };
    }

    // Live API login - failures throw real errors, no silent mock fallback
    const data = await apiLogin({ username, email, password, role });
    if (data?.user) {
      setUser(data.user);
      localStorage.setItem("tv_user", JSON.stringify(data.user));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
    }
    return data;
  };

  const firebaseLogin = async ({ idToken, role }) => {
    if (isMockMode) {
      const mockRole = role || "owner";
      const mockUser = MOCK_USERS[mockRole] || MOCK_USERS.owner;
      localStorage.setItem("tv_user", JSON.stringify(mockUser));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(mockUser);
      return { success: true, user: mockUser };
    }

    const data = await apiFirebaseLogin({ idToken, role });
    if (data?.user) {
      setUser(data.user);
      localStorage.setItem("tv_user", JSON.stringify(data.user));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
    }
    return data;
  };

  /**
   * Complete Firebase email-link authentication.
   * Sends both the Firebase ID token and the application token (extracted from
   * the callback URL) to the backend. The backend verifies both and establishes
   * the TrustVault session if the 10-minute application token is still valid.
   */
  const emailLinkLogin = async ({ idToken, apiToken }) => {
    if (isMockMode) {
      const mockUser = MOCK_USERS.owner;
      localStorage.setItem("tv_user", JSON.stringify(mockUser));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(mockUser);
      return { success: true, user: mockUser };
    }

    const data = await apiCompleteEmailLink({ idToken, apiToken });
    if (data?.user) {
      setUser(data.user);
      localStorage.setItem("tv_user", JSON.stringify(data.user));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
    }
    return data;
  };

  const emailOtpLogin = async ({ email, otp, role }) => {
    if (isMockMode) {
      const mockRole = role || (email && email.toLowerCase().includes("viewer") ? "viewer" : "owner");
      const mockUser = MOCK_USERS[mockRole] || MOCK_USERS.owner;
      const userToSet = {
        ...mockUser,
        role: mockRole,
        email: (email || "").trim().toLowerCase() || mockUser.email
      };
      localStorage.setItem("tv_user", JSON.stringify(userToSet));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(userToSet);
      return { success: true, user: userToSet };
    }

    const data = await apiVerifyEmailOtp({ email, otp, role });
    if (data?.user) {
      setUser(data.user);
      localStorage.setItem("tv_user", JSON.stringify(data.user));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
    }
    return data;
  };

  const register = async ({ name, email, password, role }) => {
    if (isMockMode) {
      const newUser = {
        id: Date.now(),
        name: name || "Test Employee",
        email: (email || "").trim().toLowerCase() || "employee@trustvault.internal",
        role: role || "owner",
        created_at: new Date().toISOString()
      };
      localStorage.setItem("tv_user", JSON.stringify(newUser));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(newUser);
      return { user: newUser };
    }

    try {
      const data = await apiRegister({ name, email, password, role });
      if (data?.user) {
        localStorage.setItem("tv_user", JSON.stringify(data.user));
        localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
        setHasAcceptedTerms(true);
        setUser(data.user);
      }
      return data;
    } catch (_err) {
      const newUser = {
        id: Date.now(),
        name: name || "Test Employee",
        email: (email || "").trim().toLowerCase() || "employee@trustvault.internal",
        role: role || "owner",
        created_at: new Date().toISOString()
      };
      localStorage.setItem("tv_user", JSON.stringify(newUser));
      localStorage.setItem("tv_terms_accepted_version", CURRENT_TERMS_VERSION);
      setHasAcceptedTerms(true);
      setUser(newUser);
      return { user: newUser };
    }
  };

  const logout = async () => {
    try {
      if (!isMockMode) {
        await apiLogout();
      }
    } catch (_e) {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem("tv_user");
      setUser(null);
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.setAttribute("data-role", "viewer");
      }
    }
  };

  const toggleMockMode = (enabled) => {
    setIsMockMode(enabled);
    localStorage.setItem("tv_mock_mode", enabled ? "true" : "false");
    if (enabled) {
      const role = localStorage.getItem("tv_mock_role") || "owner";
      const userToSet = MOCK_USERS[role] || MOCK_USERS.owner;
      localStorage.setItem("tv_user", JSON.stringify(userToSet));
      setUser(userToSet);
    } else {
      checkAuth();
    }
  };

  const setMockRole = (role) => {
    if (MOCK_USERS[role]) {
      localStorage.setItem("tv_mock_role", role);
      localStorage.setItem("tv_user", JSON.stringify(MOCK_USERS[role]));
      setUser(MOCK_USERS[role]);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        role: user?.role || "viewer",
        isAdmin: user?.role === "admin",
        isOwner: user?.role === "owner",
        isViewer: user?.role === "viewer",
        isMockMode,
        hasAcceptedTerms,
        termsLoading,
        termsVersion: CURRENT_TERMS_VERSION,
        checkTerms,
        acceptTerms,
        updateUser,
        login,
        firebaseLogin,
        emailLinkLogin,
        emailOtpLogin,
        register,
        logout,
        checkAuth,
        toggleMockMode,
        setMockRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

