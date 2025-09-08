# Installation Guide for Surgery Simulator

## Prerequisites:

Before we start working on the project, We must ensure weather our system has the following software installed.

- **Python:** The backend of our project is developed using `Python`. Download and install the latest version of pyrhon from the official website. https://www.python.org/downloads/.

- **Node.js & NPM:** The frontend of our application is based on React, which requires `Node.js` and `npm` for the application and run the application locally. So need to download and install Node.js from the official website. After installing it will automatically install npm automatically. https://nodejs.org/en/download/.

- **PostgreSQL:** Our Application will use `PostgrSQL` for the database. Download and install PostgreSQL from the official website. https://www.postgresql.org/download/.

- **SQLite:** Initially we will be working with `SQLite`. Download and install SQLite from the official website. https://sqlite.org/download.html.

## Installation Steps

- Clone the Repository using <code>git clone https://github.com/oss-slu/pao_surgery_simulator</code>
- Create a new branch using <code> git branch username-patch number</code>

- Navigate to the repository using <code>cd pao_surgery_simulator</code>

### Backend Setup

- Navigate to the backend directory using <code>cd backend</code>

- In the file `backend` run the necessary Python dependency by running <code>pip install -r requirements.txt</code>

- Run the backend server using <code>python app.py</code>

### Frontend Setup

 - Navigate to the frontend directory using <code>cd frontend</code>

 - In the file `frontend` run the required dependencies using <code>npm install</code>
 
 - Run the development server using <code>npm start</code>

### Running the Application 

- Start the backend server by navigating to the backend folder <code>cd Backend</code> and running <code>python app.py</code>  

- In a separate terminal, navigate to the frontend folder <code>cd Frontend</code> and run <code>npm start</code>

- The application should now be running on localhost with the frontend accessible via your web browser.