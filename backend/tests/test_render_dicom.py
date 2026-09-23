"""Tests for GET /api/render_dicom/<upload_id> (returns volume.vti bytes).

Success path mocks DICOM load + VTK writer so no real VTK/DICOM is required.
"""
from unittest.mock import patch, MagicMock

import numpy as np


def test_render_invalid_upload_id(client):
    response = client.get("/api/render_dicom/..")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid upload ID"


def test_render_unknown_upload_id(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get("/api/render_dicom/missing-upload-id")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Upload ID not found"


@patch("app.numpy_volume_to_vtk_image")
@patch("app.load_dicom_series_as_numpy")
@patch("app.vtk")
def test_render_success(mock_vtk, mock_load, mock_to_vtk, client, tmp_path):
    upload_id = "abc123"
    dicom_dir = tmp_path / upload_id
    dicom_dir.mkdir()

    volume = np.zeros((2, 4, 4), dtype=np.float32)
    spacing = (1.0, 1.0, 1.0)
    mock_load.return_value = (volume, spacing)
    mock_to_vtk.return_value = MagicMock()

    # Route writes volume.vti then send_from_directory; create the file on Write().
    def _write_vti():
        (dicom_dir / "volume.vti").write_bytes(b"fake-vti")

    writer = MagicMock()
    writer.Write.side_effect = _write_vti
    mock_vtk.vtkXMLImageDataWriter.return_value = writer

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get(f"/api/render_dicom/{upload_id}")

    assert response.status_code == 200
    assert response.mimetype == "application/octet-stream"
    assert response.data == b"fake-vti"
