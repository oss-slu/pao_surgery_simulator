from flask import Flask, request, jsonify
from flask_cors import CORS
from config import config
import psycopg2

app = Flask(__name__)
CORS(app)

def get_connection():
    params = config()
    conn = psycopg2.connect(**params)
    return conn

@app.route("/api/patients", methods=["POST"])
def patients_add():
    data = request.get_json()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO patients \
        (patient_name, patient_age) VALUES (%s, %s)
        RETURNING patient_id;""",
        (data["patient_name"], data["patient_age"]))
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"message": "New Patient", "id": new_id})

@app.route("/api/patients", methods=["GET"])
def patients_get():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT patient_id, patient_name, patient_age, date FROM patients;")
    row = cur.fetchall()
    cur.close()
    conn.close()
    patients = []
    for attribute in row:
        patients.append({
            "patient_id": attribute[0],
            "patient_name": attribute[1],
            "patient_age": attribute[2],
            "date": attribute[3].strftime("%Y-%m-%d %H:%M:%S")})
    return jsonify(patients)

@app.route("/api/images", methods=["POST"])
def images_add():
    data = request.get_json()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO images \
        (patient_id, file_name, file_type) VALUES (%s, %s, %s)
        RETURNING image_id""",
        (data["patient_id"], data["file_name"], data["file_type"]))
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({"message": "New Image", "id": new_id})

@app.route("/api/images", methods=["GET"])
def images_get():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT image_id, patient_id, file_name, file_type, upload_date FROM images;")
    row = cur.fetchall()
    cur.close()
    conn.close()
    images = []
    for attribute in row:
        images.append({
            "image_id": attribute[0],
            "patient_id": attribute[1],
            "file_name": attribute[2],
            "file_type": attribute[3],
            "upload_date": attribute[4].strftime("%Y-%m-%d %H:%M:%S")})
    return jsonify(images)

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Flask backend connected to PostgreSQL successfully!"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
