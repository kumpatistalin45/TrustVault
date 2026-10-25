import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // Theme: 'light' | 'dark' | 'system'
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem("tv_theme") || "system";
    } catch {
      return "system";
    }
  });

  // Accessibility: density ('comfortable' | 'compact')
  const [density, setDensityState] = useState(() => {
    try {
      return localStorage.getItem("tv_density") || "comfortable";
    } catch {
      return "comfortable";
    }
  });

  // Accessibility: text size ('normal' | 'large')
  const [textSize, setTextSizeState] = useState(() => {
    try {
      return localStorage.getItem("tv_text_size") || "normal";
    } catch {
      return "normal";
    }
  });

  // Resolve system dark mode
  const getSystemTheme = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("tv_theme") || "system" : "system";
    return saved === "system" ? getSystemTheme() : saved;
  });

  // Apply theme to DOM and persist
  const applyTheme = useCallback((targetTheme) => {
    const active = targetTheme === "system" ? getSystemTheme() : targetTheme;
    setResolvedTheme(active);
    document.documentElement.setAttribute("data-theme", active);
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${active}`);
  }, [getSystemTheme]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("tv_theme", newTheme);
    } catch (_e) {
      // Ignore local storage error
    }
    applyTheme(newTheme);
  };

  const setDensity = (newDensity) => {
    setDensityState(newDensity);
    try {
      localStorage.setItem("tv_density", newDensity);
    } catch (_e) {}
    document.documentElement.setAttribute("data-density", newDensity);
  };

  const setTextSize = (newSize) => {
    setTextSizeState(newSize);
    try {
      localStorage.setItem("tv_text_size", newSize);
    } catch (_e) {}
    document.documentElement.setAttribute("data-text-size", newSize);
  };

  // Listen for OS system theme changes if 'system' is selected
  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [theme, applyTheme]);

  // Apply initial accessibility density and text size attributes
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    document.documentElement.setAttribute("data-text-size", textSize);
  }, [density, textSize]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        density,
        setDensity,
        textSize,
        setTextSize
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export default ThemeContext;
