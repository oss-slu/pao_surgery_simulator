"""Tests for GET /api/download_dicom/<upload_id> (ZIP of the upload folder)."""
from unittest.mock import patch
import zipfile
from io import BytesIO


def test_download_invalid_upload_id(client):
    response = client.get("/api/download_dicom/..")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid upload ID"


def test_download_not_found(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get("/api/download_dicom/missing-id")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Upload ID not found"


def test_download_success_zip(client, tmp_path):
    upload_id = "dl-ok"
    dicom_dir = tmp_path / upload_id
    dicom_dir.mkdir()
    (dicom_dir / "slice.dcm").write_bytes(b"dummy-dicom")

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get(f"/api/download_dicom/{upload_id}")

    assert response.status_code == 200
    assert response.mimetype == "application/zip"

    with zipfile.ZipFile(BytesIO(response.data)) as zf:
        assert "slice.dcm" in zf.namelist()
        assert zf.read("slice.dcm") == b"dummy-dicom"
