import os
import uuid
import pydicom 
import numpy as np 
import vtk 
from vtkmodules.util import numpy_support 
from PIL import Image 
from werkzeug.utils import secure_filename 

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from sqlalchemy import text
from db import connect

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() == 'dcm'

@app.route("/api/signup", methods=["POST"])
def user_signup():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
    
        user_name = data.get("user_name")
        if not isinstance(user_name, str) or not user_name.strip():
            return jsonify({"error": "Invalid username"}), 400
        
        user_email = data.get("user_email")
        if not isinstance(user_email, str) or "@" not in user_email:
            return jsonify({"error": "Invalid email"}), 400
        
        user_organization = data.get("user_organization") or ""
        
        user_password = data.get("user_password")
        if not isinstance(user_password, str) or len(user_password) < 6 or len(user_password) > 255:
            return jsonify({"error": "Invalid password"}), 400

        with connect() as conn:
            existing_user = conn.execute(
                text("SELECT user_id FROM users WHERE user_name = :username"), {"username": user_name}).fetchone()
            if existing_user:
                return jsonify({"error": "Username has been used"}), 400
            
            existing_email = conn.execute(
                text("SELECT user_id FROM users WHERE user_email = :email"), {"email": user_email}).fetchone()
            if existing_email:
                return jsonify({"error": "Email has been used"}), 400

            user_account = conn.execute(
                text("""INSERT INTO users
                (user_name, user_email, user_organization, user_password) VALUES (:username, :email, :organization, :password)
                RETURNING user_id;"""),
                {"username": user_name, "email": user_email, "organization": user_organization, "password": user_password})
            new_id = user_account.fetchone()[0]
            conn.commit()
            return jsonify({"message": "User Account", "id": new_id}), 201
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/login", methods=["POST"])
def user_login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing data"}), 400
    
    user_name = data.get("user_name") or data.get("username")
    user_password = data.get("user_password") or data.get("password")

    if not user_name:
        return jsonify({"error": "Missing Username"}), 400
    
    if not user_password:
        return jsonify({"error": "Missing Password"}), 400

    if user_name == "admin" and user_password == "admin":
        return jsonify({"message": "Login successful", "user_id": 1}), 200
    
    return jsonify({"error": "Invalid credentials"}), 401

