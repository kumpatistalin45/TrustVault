import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { TemporaryAccessProvider } from "./context/TemporaryAccessContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AppRoutes } from "./routes/AppRoutes";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <TemporaryAccessProvider>
              <AppRoutes />
            </TemporaryAccessProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
