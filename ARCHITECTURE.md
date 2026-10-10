# Architecture Document: PAO Surgery Simulator

## Overview

**PAO Surgery Simulator** is a web-based medical imaging application designed to help surgeons plan periacetabular osteotomy (PAO) procedures. It enables secure user authentication, DICOM medical scan uploads, 3D bone visualization, and collaborative surgical planning with anatomical annotations.

**Primary Use Cases:**
- Secure user authentication and account management
- Upload and storage of 2D medical DICOM scans
- Automatic conversion to interactive 3D WebGL visualizations
- Anatomical labeling and annotation of key surgical landmarks
- Patient-based scan organization and retrieval

---

## Technology Stack

### Frontend
- **React 18.2** — Component-based UI framework
- **VTK.js 36.12** (@kitware/vtk.js) — 3D visualization and WebGL rendering
- **react-router-dom 7.18** — Client-side routing and navigation
- **react-hot-toast 2.6** — Non-blocking toast notifications for user feedback
- **axios 1.19** — HTTP client for API communication
- **gl-matrix 3.4** — Matrix and vector math for 3D transformations
- **react-spinners 0.17** — Loading indicators

### Backend
- **Python 3.x** — Server-side logic
- **Flask** — Lightweight web framework for REST APIs
- **SQLAlchemy** — ORM for database interactions
- **pydicom** — DICOM medical image parsing and metadata extraction
- **VTK (vtk, vtkmodules)** — 3D rendering and volumetric image processing
- **PIL (Pillow)** — Image manipulation
- **werkzeug** — Secure file handling and password hashing
- **flask-cors** — Cross-Origin Resource Sharing support

### Database
- **PostgreSQL** (production) — Persistent data storage
- **SQLite** (development) — Lightweight alternative for local testing

### Infrastructure & Dev Tools
- **Docker** — Containerization
- **Node.js & npm** — Frontend build tooling
- **git** — Version control

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               React Application (SPA)                │   │
│  │  - Landing Page  - Login / Signup Pages              │   │
│  │  - Dashboard (Scan List)  - 3D Viewer                │   │
│  │  - Protected Routes (Auth Guard)                     │   │
│  │  - Toast Notifications (Global Toaster)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                            ↓ (axios)                        │
└─────────────────────────────────────────────────────────────┘
                             ↓
            ┌────────────────────────────────────┐
            │   REST API (Flask Backend)         │
            │  http://localhost:5000 (dev)       │
            ├────────────────────────────────────┤
            │ POST   /api/signup                 │
            │ POST   /api/login                  │
            │ GET    /api/users/:id/scans        │
            │ POST   /api/upload_dicom           │
            │ GET    /api/render_dicom/:id       │
            │ GET    /api/render_dicom/:id/meta  │
            │ POST   /api/scans/:id/labels       │
            │ GET    /api/scans/:id/labels       │
            │ PATCH  /api/scans/:id/labels/:lid  │
            │ GET    /api/download_dicom/:id     │
            │ GET    /api/sessions               │
            └────────────────────────────────────┘
                             ↓
            ┌────────────────────────────────────┐
            │      PostgreSQL / SQLite DB        │
            ├────────────────────────────────────┤
            │ - users                            │
            │ - dicom_uploads (scans)            │
            │ - labels (annotations)             │
            │ - patients / images (legacy)       │
            │ - patient_scans (legacy)           │
            └────────────────────────────────────┘
                             ↓
            ┌────────────────────────────────────┐
            │   Filesystem (UPLOAD_FOLDER)       │
            │   └─ uploads/                      │
            │      └─ {upload_id}/               │
            │         ├─ *.dcm (DICOM files)     │
            │         └─ volume.vti (cached)     │
            └────────────────────────────────────┘
