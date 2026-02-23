import os
import uuid

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from sqlalchemy import text
from datetime import datetime
from db import connect
from werkzeug.security import check_password_hash

app = Flask(__name__)
CORS(app)

@app.route("/api/signup", methods=["POST"])
def user_signup():
    try:
        data = request.get_json()
        print("Received signup data:", data)
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

    user_name = data.get("user_name")
    user_password = data.get("user_password")

    if not user_name:
        return jsonify({"error": "Missing Username"}), 400
    
    if not user_password:
        return jsonify({"error": "Missing Password"}), 400

    with connect() as conn:
        user = conn.execute(
            text("SELECT user_id, user_password FROM users WHERE user_name = :u"),
            {"u": user_name}
        ).fetchone()

        if user is None:
            return jsonify({"error": "User not exist"}), 401

        stored_password = user[1]
        if stored_password != user_password:
            return jsonify({"error": "Wrong Password"}), 401

        return jsonify({"message": "Login successful", "user_id": user[0]}), 200

@app.route("/api/patients", methods=["POST"])
def patients_add():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing data"}), 400
    
    files = sorted(
        f for f in os.listdir(dicom_dir) if f.lower().endswith(".dcm")
    )
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
    """
    Upload one or more DICOM files. They are stored in a unique folder
    identified by upload_id, which is returned to the frontend.
    """
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
    """
    Read the uploaded DICOM series with pydicom + numpy,
    perform volume rendering off-screen, and return a PNG snapshot.
    """
    dicom_dir = os.path.join(UPLOAD_FOLDER, upload_id)
    if not os.path.exists(dicom_dir):
        return jsonify({"error": "Upload ID not found"}), 404

    try:
        volume, spacing = load_dicom_series_as_numpy(dicom_dir)
    except Exception as e:
        print("Failed to read DICOM series:", e)
        return jsonify({"error": f"Failed to read DICOM series: {e}"}), 500

    
    min_val = float(volume.min())
    max_val = float(volume.max())
    print("DICOM intensity range (numpy):", min_val, max_val)

    if max_val == min_val:
        return jsonify({"error": "DICOM volume has no intensity variation"}), 500

   
    image_data = numpy_volume_to_vtk_image(volume, spacing)

    
    low = min_val
    bg_cut = min_val + 0.2 * (max_val - min_val)
    mid = min_val + 0.6 * (max_val - min_val)
    high = max_val

    color_func = vtk.vtkColorTransferFunction()
    
    color_func.AddRGBPoint(low, 0.0, 0.0, 0.0)
    color_func.AddRGBPoint(bg_cut, 0.2, 0.2, 0.2)
    
    color_func.AddRGBPoint(mid, 0.8, 0.8, 0.8)
    color_func.AddRGBPoint(high, 1.0, 1.0, 1.0)

    opacity_func = vtk.vtkPiecewiseFunction()
    
    opacity_func.AddPoint(low, 0.0)
    opacity_func.AddPoint(bg_cut, 0.02)
    
    opacity_func.AddPoint(mid, 0.25)
    
    opacity_func.AddPoint(high, 0.9)

    volume_property = vtk.vtkVolumeProperty()
    volume_property.SetColor(color_func)
    volume_property.SetScalarOpacity(opacity_func)
    volume_property.SetInterpolationTypeToLinear()
    volume_property.ShadeOn()

    
    volume_actor = vtk.vtkVolume()
    volume_actor.SetMapper(vtk.vtkSmartVolumeMapper())
    volume_actor.GetMapper().SetInputData(image_data)
    volume_actor.SetProperty(volume_property)

    renderer = vtk.vtkRenderer()
    renderer.AddVolume(volume_actor)
    renderer.SetBackground(0.0, 0.0, 0.0)

    render_window = vtk.vtkRenderWindow()
    render_window.OffScreenRenderingOn()
    render_window.AddRenderer(renderer)
    render_window.SetSize(512, 512)

    renderer.ResetCamera()
    camera = renderer.GetActiveCamera()
    camera.SetViewUp(0, 0, -1)
    camera.SetPosition(0, -1, 0)
    renderer.ResetCameraClippingRange()

    render_window.Render()

    
    w2i = vtk.vtkWindowToImageFilter()
    w2i.SetInput(render_window)
    w2i.Update()

    vtk_image = w2i.GetOutput()
    width, height, _ = vtk_image.GetDimensions()
    vtk_array = vtk_image.GetPointData().GetScalars()
    np_image = numpy_support.vtk_to_numpy(vtk_array)

    
    np_image = np_image.reshape(height, width, -1)

    max_val_img = np_image.max() if np_image.max() != 0 else 1
    np_image = (np_image / max_val_img * 255).astype("uint8")

    output_path = os.path.join(dicom_dir, "render.png")
    img = Image.fromarray(np_image)
    img.save(output_path)

    return send_file(output_path, mimetype="image/png")


@app.route("/api/login", methods=["POST"])
def login():
    """
    Very simple mock login.
    username: admin
    password: admin
    """
    data = request.get_json() or {}
    username = data.get("username")
    password = data.get("password")

    if username == "admin" and password == "admin":
        return jsonify({"message": "Login successful"}), 200
    else:
        return jsonify({"error": "Invalid username or password"}), 401


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Resource not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
# Adding ping route on Mon Feb 23 10:50:28 AM CST 2026
