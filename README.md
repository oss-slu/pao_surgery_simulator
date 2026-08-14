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
- **Database:** PostgreSQL (currently SQLite for development)
- **DB Tools:** SQLAlchemy
- **Dev Tools:** Docker, Node.js, NPM

### Getting Started
- Clone the Repository from GitHub.
- Install the requirements for React using `npm install` and for Python using `pip install -r requirements.txt` in the terminal.
- Install SQLite (later we will setup PostgreSQL).
- After installing necessary requirements run the application by using `python app.py` in the `backend` folder and `npm start` in the `frontend` folder.
- See the installation guide for more details.

### Contribution
We Welcome contributions from the community