```

---

## Frontend Architecture

### Directory Structure
```
frontend/
├── src/
│   ├── App.js                 # Main routing and global state
│   ├── App.css                # Global styles
│   ├── pages/
│   │   ├── Landing.js         # Public landing page
│   │   ├── Login.js           # User authentication
│   │   ├── Signup.js          # Account creation
│   │   ├── Dashboard.js       # Scan list and management
│   │   └── Viewer.js          # 3D DICOM viewer page
│   ├── components/
│   │   ├── ProtectedRoute.js  # Auth guard wrapper
│   │   ├── VTKViewer.js       # 3D visualization component
│   │   └── [other UI components]
│   ├── index.js               # React root mount
│   └── index.css              # Base styles
├── public/
│   ├── index.html             # HTML entry point
│   └── [static assets]
└── package.json               # Dependencies and scripts
```

### Key Components

#### **App.js** — Root Component
- Sets up **React Router** for client-side navigation
- Mounts **Toaster** (react-hot-toast) at the top-right for globally accessible notifications
- Defines protected routes using `ProtectedRoute` wrapper
- Toast auto-dismisses after 4 seconds (configurable per call)

**Route Map:**
| Path | Component | Protected | Description |
|------|-----------|-----------|-------------|
| `/` | Landing | No | Public landing page |
| `/login` | Login | No | User login form |
| `/signup` | Signup | No | Account creation form |
| `/dashboard` | Dashboard | Yes | Scan list and management |
| `/viewer/:uploadId` | Viewer | Yes | 3D DICOM viewer |
| `*` | → `/login` | — | Catch-all fallback |

#### **Login & Signup Pages**
- **Input Validation:** Client-side validation of username, email, password
- **Error Handling:** Failed requests display inline text AND toast notifications
- **Success Feedback:** Account creation and logout trigger success toasts
- **State Management:** User ID stored in localStorage after login
- **API Integration:** axios POSTs to `/api/login` and `/api/signup`

#### **Dashboard Page**
- **Scan List:** Fetches user's uploaded DICOM scans via GET `/api/users/:id/scans`
- **Upload Flow:**
  - File input for DICOM files
  - Multipart POST to `/api/upload_dicom` with user_id
  - Success toast + dashboard refresh
  - Error toast on failure
- **Scan Actions:**
  - View (navigate to `/viewer/:uploadId`)
  - Download (as ZIP via `/api/download_dicom/:uploadId`)

#### **Viewer Page**
- **3D Rendering:**
  - Extracts `uploadId` from URL params via `useParams()`
  - Fetches rendered VTI file from `/api/render_dicom/:uploadId`
  - Fetches metadata from `/api/render_dicom/:uploadId/metadata`
  - Passes to **VTKViewer** component for WebGL rendering
- **Annotations:**
  - Create labels via POST `/api/scans/:uploadId/labels`
  - Fetch labels via GET `/api/scans/:uploadId/labels`
  - Toggle visibility via PATCH `/api/scans/:uploadId/labels/:labelId/toggle`

#### **ProtectedRoute Component**
- Checks for logged-in user (user_id in localStorage)
- Redirects unauthorized access to `/login`
- Wraps protected pages

#### **VTKViewer Component**
- Uses `@kitware/vtk.js` for WebGL-based 3D rendering
- Loads vtkImageData (VTI format) from backend
- Supports:
  - Interactive rotation, zoom, pan
  - Window/level adjustments for medical imaging
  - Overlay of 3D anatomical labels

### State Management & Persistence
- **localStorage:** Stores `user_id` after login (session persistence)
- **React State:** Page-level state for forms, uploads, scan lists
- **axios interceptors:** Could be added for auth token handling (future enhancement)

### Styling
- **App.css:** Global styles, responsive layout
- **Component-level CSS:** Individual component styling (co-located or separate)
- **Responsive Design:** Tested at desktop (1920×1080) and mobile (390×844) viewports

---

## Backend Architecture

### Directory Structure
```
backend/
├── app.py             # Flask application, route handlers
├── models.py          # SQLAlchemy ORM models
├── base.py            # SQLAlchemy Base and metadata
├── db.py              # Database connection and initialization
├── requirements.txt   # Python dependencies
├── uploads/           # DICOM file storage (created at runtime)
└── [configuration files]
```

### Database Schema

#### **User Table** (`users`)
```python
- user_id (PK, Integer, auto-increment)
- user_name (String(20), unique, not null)
- user_email (String(255), unique, not null)
- user_organization (String(255), nullable)
- user_password (String(255), hashed, not null)
```

#### **Dicom Upload Table** (`dicom_uploads`)
```python
- upload_id (PK, String(36), UUID)
- user_id (FK → users.user_id)
- upload_date (Timestamp, auto-set)
```

#### **Label Table** (`labels`)
```python
- label_id (PK, Integer, auto-increment)
- scan_id (FK → dicom_uploads.upload_id, indexed)
- name (String(255), not null)
- description (String(1000), default "")
- x, y, z (Float, 3D coordinates)
- body_part_id, scan_2d_id, scan_3d_id (String, optional)
- visible (Boolean, default True)
```

#### **Legacy Tables** (Patient, Image, Patient_Scan)
- Present in models but **not actively used** in current endpoints
- Retained for backward compatibility

### Core Endpoints

#### **Authentication**

**POST `/api/signup`**
- Input: `user_name`, `user_email`, `user_organization`, `user_password`
- Validation:
  - Username: non-empty string, not already used
  - Email: valid format, not already used
  - Password: 6–255 characters
- Output: `{ "message": "User Account", "id": <user_id> }` (201)
- Errors: 400 (invalid input), 500 (server error)

**POST `/api/login`**
- Input: `user_name`, `user_password` (or legacy `username`, `password`)
- Validation: Username exists, password matches hash
- Output: `{ "message": "Login successful", "user_id": <id>, "user_name": <name> }` (200)
- Errors: 400 (missing data), 401 (invalid credentials), 500 (server error)

#### **DICOM Upload & Rendering**

**POST `/api/upload_dicom`**
- Input: Multipart form with `files` (list of .dcm) and `user_id`
- Processing:
  1. Generate UUID for upload
  2. Save .dcm files to `uploads/{upload_id}/`
  3. Extract patient name from first DICOM
  4. Create `Dicom` database record
- Output: `{ "message": "Files uploaded", "upload_id": <uuid>, "patient_name": <name> }` (200)
- Errors: 400 (missing files/user_id), 500 (save or DB error)

**GET `/api/render_dicom/<upload_id>`**
- Processing:
  1. Validate and sanitize `upload_id`
  2. Load all .dcm files from `uploads/{upload_id}/`
  3. Sort by `ImagePositionPatient[2]`, `SliceLocation`, or `InstanceNumber`
  4. Apply DICOM rescale (slope/intercept)
  5. Stack slices into 3D numpy volume
  6. Convert to vtkImageData with physical spacing
  7. Write vtkImageData to VTI format file
  8. Return VTI file as binary
- Output: `.vti` file (binary, application/octet-stream)
- Errors: 400 (invalid ID), 404 (upload not found), 500 (processing error)

**GET `/api/render_dicom/<upload_id>/metadata`**
- Extracts rich DICOM metadata from the first file:
  - **Physical Dimensions:** Rows, columns, pixel spacing, slice thickness, volume depth
  - **Patient Info:** Name, ID, birth date, sex
  - **Study Info:** Date, time, description
  - **Series Info:** Description, modality, number of files
  - **Image Processing:** Window center/width, rescale slope/intercept, intensity range
- Output: `{ "status": "success", "data": { ... } }` (200)
- Errors: 400 (invalid ID), 404 (not found), 500 (extraction error)

#### **Scan Management**

**GET `/api/users/<user_id>/scans`**
- Lists all DICOM uploads for a user
- For each upload, verifies files exist and returns file list
- Output: `[ { "upload_id": <uuid>, "user_id": <id>, "upload_date": <iso>, "files": [...] }, ... ]` (200)
- Errors: 404 (user not found), 500 (DB/filesystem error)

**GET `/api/download_dicom/<upload_id>`**
- Creates a ZIP archive of all .dcm files in the upload
- Returns ZIP as attachment for download
- Output: `.zip` file (binary, application/zip)
- Errors: 400 (invalid ID), 404 (not found), 500 (ZIP creation error)

**GET `/api/sessions`**
- Lists active upload sessions (directories in `uploads/`)
- Output: `{ "sessions": [ <uuid>, ... ] }` (200)
- Errors: 500 (listing error)

#### **Annotation (Labels)**

**POST `/api/scans/<scan_id>/labels`**
- Input: `name`, `coordinates` (x, y, z), `description`, `body_part_id`, `scan_2d_id`, `scan_3d_id`, `visible`
- Validation:
  - `name`: non-empty string
  - `coordinates`: numeric x, y, z
  - Scan exists
- Output: Label object with `label_id` (201)
- Errors: 400 (invalid input), 404 (scan not found), 500 (DB error)

**GET `/api/scans/<scan_id>/labels`**
- Returns all labels for a scan
- Output: `{ "scan_id": <id>, "labels": [ { ... }, ... ] }` (200)
- Errors: 500 (DB error)

**PATCH `/api/scans/<scan_id>/labels/<label_id>/toggle`**
- Toggles the `visible` flag of a label
- Output: Updated label object (200)
- Errors: 404 (label not found), 500 (DB error)

### Data Flow: DICOM Upload to 3D Visualization

1. **Frontend (Dashboard):**
   - User selects .dcm files
   - POST to `/api/upload_dicom` with `files` and `user_id`

2. **Backend (app.py):**
   - Generate UUID, create upload directory
   - Save .dcm files securely
   - Extract patient name from metadata
   - Create `Dicom` DB record
   - Return `upload_id` to frontend

3. **Frontend (Viewer):**
   - Navigate to `/viewer/:uploadId`
   - Fetch metadata via `/api/render_dicom/:uploadId/metadata`
   - Fetch rendered volume via `/api/render_dicom/:uploadId`

4. **Backend (Rendering):**
   - Load all .dcm files from `uploads/{uploadId}/`
   - Sort slices by position
   - Convert to vtkImageData with physical spacing
   - Write to `.vti` file
   - Stream `.vti` to frontend

5. **Frontend (VTKViewer):**
   - Parse .vti binary
   - Render 3D volume in WebGL canvas
   - Allow interactive manipulation (rotate, zoom, pan)
   - Support label overlay

### Security & Validation

- **Path Traversal Protection:**
  - All file paths validated using `secure_filename()`
  - Strict boundary checks (`dicom_dir.startswith(base_uploads)`)
  - Absolute paths used for all directory operations

- **Password Security:**
  - Passwords hashed via `werkzeug.security.generate_password_hash()`
  - Verified with `check_password_hash()`

- **CORS Support:**
  - `flask-cors` enables frontend-backend cross-origin requests

- **Input Validation:**
  - All POST/PATCH endpoints validate data types and constraints
  - File type restricted to `.dcm` (DICOM)

### Error Handling

- **Consistent JSON responses** with `error` key and HTTP status codes
- **400:** Invalid input, malformed requests
- **401:** Authentication failure
- **404:** Resource not found
- **500:** Server errors (logged)
- **CORS errors:** Handled by flask-cors middleware

---

## Data Flow: Key User Journeys

### **Journey 1: Sign Up & Login**
```
1. User → Landing/Signup Form
2. Form → POST /api/signup
3. Backend → Validate, hash password, create User record
4. Backend → 201 + user_id
5. Frontend → Toast (success), redirect to /login
6. User → Login form
7. Form → POST /api/login
8. Backend → Verify credentials
9. Backend → 200 + user_id
10. Frontend → Store user_id in localStorage
11. Frontend → Redirect to /dashboard
```

### **Journey 2: Upload DICOM Scan**
```
1. User → Dashboard
2. Dashboard → GET /api/users/{user_id}/scans (load prior scans)
3. User → Select .dcm files, upload
4. Upload → POST /api/upload_dicom (multipart)
5. Backend → Save to uploads/{uuid}/, create Dicom record
6. Backend → 200 + upload_id
7. Frontend → Toast (success), refresh scan list
```

### **Journey 3: View 3D Scan**
```
1. User → Click scan in dashboard
2. Frontend → Navigate to /viewer/{upload_id}
3. Viewer → GET /api/render_dicom/{upload_id}/metadata
4. Viewer → GET /api/render_dicom/{upload_id}
5. Backend → Load .dcm files, render to .vti, stream back
6. Frontend → VTKViewer parses .vti and renders WebGL
7. User → Interactive 3D manipulation (rotate, zoom)
```

### **Journey 4: Add Anatomical Labels**
```
1. User → Click point in 3D viewer
2. Frontend → Capture 3D coordinates
3. Frontend → POST /api/scans/{upload_id}/labels
4. Backend → Validate, create Label record
5. Frontend → Toast (success), reload label list
6. Viewer → GET /api/scans/{upload_id}/labels
7. Viewer → Render labels as 3D overlays
```

---

## Deployment Considerations

### Development
- Frontend: `npm start` (React dev server on `localhost:3000`)
- Backend: `python app.py` (Flask dev server on `localhost:5000`)
- Database: PostgreSQL or SQLite
- File storage: Local `backend/uploads/` directory

### Production
- **Frontend:** Build (`npm run build`), serve static files via CDN or web server (Nginx, Apache)
- **Backend:** Deploy Flask app via WSGI server (Gunicorn, uWSGI)
- **Database:** PostgreSQL instance (managed service recommended)
- **File Storage:** Cloud object storage (AWS S3, Google Cloud Storage, Azure Blob) instead of local filesystem
- **CORS:** Configure to allow frontend domain
- **API Base:** Set `REACT_APP_API_BASE` environment variable
- **Secrets:** Use environment variables for database credentials, API keys

### Docker Deployment
```dockerfile
# Dockerfile.frontend
FROM node:18
WORKDIR /app
COPY frontend/ .
RUN npm install && npm run build
EXPOSE 3000

# Dockerfile.backend
FROM python:3.10
WORKDIR /app
COPY backend/ .
RUN pip install -r requirements.txt
EXPOSE 5000
CMD ["python", "app.py"]
```

---

## Contributing Notes

See CONTRIBUTORS.md
