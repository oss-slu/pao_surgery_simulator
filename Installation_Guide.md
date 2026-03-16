# Installation Guide for Surgery Simulator

## Prerequisites:

Before we start working on the project, we must ensure whether our system has the following software installed.

- **Python:** The backend of our project is developed using `Python`. Download and install the latest version of Python from the official website: https://www.python.org/downloads/.

- **Node.js & NPM:** The frontend of our application is based on React, which requires `Node.js` and `npm` to run the application locally. Download and install Node.js from the official website (this will install npm automatically): https://nodejs.org/en/download/.

- **PostgreSQL:** Our application will use `PostgreSQL` for the production database. Download and install PostgreSQL from the official website: https://www.postgresql.org/download/.

- **SQLite:** Initially, we will be working with `SQLite` for local development. Download and install SQLite from the official website: https://sqlite.org/download.html.

## Installation Steps

- Clone the Repository using <code>git clone https://github.com/oss-slu/pao_surgery_simulator.git</code>

- Navigate to the repository using <code>cd pao_surgery_simulator</code>

- Create and switch to a new branch using <code>git checkout -b username/patch-name</code>

### Backend Setup

- Navigate to the backend directory using <code>cd backend</code>

- Create a virtual environment to isolate project dependencies using <code>python -m venv venv</code>

- Activate the virtual environment:
  - On Mac/Linux: <code>source venv/bin/activate</code>
  - On Windows: <code>venv\Scripts\activate</code>

- Install the necessary Python dependencies by running <code>pip install -r requirements.txt</code>

### Frontend Setup

- Open a new terminal and navigate to the frontend directory using <code>cd frontend</code>

- Install the required dependencies using <code>npm install</code>

### Running the Application 

- Start the backend server by navigating to the backend folder (ensure your virtual environment is activated) and running <code>python app.py</code>  

- In a separate terminal, navigate to the frontend folder and run <code>npm start</code>

- The application should now be running on localhost with the frontend accessible via your web browser.
