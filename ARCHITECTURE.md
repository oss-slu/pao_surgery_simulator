# Architecture Document: PAO Surgery Simulator

## Overview

PAO Surgery Simulator is a browser-based medical imaging application. Its current workflows support account creation with email verification, authenticated DICOM uploads, scan organization and download, DICOM-to-VTI conversion, and a browser-based 3D volume viewer.

The visual summary and component view are maintained in the [architecture diagrams](.github/modernize/assessment/engines/facts/architecture-diagram.md). This document describes the implementation details behind those diagrams and calls out current limitations rather than treating planned capabilities as implemented.

## Technology Stack

| Area | Technology | Version / configuration | Role |
|---|---|---|---|
| Frontend | React, React Router | React 18.2; Router 7.x | Single-page interface and navigation |
| 3D display | VTK.js | 36.x | Reads VTI data and renders a WebGL volume |
| Frontend requests | Fetch API | Browser built-in | Account calls and shared authenticated scan transport |
| Backend API | Flask, Flask-CORS | Flask 3.1.3 | REST endpoints and cross-origin API access |
| Image handling | pydicom, VTK, NumPy | pydicom 2.4.5; VTK 9.6.2; NumPy 2.5.2 | Reads DICOM series and creates VTI volumes |
| Persistence | SQLAlchemy, PostgreSQL | SQLAlchemy 2.0.52; PostgreSQL 14 in Compose | Relational records and login sessions |
| Email | `mailer.py` | Console by default; SMTP configurable | Sends account verification email |
| Containers | Docker Compose | Compose file format 3.8 | Defines frontend, backend, and database services |

The backend runtime is PostgreSQL-only: `backend/db.py` constructs a PostgreSQL engine from `backend/database.ini`. SQLite appears in isolated tests, not as a configured application runtime. The frontend's active API calls use `fetch`; Axios is listed as a dependency but is not the shared session transport.

## System Structure

The React application talks to one Flask API. The API separates requests into account/session behavior and scan behavior within the same Flask process. SQLAlchemy persists users, sessions, scans, and labels in PostgreSQL; uploaded DICOM series and generated VTI files live in the backend upload directory. Optional SMTP is used only for email delivery.