def load_dicom_series_as_numpy(dicom_dir):
    """Loads a directory of DICOM files into a 3D numpy array."""
    files = sorted(f for f in os.listdir(dicom_dir) if f.lower().endswith(".dcm"))
    if not files:
        raise RuntimeError("No .dcm files found in directory")

    volume_slices = []
    spacing = (1.0, 1.0, 1.0) 

    for idx, fname in enumerate(files):
        path = os.path.join(dicom_dir, fname)
        ds = pydicom.dcmread(path)

        if not hasattr(ds, "pixel_array"):
            raise RuntimeError(f"DICOM file has no pixel data: {fname}")

        arr = ds.pixel_array.astype(np.float32)
        
        slope = float(getattr(ds, "RescaleSlope", 1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept

        volume_slices.append(arr)
        
        if idx == 0:
            pixel_spacing = getattr(ds, "PixelSpacing", [1.0, 1.0])
            sx = float(pixel_spacing[1])
            sy = float(pixel_spacing[0])
            sz = float(getattr(ds, "SliceThickness", 1.0))
            spacing = (sx, sy, sz)
    
    volume = np.stack(volume_slices, axis=0)  
    return volume, spacing

def numpy_volume_to_vtk_image(volume: np.ndarray, spacing):
    """Convert a 3D numpy volume (Z, Y, X) to vtkImageData."""
    num_slices, rows, cols = volume.shape

    image_data = vtk.vtkImageData()
    image_data.SetDimensions(int(cols), int(rows), int(num_slices))
    image_data.SetSpacing(float(spacing[0]), float(spacing[1]), float(spacing[2]))

    flat = volume.ravel(order="C")
    vtk_array = numpy_support.numpy_to_vtk(
        flat, deep=True, array_type=vtk.VTK_FLOAT
    )
    vtk_array.SetName("Scalars")
    image_data.GetPointData().SetScalars(vtk_array)

    return image_data

@app.route("/api/upload_dicom", methods=["POST"])
def upload_dicom():
    if "files" not in request.files:
        return jsonify({"error": "No files part"}), 400

    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded"}), 400

    upload_id = str(uuid.uuid4())
    upload_path = os.path.join(UPLOAD_FOLDER, upload_id)
    os.makedirs(upload_path, exist_ok=True)

    saved_any = False
    for f in files:
        if f and allowed_file(f.filename):
            filename = secure_filename(f.filename)
            f.save(os.path.join(upload_path, filename))
            saved_any = True

    if not saved_any:
        return jsonify({"error": "No valid .dcm files uploaded"}), 400

    return jsonify({"message": "Files uploaded", "upload_id": upload_id}), 200

@app.route("/api/render_dicom/<upload_id>", methods=["GET"])
def render_dicom(upload_id):
    # 1. Sanitize the user input
    safe_upload_id = secure_filename(upload_id)
    if not safe_upload_id:
        return jsonify({"error": "Invalid upload ID"}), 400

    # 2. Build the absolute base directory path securely
    base_uploads = os.path.abspath(UPLOAD_FOLDER)
    dicom_dir = os.path.abspath(os.path.join(base_uploads, safe_upload_id))

    # 3. Strict Boundary Check: Proves to CodeQL the path cannot escape the uploads folder
    if not dicom_dir.startswith(base_uploads):
        return jsonify({"error": "Path traversal attempt detected"}), 403

    if not os.path.exists(dicom_dir):
        return jsonify({"error": "Upload ID not found"}), 404

    try:
        volume, spacing = load_dicom_series_as_numpy(dicom_dir)
    except Exception as e:
        print("Failed to read DICOM series:", e)
        return jsonify({"error": f"Failed to read DICOM series: {e}"}), 500
    
    image_data = numpy_volume_to_vtk_image(volume, spacing)
    
    output_filename = "volume.vti"
    output_path = os.path.join(dicom_dir, output_filename)
    
    writer = vtk.vtkXMLImageDataWriter()
    writer.SetFileName(output_path)
    writer.SetInputData(image_data)
    writer.Write()

    # 4. Use Flask's safe send_from_directory instead of send_file
    return send_from_directory(dicom_dir, output_filename, mimetype="application/octet-stream")

@app.route("/api/render_dicom/<upload_id>/metadata", methods=["GET"])
def render_dicom_metadata(upload_id):
    """Extract physical dimensions and metadata from the DICOM series."""

    safe_upload_id = secure_filename(upload_id)
    if not safe_upload_id:
        return jsonify({"error": "Invalid upload ID"}), 400
    
    base_uploads = os.path.abspath(UPLOAD_FOLDER)
    dicom_dir = os.path.abspath(os.path.join(base_uploads, safe_upload_id))

    if not dicom_dir.startswith(base_uploads):
        return jsonify({"error": "Path traversal attempt detected"}), 403
    
    if not os.path.exists(dicom_dir):
        return jsonify({"error": "Upload ID not found"}), 404
    
    dicom_files = [f for f in os.listdir(dicom_dir) if f.lower().endswith(".dcm")]

    if not dicom_files:
        return jsonify({"error": "No DICOM files found"}), 404
    
    try:
        first_dicom = os.path.join(dicom_dir, dicom_files[0])
        ds = pydicom.dcmread(first_dicom)

        rows = int(ds.Rows) if hasattr(ds, "Rows") else None
        cols = int(ds.Columns) if hasattr(ds, "Columns") else None

        pixel_spacing = getattr(ds, "PixelSpacing", [None, None])
        slice_thickness = getattr(ds, "SliceThickness", None)

        spacing_between_slices = None
        if hasattr(ds, "SpacingBetweenSlices"):
            spacing_between_slices = float(ds.SpacingBetweenSlices)

         # Patient Info 
        patient_name = str(ds.PatientName) if hasattr(ds, "PatientName") else None
        patient_id = str(ds.PatientID) if hasattr(ds, "PatientID") else None
        patient_birth_date = str(ds.PatientBirthDate) if hasattr(ds, "PatientBirthDate") else None
        patient_sex = str(ds.PatientSex) if hasattr(ds, "PatientSex") else None

        # Study Info
        study_date = str(ds.StudyDate) if hasattr(ds, "StudyDate") else None
        study_time = str(ds.StudyTime) if hasattr(ds, "StudyTime") else None
        study_description = str(ds.StudyDescription) if hasattr(ds, "StudyDescription") else None

        #Series Info
        series_description = str(ds.SeriesDescription) if hasattr(ds, "SeriesDescription") else None
        series_number = str(ds.SeriesNumber) if hasattr(ds, "SeriesNumber") else None
        modality = str(ds.Modality) if hasattr(ds, "Modality") else None
        window_center = str(ds.WindowCenter) if hasattr(ds, "WindowCenter") else None
        window_width = str(ds.WindowWidth) if hasattr(ds, "WindowWidth") else None
        rescale_slope = str(ds.RescaleSlope) if hasattr(ds, "RescaleSlope") else None
        rescale_intercept = str(ds.RescaleIntercept) if hasattr(ds, "RescaleIntercept") else None

        # Volume Dimensions
        volume_depth = len(dicom_files)
        if slice_thickness:
            physical_depth = volume_depth * slice_thickness
        else:
            physical_depth = None


        # First Slice Intensity Range
        pixel_array = ds.pixel_array
        intensity_min = float(np.min(pixel_array))
        intensity_max = float(np.max(pixel_array))
        
        metadata = {
            "upload_id": upload_id,
            "physical_dimensions": {
                "rows": rows,
                "columns": columns,
                "pixel_spacing_mm": pixel_spacing,
                "slice_thickness_mm": slice_thickness,
                "spacing_between_slices_mm": spacing_between_slices,
                "number_of_slices": volume_depth,
                "physical_height_mm": rows * pixel_spacing[1] if pixel_spacing and rows and len(pixel_spacing) > 1 and pixel_spacing[1] else None,
                "physical_width_mm": columns * pixel_spacing[0] if pixel_spacing and columns and len(pixel_spacing) > 0 and pixel_spacing[0] else None,
                "physical_depth_mm": physical_depth
            },
            "patient_info": {
                "name": patient_name,
                "id": patient_id,
                "birth_date": patient_birth_date,
                "sex": patient_sex
            },
            "study_info": {
                "date": study_date,
                "time": study_time,
                "description": study_description
            },
            "series_info": {
                "description": series_description,
                "number": series_number,
                "modality": modality,
                "total_files": len(dicom_files)
            },
            "image_processing": {
                "window_center": window_center,
                "window_width": window_width,
                "rescale_slope": rescale_slope,
                "rescale_intercept": rescale_intercept,
                "intensity_range": {
                    "min": intensity_min,
                    "max": intensity_max
                }
            }
        }
        
        return jsonify({"status": "success", "data": metadata}), 200
        
    except Exception as e:
        print("Error extracting DICOM metadata:", e)
        return jsonify({"error": f"Failed to extract metadata: {str(e)}"}), 500



@app.route("/api/download_dicom/<upload_id>", methods=["GET"])
def download_dicom(upload_id):
    safe_upload_id = secure_filename(upload_id)
    if not safe_upload_id:
        return jsonify({"error": "Invalid upload ID"}), 400

    base_uploads = os.path.abspath(UPLOAD_FOLDER)
    dicom_dir = os.path.abspath(os.path.join(base_uploads, safe_upload_id))

    if not dicom_dir.startswith(base_uploads):
        return jsonify({"error": "Path traversal attempt detected"}), 403

    if not os.path.exists(dicom_dir):
        return jsonify({"error": "Upload ID not found"}), 404

    try:
        zip_filename = f"{safe_upload_id}.zip"
        zip_path = os.path.join(base_uploads, zip_filename)

        import zipfile
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, _, files in os.walk(dicom_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, dicom_dir)
                    zipf.write(file_path, arcname)

        return send_file(zip_path, mimetype="application/zip", as_attachment=True, download_name=zip_filename)
    
    except Exception as e:
        print("Failed to create ZIP archive:", e)
        return jsonify({"error": f"Failed to create ZIP archive: {e}"}), 500
    
@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Resource not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)

