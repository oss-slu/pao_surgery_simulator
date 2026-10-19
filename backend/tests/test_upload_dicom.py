"""Authenticated multipart uploads obtain ownership from the session."""
from io import BytesIO
import json
from unittest.mock import patch

from models import Dicom


def metadata(client):
    return json.dumps({"session_token": client.session_token})


def test_upload_no_files_part(authenticated_client):
    response = authenticated_client.post("/api/upload_dicom", json={
        "session_token": authenticated_client.session_token})
    assert response.status_code == 400
    assert response.get_json()["error"] == "No files part"


@patch("app.read_patient_name", return_value="Test Patient")
def test_upload_without_user_id_uses_session_owner(_mock_patient, authenticated_client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.post(
            "/api/upload_dicom",
            data={"metadata": metadata(authenticated_client),
                  "files": (BytesIO(b"dummy"), "scan.dcm")},
            content_type="multipart/form-data",
        )
    assert response.status_code == 200
    with authenticated_client.session_db() as db:
        assert db.get(Dicom, response.get_json()["upload_id"]).user_id == 1


def test_upload_only_non_dcm(authenticated_client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.post(
            "/api/upload_dicom",
            data={"metadata": metadata(authenticated_client),
                  "files": (BytesIO(b"not dicom"), "notes.txt")},
            content_type="multipart/form-data",
        )
    assert response.status_code == 400
    assert response.get_json()["error"] == "No valid .dcm files uploaded"


@patch("app.read_patient_name", return_value="Test Patient")
def test_upload_valid_dcm_ignores_forged_user_id(_mock_patient, authenticated_client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.post(
            "/api/upload_dicom",
            data={"metadata": metadata(authenticated_client), "user_id": "2",
                  "files": (BytesIO(b"dummy-dicom-bytes"), "scan.dcm")},
            content_type="multipart/form-data",
        )
    assert response.status_code == 200
    data = response.get_json()
    assert data["message"] == "Files uploaded"
    assert data["patient_name"] == "Test Patient"
    assert (tmp_path / data["upload_id"] / "scan.dcm").read_bytes() == b"dummy-dicom-bytes"
    with authenticated_client.session_db() as db:
        assert db.get(Dicom, data["upload_id"]).user_id == 1
