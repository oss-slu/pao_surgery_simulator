# PAO Simulation Surgery
This application is currently under development

## Project Overview
PAO Simulation Surgery is a web based application designed to establish an interactive platform for **practicing research in medicine, enabling the practicing of surgical procedures in a virtual simulation**. The project is being developed by **SLU Capstone Project Team under Open Source with SLU in collaboration with Saint Louis University faculty advisors**.

### Features
- **Login Page:** Secure entry point for the application.
- **Scans Upload and Storage:** Allows users to upload 2D medical scans (DICOM files) which are processed and stored securely.
- **Patient Dashboard:** A portal where users can browse and view their previously uploaded scans.
- **3D Viewer:** Automatically converts the uploaded 2D slices into a fully manipulatable, 3D WebGL model of the bone structure.

### Tech Stack
- **Frontend:** React, VTK.js
- **Backend:** Python (Flask), pydicom
- **Database:** PostgreSQL (application runtime); SQLite is used by tests
- **DB Tools:** SQLAlchemy
- **Dev Tools:** Docker, Node.js, NPM

### Getting Started
- Clone the Repository from GitHub.
- Install the requirements for React using `npm install` in the frontend, and in the backend for Python using `pip install -r requirements.txt` in the terminal.
- Copy `backend/.env.example` to `backend/.env`. Set `SECRET_KEY` (generate with `python -c "import secrets; print(secrets.token_hex(32))"`); the backend will not start without it.
- Email settings in `backend/.env`: `MAIL_BACKEND=console` (default) prints messages locally instead of sending. For Gmail SMTP, set `MAIL_BACKEND=smtp`, `MAIL_SERVER=smtp.gmail.com`, `MAIL_PORT=587`, plus `MAIL_USERNAME` and `MAIL_PASSWORD` — use a Google App Password, not your normal account password. `MAIL_SENDER` is the From address; `FRONTEND_URL` is the base URL for verification links (local default `http://localhost:3000`).
- Never commit `backend/.env` or any credentials.
- Email verification: signup sends a verification email; users must verify via `/verify?token=...` before login. Unverified login shows a resend action. Configure mail via `MAIL_*` / `FRONTEND_URL` in `backend/.env` (console backend for local development).
- Configure `backend/database.ini` for your PostgreSQL instance and start the database before the backend.
- After installing necessary requirements, run the application by using `python app.py` in the `backend` folder and `npm start` in the `frontend` folder.
- See the installation guide for more details.

### System Design
- [System design context and decisions](SYSTEM_DESIGN.md)
- [Visual architecture and component diagrams](.github/modernize/assessment/engines/facts/architecture-diagram.md)

### Contribution
We Welcome contributions from the community