See the [application architecture diagram](.github/modernize/assessment/engines/facts/architecture-diagram.md#application-architecture) for the high-level request and data flow, and the [component relationships diagram](.github/modernize/assessment/engines/facts/architecture-diagram.md#component-relationships) for frontend, API, guard, and data-access interactions.

### Frontend routes and components

| Route | Component | Access | Current behavior |
|---|---|---|---|
| `/` | `Landing` | Public | Landing page |
| `/login` | `Login` | Public | Hosts login and signup as two UI states |
| `/verify` | `VerifyEmail` | Public | Submits the email-verification token from the link |
| `/dashboard` | `Dashboard` | Protected | Lists, uploads, renames, opens, and downloads scans |
| `/viewer/:uploadId` | `Viewer` | Protected | Requests scan data and displays the volume with `VTKViewer` |
| Other paths | Redirect | Public | Redirects to `/login` |

`ProtectedRoute` checks for a session token before showing protected pages. `sessionApi.js` manages browser session state, expiration and renewal, authenticated scan requests, and logout. Login/session identifiers (`user_id`, `user_name`) are also kept in local storage for frontend display and coordination; the backend uses the session token, not those values, as the authentication authority. Session tokens are submitted in protected request bodies or multipart metadata; GET requests can use the session cookie.

### Backend responsibilities

`backend/app.py` contains Flask route handlers, request validation, DICOM processing, and the session/scan-ownership decorators. `backend/session_tokens.py` owns database-backed session creation, validation, renewal, and revocation. `backend/db.py` creates SQLAlchemy sessions and initializes tables. `backend/models.py` defines the persisted entities. `backend/mailer.py` sends verification messages to the console by default or through configured SMTP.

### Persistence model

- **`users`** stores username, email, organization, password hash, and email-verification status.
- **`login_sessions`** stores a hash of the session token, session identifier, user reference, issue/expiry timestamps, and revocation status. The token lifetime is one hour.
- **`dicom_uploads`** stores a scan UUID, owner, optional patient name, and upload timestamp.
- **`labels`** stores a scan reference, label name/description, 3D coordinates, optional anatomy/scan identifiers, and visibility.
- **`patients`, `images`, and `patient_scans`** remain in the ORM model as legacy data structures; the current scan workflow uses `dicom_uploads`.
- **Filesystem assets** are stored under `backend/uploads/<upload_id>/`, including source `.dcm` files and generated `volume.vti` files.

## Account and Session Flow

1. Signup submits account details to `POST /api/signup`. The backend validates input, hashes the password, creates an unverified user, and sends a verification message.
2. Verification links open `/verify?token=...`; the frontend posts the token to `POST /api/verify_email`. Verification tokens expire after 24 hours. `POST /api/resend_verification` supports requesting another message.
3. `POST /api/login` checks the password and requires the account to be verified. A successful login creates a database-backed one-hour session.
4. Protected requests submit the session token. The frontend transport refreshes sessions near expiration and supports logout; the backend validates the session record on protected operations.

Email delivery defaults to console output. SMTP delivery requires mail settings and a frontend base URL in the backend environment. Verification emails are therefore not necessarily sent to an external mail server in a local development setup.

## Scan and Visualization Flow

1. The dashboard sends DICOM files to `POST /api/upload_dicom`. The backend derives the owner from the validated session, saves accepted `.dcm` files under a new UUID directory, extracts a patient name where possible, and stores the upload record.
2. The dashboard requests `GET /api/users/<user_id>/scans` for the authenticated user's scans. Scan-specific operations use both session validation and an ownership check before reaching records or files.
3. The viewer requests `GET /api/render_dicom/<upload_id>`. The backend reads and sorts the DICOM slices, constructs a NumPy volume and VTK image, writes `volume.vti`, and returns the generated file. The current implementation performs conversion when the render endpoint is called; it does not first reuse an existing VTI as a cache.
4. `VTKViewer` parses the returned VTI data and renders it using VTK.js/WebGL. The backend also exposes a DICOM metadata endpoint. The viewer's current UI sends a demo label through the label API.
5. Download requests create a ZIP archive from the scan's DICOM files and return it to the client.

### Current annotation scope

The backend supports creating, listing, and toggling label visibility through `/api/scans/<scan_id>/labels` endpoints. The current viewer UI is not a full annotation editor: it has a demo-label action and displays the returned label information, rather than implementing complete spatial placement, editing, and management of anatomical annotations.

## API Surface

All API paths below are implemented in `backend/app.py`. Except for account and health operations, scan operations require a valid session; scan-specific file and label endpoints also enforce scan ownership.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/signup` | Create an unverified account and send verification email |
| `POST` | `/api/login` | Authenticate a verified account and create a session |
| `POST` | `/api/verify_email` | Verify an account using a signed token |
| `POST` | `/api/resend_verification` | Resend an account verification email |
| `POST` | `/api/logout` | Revoke the submitted session |
| `POST` | `/api/session/refresh` | Replace a valid session with a new one |
| `GET`, `POST` | `/api/users/<user_id>/scans` | List the authenticated user's scans |
| `PATCH` | `/api/scans/<scan_id>` | Rename/update scan patient information |
| `POST` | `/api/upload_dicom` | Upload a DICOM series |
| `POST`, `GET` | `/api/scans/<scan_id>/labels` | Create or list labels |
| `POST` | `/api/scans/<scan_id>/labels/list` | Compatibility route for listing labels |
| `PATCH` | `/api/scans/<scan_id>/labels/<label_id>/toggle` | Toggle label visibility |
| `GET`, `POST` | `/api/render_dicom/<upload_id>` | Generate and return a VTI volume |
| `GET`, `POST` | `/api/render_dicom/<upload_id>/metadata` | Read DICOM metadata |
| `GET`, `POST` | `/api/download_dicom/<upload_id>` | Download the scan's DICOM files as ZIP |
| `GET`, `POST` | `/api/sessions` | List the authenticated user's upload directories |
| `GET` | `/api/health` | Basic health response |

## Security and Error Boundaries

- Protected requests are validated against database-backed session records; expired and revoked sessions are rejected.
- Scan-specific operations verify that the authenticated user owns the scan before accessing its metadata, labels, or files.
- Passwords are hashed using Werkzeug. Verification links use signed, time-limited tokens.
- Uploaded filenames are sanitized and restricted to `.dcm`. Scan paths are checked against the upload directory boundary.
- Flask-CORS permits frontend/backend cross-origin calls. The allowed origins are not narrowed in the current application configuration.
- The backend requires `SECRET_KEY` at startup. Keep it and database credentials in environment/deployment secrets rather than source control.
- API errors generally use JSON responses with HTTP status codes; authentication and scan-ownership failures are distinguished from server errors.

## Deployment and Operational Notes

### Current local and Compose setup

- Frontend: Node 18 container, React development server on port 3000.
- Backend: Python 3.10 container, Flask app on port 5000.
- Database: PostgreSQL 14 container on port 5432.
- Upload storage: `backend/uploads` is bind-mounted into the backend container.
- Compose does not declare a persistent volume for PostgreSQL.

The backend reads its PostgreSQL connection from `backend/database.ini`; the Compose database service has its own database/user settings. Configure these together for the intended environment. The checked-in Compose file does not set an explicit backend dependency on the database, and starting the database container does not itself guarantee readiness.

The backend also requires `SECRET_KEY` from its environment. For local Compose use, configure `backend/.env` with a non-committed secret and align the database connection settings with the Compose PostgreSQL service.

The Dockerfiles start the React development server and `python app.py`; this is a development-oriented configuration, not a production deployment recipe.

### Production considerations, not current features

For production, use a production WSGI server for Flask, serve a built frontend, restrict CORS to known frontend origins, manage secrets outside the repository, and provide durable database and medical-image storage with backup/retention policies. Object storage and managed database services are possible future deployment choices; neither is wired into the current application.

## Related Documentation

- [Visual architecture and component diagrams](.github/modernize/assessment/engines/facts/architecture-diagram.md)
- [Project README](README.md)
- [Backend README](backend/README.md)
