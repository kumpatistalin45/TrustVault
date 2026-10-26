# TrustVault — Enterprise Secure Document Sharing & Zero-Trust Access Vault

TrustVault is an enterprise-grade, zero-trust inspired document management and cryptographic sharing platform. It provides confidential client and server-side encrypted document storage, role-based access control, Firebase passwordless email-link authentication, discretionary access delegations, secret-key access timers, automated audit trails, and strict single-device session enforcement.

---

## Architecture & Technology Stack

```
                                  +---------------------------------------+
                                  |         TrustVault Frontend           |
                                  |        (React 19 + Vite + CSS)        |
                                  +---------------------------------------+
                                                      |
                                     HTTPS REST API   |   Firebase Client SDK
                                    (Session Cookies  |   (Email Sign-In Links)
                                    & CSRF Tokens)    |
                                                      v
+---------------------------------------------------------------------------------------------------+
|                                      Express 5.x Backend API                                      |
|                                                                                                   |
|  +--------------------+  +--------------------+  +---------------------+  +--------------------+  |
|  | Helmet / CORS / SSL|  | Rate Limiters      |  | Session Store       |  | doubleCsrf         |  |
|  | Headers            |  | (Login/Link/OTP)   |  | (connect-pg-simple) |  | Protection         |  |
|  +--------------------+  +--------------------+  +---------------------+  +--------------------+  |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  | Services:                                                                                   |  |
|  |  * firebaseService.js   - Firebase Admin SDK email link generation & verification           |  |
|  |  * emailService.js      - Nodemailer Gmail/SMTP STARTTLS email delivery with diagnostics    |  |
|  |  * encryption.js        - AES-256-GCM master envelope encryption (TVE1)                     |  |
|  |  * keyManagementService - In-memory DEK / secret-key envelope encryption (TVE2)             |  |
|  |  * storageService.js    - Hybrid Supabase Cloud Bucket & Local Encrypted Storage            |  |
|  |  * masterDataService.js - User provisioning, role verification, and audit logging           |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
                  |                                     |                                   |
                  v                                     v                                   v
+----------------------------------+   +----------------------------------+   +---------------------------+
|       PostgreSQL Database        |   |    Document Storage Provider     |   | Transactional Email (SMTP)|
|                                  |   |                                  |   |                           |
| - users (admin/owner/viewer)     |   | - Supabase Private Bucket        |   | - Gmail SMTP (port 587)   |
| - user_sessions (pg-simple)      |   |   (trustvault-documents)         |   | - STARTTLS secure channel |
| - documents (metadata, DEK hash) |   | - Local Encrypted Disk Fallback  |   | - Action Code Links       |
| - document_permissions (ACL)     |   |   (backend/storage/ 0o600 TVE)   |   | - Passwordless Auth       |
| - audit_logs (tamper-evident)    |   +----------------------------------+   +---------------------------+
| - complaints / support tickets   |
+----------------------------------+
```

### Core Technologies

