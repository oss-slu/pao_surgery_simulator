from unittest.mock import patch, MagicMock

import numpy as np


def test_metadata_invalid_upload_id(client):
    response = client.get("/api/render_dicom/../metadata")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid upload ID"


def test_metadata_upload_not_found(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get("/api/render_dicom/missing-id/metadata")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Upload ID not found"


def test_metadata_no_dcm_files(client, tmp_path):
    upload_id = "empty-series"
    (tmp_path / upload_id).mkdir()

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get(f"/api/render_dicom/{upload_id}/metadata")

    assert response.status_code == 404
    assert response.get_json()["error"] == "No DICOM files found"


def _mock_dataset():
    ds = MagicMock()
    ds.Rows = 64
    ds.Columns = 128
    ds.PixelSpacing = [0.5, 0.5]
    ds.SliceThickness = 1.0
    ds.SpacingBetweenSlices = 1.0
    ds.PatientName = "Doe^Jane"
    ds.PatientID = "P001"
    ds.PatientBirthDate = "19900101"
    ds.PatientSex = "F"
    ds.StudyDate = "20240101"
    ds.StudyTime = "120000"
    ds.StudyDescription = "Hip CT"
    ds.SeriesDescription = "Series 1"
    ds.SeriesNumber = "1"
    ds.Modality = "CT"
    ds.WindowCenter = "40"
    ds.WindowWidth = "400"
    ds.RescaleSlope = "1"
    ds.RescaleIntercept = "0"
    ds.pixel_array = np.zeros((64, 128), dtype=np.int16)
    return ds


@patch("app.pydicom.dcmread")
def test_metadata_success(mock_dcmread, client, tmp_path):
    upload_id = "meta-ok"
    dicom_dir = tmp_path / upload_id
    dicom_dir.mkdir()
    (dicom_dir / "slice.dcm").write_bytes(b"fake")

    mock_dcmread.return_value = _mock_dataset()

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get(f"/api/render_dicom/{upload_id}/metadata")

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "success"
    assert body["data"]["physical_dimensions"]["columns"] == 128
    assert body["data"]["physical_dimensions"]["rows"] == 64
    assert body["data"]["patient_info"]["name"] == "Doe^Jane"


@patch("app.pydicom.dcmread", side_effect=RuntimeError("bad dicom"))
def test_metadata_error(mock_dcmread, client, tmp_path):
    upload_id = "meta-err"
    dicom_dir = tmp_path / upload_id
    dicom_dir.mkdir()
    (dicom_dir / "slice.dcm").write_bytes(b"fake")

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get(f"/api/render_dicom/{upload_id}/metadata")

    assert response.status_code == 500
    assert "Failed to extract metadata" in response.get_json()["error"]
