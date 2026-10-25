import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink
} from "firebase/auth";

export { isSignInWithEmailLink, signInWithEmailLink };

let mockFirebaseClient = null;
let firebaseAppInstance = null;
let firebaseAuthInstance = null;

export function getFirebaseConfig() {
  const apiKey = import.meta.env?.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env?.VITE_FIREBASE_PROJECT_ID;

  if (!apiKey || !authDomain || !projectId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env?.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID
  };
}

export function isFirebaseClientConfigured() {
  if (mockFirebaseClient) return true;
  return Boolean(getFirebaseConfig());
}

export function initFirebaseClient() {
  if (firebaseAppInstance) return firebaseAppInstance;
  const config = getFirebaseConfig();
  if (!config) return null;

  if (getApps().length === 0) {
    firebaseAppInstance = initializeApp(config);
  } else {
    firebaseAppInstance = getApp();
  }
  return firebaseAppInstance;
}

export function getFirebaseAuth() {
  if (mockFirebaseClient) {
    return mockFirebaseClient;
  }
  if (firebaseAuthInstance) return firebaseAuthInstance;

  const app = initFirebaseClient();
  if (!app) return null;

  firebaseAuthInstance = getAuth(app);
  return firebaseAuthInstance;
}

// Export singleton Auth instance (or null if unconfigured)
export const auth = getFirebaseAuth();

/**
 * Dispatches an official Firebase passwordless sign-in email link.
 * Note: Firebase Email Authentication uses secure single-use sign-in links, not six-digit numeric OTPs.
 */
export async function sendFirebaseSignInLink(email) {
  if (mockFirebaseClient?.sendSignInLink) {
    return mockFirebaseClient.sendSignInLink(email);
  }
  if (mockFirebaseClient?.sendEmailOtp) {
    return mockFirebaseClient.sendEmailOtp(email);
  }

  const clientAuth = getFirebaseAuth();
  if (!clientAuth) {
    throw new Error(
      "Firebase Authentication is not configured. Please configure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID in frontend/.env"
    );
  }

  const callbackUrl = `${window.location.origin}/login/callback`;
  const actionCodeSettings = {
    url: callbackUrl,
    handleCodeInApp: true
  };

  await sendSignInLinkToEmail(clientAuth, email, actionCodeSettings);

  // Store in sessionStorage only (not localStorage) so it's tab-scoped and
  // automatically cleared when the browser session ends. Never persisted.
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem("tv_email_for_link_signin", email);
  }

  return { success: true };
}

/**
 * Completes sign-in with Firebase email link and extracts verified ID token.
 */
export async function completeFirebaseEmailLinkSignIn(email, linkUrl = (typeof window !== "undefined" ? window.location.href : "")) {
  if (mockFirebaseClient?.completeEmailLinkSignIn) {
    return mockFirebaseClient.completeEmailLinkSignIn(email, linkUrl);
  }
  if (mockFirebaseClient?.verifyEmailOtp) {
    return mockFirebaseClient.verifyEmailOtp(email, linkUrl);
  }

  const clientAuth = getFirebaseAuth();
  if (!clientAuth) {
    throw new Error(
      "Firebase Authentication is not configured. Please configure VITE_FIREBASE_API_KEY in frontend/.env"
    );
  }

  if (!isSignInWithEmailLink(clientAuth, linkUrl)) {
    throw new Error("The provided link is not a valid Firebase email sign-in link.");
  }

  const userCredential = await signInWithEmailLink(clientAuth, email, linkUrl);
  const idToken = await userCredential.user.getIdToken();
  return { idToken, user: userCredential.user };
}

// Backward-compatibility aliases for existing calls
export const sendFirebaseEmailOtp = sendFirebaseSignInLink;
export const verifyFirebaseEmailOtp = completeFirebaseEmailLinkSignIn;

// Testing helper for Vitest suites
export function _setFirebaseClientMock(mock) {
  mockFirebaseClient = mock;
}

export function _resetFirebaseClientMock() {
  mockFirebaseClient = null;
}
