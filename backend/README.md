Step for setup the database:
    1. Open PostgreSQL by entering "psql -U postgres" in terminal, the password is "0610"
    2. Connect to the database with "\c userdb", then "\q" to exit
    3. Run the models.py with "python models.py", this is table creation script: two tables will be create ("patients" and "images")
    4. Reopen the PostgreSQL and connect to the database, use "\dt" to show the tables, and "\d patients" or "\d images" will show the complete table with attributes

Run and test the Flask API Endpoints:
    1. Run with "python app.py"
    2. Copy the link "http://127.0.0.1:5000" to Postman
    3. Add "/api/patients" to the link to test patients table; add "/api/images" to the link to test images table
    4. Set the method to POST first, and in the Body, choose "row", then enter an example with the format: {
                    "attribute_1": "input_data_1"
                    "attribute_2": "input_data_2"
                    ...
                }
    for example:{
                    "patient_name": "Zhihui Wu",
                    "patient_age": 25
                }
    The output will be something like: 
                {
                    "id": 2,
                    "message": "New Patient"
                }
    5. Change the method to GET, then send again, the output will be something like: 
                {
                    "date": "2025-10-10 01:15:12",
                    "patient_age": 25,
                    "patient_id": 2,
                    "patient_name": "Zhihui Wu"
                }
    6.Same steps for the images test