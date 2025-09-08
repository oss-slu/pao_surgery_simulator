from flask import Flask, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route("/api/hello", methods=["GET"])
def hello():
    return jsonify({"message": "Hello from Flask Backend!"})

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    return jsonify({"message": "File uploaded successfully", "filename": file.filename})

@app.route("/api/files", methods=["GET"])
def list_files():
    files = os.listdir(UPLOAD_FOLDER)
    return jsonify(files)

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Backend is running!"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
