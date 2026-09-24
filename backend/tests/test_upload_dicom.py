"""Tests for POST /api/upload_dicom (multipart .dcm + form user_id).

Patch UPLOAD_FOLDER to tmp_path so files never land in the real uploads dir.
"""
from io import BytesIO
from unittest.mock import patch, MagicMock


def _mock_db(mock_connect):
    """Minimal connect() session so Dicom row insert can succeed."""
    mock_db = MagicMock()
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


def test_upload_no_files_part(client):
    response = client.post("/api/upload_dicom", data={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "No files part"


def test_upload_missing_user_id(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.post(
            "/api/upload_dicom",
            data={"files": (BytesIO(b"dummy"), "scan.dcm")},
            content_type="multipart/form-data",
        )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing user id"


def test_upload_only_non_dcm(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.post(
            "/api/upload_dicom",
            data={
                "user_id": "1",
                "files": (BytesIO(b"not dicom"), "notes.txt"),
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 400
    assert response.get_json()["error"] == "No valid .dcm files uploaded"


@patch("app.read_patient_name", return_value="Test Patient")
@patch("app.connect")
def test_upload_valid_dcm(mock_connect, _mock_patient, client, tmp_path):
    # Bytes need not be real DICOM; extension .dcm is what the route checks.
    _mock_db(mock_connect)

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.post(
            "/api/upload_dicom",
            data={
                "user_id": "1",
                "files": (BytesIO(b"dummy-dicom-bytes"), "scan.dcm"),
            },
            content_type="multipart/form-data",
        )

    assert response.status_code == 200
    data = response.get_json()
    assert data["message"] == "Files uploaded"
    assert "upload_id" in data
    assert data["patient_name"] == "Test Patient"