* **Frontend**: React 19, React Router v7, Vite 8, Lucide React, Vanilla CSS design system
* **Backend**: Node.js (v18+), Express 5.1.0, Helmet, CORS, Cookie-Parser, Multer
* **Database**: PostgreSQL 13+ with `pg` connection pool and `connect-pg-simple` session store
* **Authentication**:
  * **Owner & Viewer**: Firebase Passwordless Email Link Authentication (10-minute expiring links with regenerate and resend cooldown controls)
  * **Admin**: Protected corporate credentials with bcrypt hashing and public registration lockdown (Login with these credentials --->(username:Admin@trustvault.com)   --->(password:TrustVault@Snovasys#123)) Note:Admin should add the owners by their email addresses and assign the owners and owners should assign the viwers by adding their email address through their cooncern dashboards...then only the dashboards will open
* **Cryptography**: AES-256-GCM (TVE1 and TVE2 envelopes with unique 12-byte IVs and 16-byte auth tags)
* **Email Delivery**: Nodemailer SMTP with STARTTLS (smtp.gmail.com:587)
* **Cloud Storage**: Supabase Storage with local filesystem fallback in development

---

## Project Structure

```
TrustVault/
├── .github/
│   └── workflows/
│       └── deploy-frontend.yml    # GitHub Actions workflow for GitHub Pages
├── backend/
│   ├── .env.example               # Backend configuration template (no secrets)
│   ├── db.js                      # PostgreSQL pool with SSL and auto-reconnect
│   ├── emailService.js            # Nodemailer transport, Gmail STARTTLS, diagnostics
│   ├── encryption.js              # AES-256-GCM envelope encryption utilities
│   ├── firebaseService.js         # Firebase Admin SDK email-link generation
│   ├── keyManagementService.js    # Per-document DEK generation and lifecycle
│   ├── masterDataService.js       # Admin owner/viewer provisioning & verification
│   ├── migrations/                # Database migrations (001-004)
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_owner_viewer_master_data.sql
│   │   ├── 003_support_complaints.sql
│   │   └── 004_email_link_auth.sql
│   ├── package.json               # Backend dependencies and scripts
│   ├── server.js                  # Express API endpoints, middleware, rate limits
│   ├── storage/                   # Private encrypted envelopes (ignored in Git)
│   │   └── .gitkeep
│   ├── storageService.js          # Supabase cloud / local private storage adapter
│   └── tests/                     # 14 Jest test suites (232 tests)
├── frontend/
│   ├── .env.example               # Frontend configuration template
│   ├── package.json               # Frontend dependencies and scripts
│   ├── src/
│   │   ├── App.jsx                # Application root with BrowserRouter basename
│   │   ├── components/            # Reusable UI, modals, session notices, auth forms
│   │   ├── context/               # AuthContext, ToastContext, ThemeContext
│   │   ├── pages/                 # LandingPage, Dashboards, DocumentDetails, etc.
│   │   ├── routes/                # Protected role-based routes
│   │   └── services/              # API client, Firebase client SDK, mock adapter
│   ├── test/                      # 16 Vitest test suites (185 tests)
│   ├── vercel.json                # Vercel SPA rewrite configuration
│   └── vite.config.js             # Vite configuration with dynamic base path
├── .gitignore                     # Repository-wide exclusion rules
└── README.md                      # Project documentation
```

---

## Getting Started Locally

### 1. Prerequisites

* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **PostgreSQL**: v13.0 or higher (running locally or remote connection URL)

### 2. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```

2. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Populate required environment variables in `backend/.env`:
   * Set `SESSION_SECRET`, `CSRF_SECRET`, and `FILE_ENCRYPTION_KEY` (generate 64 hex characters using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   * Configure database credentials (`DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`).
   * Configure Firebase Admin credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
   * Configure SMTP credentials (`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`).

4. Run database migrations:
   ```bash
   psql -U postgres -d trustvault -f migrations/001_initial_schema.sql
   psql -U postgres -d trustvault -f migrations/002_owner_viewer_master_data.sql
   psql -U postgres -d trustvault -f migrations/003_support_complaints.sql
   psql -U postgres -d trustvault -f migrations/004_email_link_auth.sql
   ```

5. Start the backend server:
   ```bash
   npm run dev    # For development with nodemon
   # or
   npm start      # For production with node
   ```
   The backend starts on `http://localhost:5000` (or the configured `PORT`).

### 3. Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Configure frontend environment variables in `frontend/.env`:
   * `VITE_API_URL=http://localhost:5000`
   * `VITE_USE_MOCK=false` (set to `true` for standalone offline preview)
   * Populate `VITE_FIREBASE_*` configuration from your Firebase Console Web App settings.

4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## Automated Test Suites

### Backend Tests (Jest)

```bash
cd backend
npm test
```
* **Coverage**: 14 test suites, 232 automated tests covering authentication rate limiting, CSRF verification, AES-256-GCM encryption/decryption, Firebase passwordless token verification, SMTP email delivery, granular access control, single-device session invalidation, and audit trails.

### Frontend Tests (Vitest)

```bash
cd frontend
npm test
```
* **Coverage**: 16 test suites, 185 automated tests verifying responsive layouts, role dashboards, navigation drawer, temporary access timer modal, passwordless sign-in forms, and permission flows.

### Production Frontend Build

```bash
cd frontend
npm run build
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable Name | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | API server listen port | `5000` |
| `NODE_ENV` | Environment mode (`development` or `production`) | `development` |
| `FRONTEND_ORIGIN` | Allowed CORS origin for frontend | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string (Supabase / Neon / Render) | *(connection string)* |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Discrete PostgreSQL connection parameters | `localhost`, `5432`, `trustvault` |
| `DB_SSL` | Enable SSL for PostgreSQL | `false` (set `true` for cloud DB) |
| `SESSION_SECRET` | 32-byte secret for session cookie HMAC signing | *(64-character hex string)* |
| `CSRF_SECRET` | 32-byte secret for doubleCsrf token generation | *(64-character hex string)* |
| `FILE_ENCRYPTION_KEY` | 32-byte master key for AES-256-GCM envelope encryption | *(64-character hex string)* |
| `STORAGE_PROVIDER` | Document storage provider (`local` or `supabase`) | `local` |
| `SUPABASE_STORAGE_BUCKET` | Private bucket name in Supabase Storage | `trustvault-documents` |
| `SUPABASE_URL` | Supabase project URL | `https://<project-id>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret key (backend only) | *(service key)* |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `trustvault-16fe3` |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK service account email | *(service account email)* |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK private key with `\n` handling | *(private key)* |
| `SMTP_HOST` | Transactional email SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use SSL on connect (false for port 587 STARTTLS) | `false` |
| `SMTP_USER` | SMTP authentication user / email | *(email address)* |
| `SMTP_PASS` | SMTP authentication password / App Password | *(16-character app password)* |
| `EMAIL_FROM` | Outgoing sender email address | `no-reply@trustvault.com` |

### Frontend (`frontend/.env`)

| Variable Name | Description | Default / Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL of the backend Express API | `http://localhost:5000` |
| `VITE_USE_MOCK` | Enable standalone frontend mock adapter | `false` |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API Key | *(API key)* |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain | `trustvault-16fe3.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | `trustvault-16fe3` |
| `VITE_FIREBASE_STORAGE_BUCKET`| Firebase storage bucket | `trustvault-16fe3.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | *(sender ID)* |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID | *(App ID)* |

---

## Deployment Guide

### 1. Frontend Static Showcase (GitHub Pages)

The repository includes an automated GitHub Actions deployment workflow at [deploy-frontend.yml](file:///.github/workflows/deploy-frontend.yml).

1. Push the code to GitHub (`main` or `master` branch).
2. In your GitHub repository, navigate to **Settings** → **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. The workflow will automatically test, build, and deploy the frontend to:
   ```
   https://<username>.github.io/TrustVault/
   ```
5. Client-side routes (e.g. `/login`, `/dashboard`) are routed via the built `404.html` fallback.

### 2. Full-Stack Production Deployment

For full platform functionality (live database, AES decryption, live email dispatch, and document sharing):

1. **Database**: Provision a managed PostgreSQL instance (e.g., Supabase, Neon, or Render PostgreSQL) and run the 4 SQL migration scripts in `backend/migrations/`.
2. **Backend API**: Deploy the `backend/` directory to a Node.js hosting platform (e.g., Render Web Service, Railway, Fly.io, or AWS Elastic Beanstalk):
   * Build command: `npm install`
   * Start command: `node server.js`
   * Configure backend environment variables listed above.
   * Set `FRONTEND_ORIGIN` to your public frontend URL.
3. **Frontend Production Target**: Set `VITE_API_URL` in the frontend build environment to point to your live backend domain and set `VITE_USE_MOCK=false`.

---

## Security Architecture & Policies

* **Zero Plaintext Document Storage**: Documents are encrypted in memory upon upload and stored strictly as AES-256-GCM binary envelopes with authenticated tags.
* **Viewer Download Prevention**: Document downloads are strictly prohibited for Viewers at the server level via role verification and content disposition controls; Viewers can only preview documents in-app with verified decryption keys.
* **Single-Device Session Policy**: Each user account is restricted to a single active session; signing in from a new device revokes previous session tokens.
* **Audit Trail Immutability**: All security-relevant actions (logins, uploads, permission grants, access revocations, key requests, and policy changes) are recorded with timestamps, user IDs, and client IP addresses.

---

## License

This project is licensed under the MIT License.
