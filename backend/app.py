from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import text
from datetime import datetime
from db import connect

app = Flask(__name__)
CORS(app)

@app.route("/api/signup", methods=["POST"])
def user_signup():
    try:
        data = request.get_json()
        print("Received signup data:", data)
        if not data:
            return jsonify({"error": "Missing data"}), 400
    
        user_name = data.get("username")
        if not isinstance(user_name, str) or not user_name.strip():
            return jsonify({"error": "Invalid username"}), 400
        
        user_email = data.get("email")
        if not isinstance(user_email, str) or "@" not in user_email:
            return jsonify({"error": "Invalid email"}), 400
        
        user_birthdate = data.get("birthdate")
        try:
            user_birthdate = datetime.strptime(user_birthdate, "%Y-%m-%d").date()
        except Exception:
            return jsonify({"error": "Invalid birthdate format. Use YYYY-MM-DD"}), 400
        
        user_password = data.get("password")
        if not isinstance(user_password, str) or len(user_password) < 6 or len(user_password) > 255:
            return jsonify({"error": "Invalid password"}), 400

        with connect() as conn:
            user_account = conn.execute(
                text("""INSERT INTO users
                (user_name, user_email, user_birthdate, user_password) VALUES (:username, :email, :birthdate, :password)
                RETURNING user_id;"""),
                {"username": user_name, "email": user_email, "birthdate": user_birthdate, "password": user_password})
            new_id = user_account.fetchone()[0]
            conn.commit()
            return jsonify({"message": "User Account", "id": new_id}), 201
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/patients", methods=["POST"])
def patients_add():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
    
        patient_name = data.get("patient_name")
        if not isinstance(patient_name, str) or not patient_name.strip():
            return jsonify({"error": "Invalid name"}), 400
        
        patient_age = data.get("patient_age")
        if not isinstance(patient_age, int) or patient_age <=0:
            return jsonify({"error": "Invalid age"}), 400

        with connect() as conn:
            patient_data = conn.execute(
                text("""INSERT INTO patients
                (patient_name, patient_age) VALUES (:name, :age)
                RETURNING patient_id;"""),
                {"name": data["patient_name"], "age": data["patient_age"]})
            new_id = patient_data.fetchone()[0]
            conn.commit()
            return jsonify({"message": "New Patient", "id": new_id}), 201
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/patients/<int:pid>', methods=['PUT'])
def patient_update(pid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
    
        patient_name = data.get("patient_name")
        if not isinstance(patient_name, str) or not patient_name.strip():
            return jsonify({"error": "Invalid name"}), 400
        
        patient_age = data.get("patient_age")
        if not isinstance(patient_age, int) or patient_age <=0:
            return jsonify({"error": "Invalid age"}), 400

        with connect() as conn:
            patient_data = conn.execute(
                text("""UPDATE patients 
                    SET patient_name = :name, patient_age = :age WHERE patient_id = :pid
                    RETURNING patient_id;"""),
                    {"name": data["patient_name"], "age": data["patient_age"], "pid": pid})
            update_id = patient_data.fetchone()[0]
            conn.commit()
            if update_id:
                return jsonify({"message": "Update Patient", "id": update_id}), 200
            else:
                return jsonify({"error": f"Patient {pid} not found."}), 404
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/patients", methods=["DELETE"])
def patients_delete():
    try:
        data = request.get_json()
        pid = data.get("patient_id")
        if not pid:
            return jsonify({"error": "Not patient id"}), 400
        if not isinstance(pid, int) or pid <= 0:
            return jsonify({"error": "Invalid patient id"}), 400
    
        with connect() as conn:
            result = conn.execute(
                text("""DELETE FROM patients WHERE patient_id = :pid RETURNING patient_id;"""),
                {"pid": pid})
            deleted = result.fetchone()
            conn.commit()
        
        if deleted:
            return jsonify({"message": f"Patient {pid} deleted successfully."}), 200
        else:
            return jsonify({"error": f"Patient {pid} not found"}), 404
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/patients", methods=["GET"])
def patients_get():
    try:
        with connect() as conn:
            patient_list = conn.execute(text("SELECT patient_id, patient_name, patient_age, date FROM patients;"))
            patients = []
            for attribute in patient_list:
                patients.append({
                    "patient_id": attribute[0],
                    "patient_name": attribute[1],
                    "patient_age": attribute[2],
                    "date": attribute[3].strftime("%Y-%m-%d %H:%M:%S") if attribute[3] else None})
        return jsonify(patients), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/images", methods=["POST"])
def images_add():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
        
        patient_id = data.get("patient_id")
        if not isinstance(patient_id, int) or patient_id <= 0:
            return jsonify({"error": "Invalid patient id"}), 400
        
        file_name = data.get("file_name")
        if not isinstance(file_name, str) or not file_name.strip():
            return jsonify({"error": "Invalid file name"}), 400
        
        file_type = data.get("file_type")
        if not isinstance(file_type, str) or not file_type.strip():
            return jsonify({"error": "Invalid file type"}), 400
        
        allowed_types = ["jpg", "jpeg", "png", "gif", "webp"]
        if file_type and file_type.lower() not in allowed_types:
            return jsonify({"error": "Unsupported file type"}), 400

        with connect() as conn:
            image_data = conn.execute(
                text("""INSERT INTO images 
                (patient_id, file_name, file_type) VALUES (:pid, :fname, :ftype)
                RETURNING image_id"""),
                {"pid": data["patient_id"], "fname": data["file_name"], "ftype": data["file_type"]})
            new_id = image_data.fetchone()[0]
            conn.commit()
            return jsonify({"message": "New Image", "id": new_id}), 201
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/images/<int:fid>', methods=['PUT'])
def image_update(fid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
        
        patient_id = data.get("patient_id")
        if not isinstance(patient_id, int) or patient_id <= 0:
            return jsonify({"error": "Invalid patient id"}), 400
        
        file_name = data.get("file_name")
        if not isinstance(file_name, str) or not file_name.strip():
            return jsonify({"error": "Invalid file name"}), 400
        
        file_type = data.get("file_type")
        if not isinstance(file_type, str) or not file_type.strip():
            return jsonify({"error": "Invalid file type"}), 400
        
        allowed_types = ["jpg", "jpeg", "png", "gif", "webp"]
        if file_type and file_type.lower() not in allowed_types:
            return jsonify({"error": "Unsupported file type"}), 400

        with connect() as conn:
            image_data = conn.execute(
                text("""UPDATE images 
                    SET patient_id = :pid, file_name = :fname, file_type = :ftype WHERE image_id = :fid
                    RETURNING image_id;"""),
                    {"pid": data["patient_id"], "fname": data["file_name"], "ftype": data["file_type"], "fid": fid})
            update_id = image_data.fetchone()[0]
            conn.commit()
            if update_id:
                return jsonify({"message": "Update Image", "id": update_id}), 200
            else:
                return jsonify({"error": f"Image {fid} not found."}), 404
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route("/api/images", methods=["DELETE"])
def images_delete():
    try:
        data = request.get_json()
        fid = data.get("image_id")
        if not fid:
            return jsonify({"error": "Not image id"}), 400
        if not isinstance(fid, int) or fid <= 0:
            return jsonify({"error": "Invalid file id"}), 400
    
        with connect() as conn:
            result = conn.execute(
                text("""DELETE FROM images WHERE image_id = :fid RETURNING image_id;"""),
                {"fid": fid})
            deleted = result.fetchone()
            conn.commit()
        
        if deleted:
            return jsonify({"message": f"Image {fid} deleted successfully."}), 200
        else:
            return jsonify({"error": f"Image {fid} not found"}), 404
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/images", methods=["GET"])
def images_get():
    try:
        with connect() as conn:
            image_list = conn.execute(text("SELECT image_id, patient_id, file_name, file_type, upload_date FROM images;"))
            images = []
            for attribute in image_list:
                images.append({
                    "image_id": attribute[0],
                    "patient_id": attribute[1],
                    "file_name": attribute[2],
                    "file_type": attribute[3],
                    "upload_date": attribute[4].strftime("%Y-%m-%d %H:%M:%S") if attribute[4] else None})
        return jsonify(images), 200
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Flask backend connected to PostgreSQL successfully!"})

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Resource not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
