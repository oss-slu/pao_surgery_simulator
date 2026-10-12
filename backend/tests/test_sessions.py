"""Tests for GET /api/sessions.

"Sessions" here means upload subdirectories under UPLOAD_FOLDER, not login sessions.
"""
from unittest.mock import MagicMock, patch

from models import Dicom


def test_sessions_missing_uploads_dir(authenticated_client, tmp_path):
    missing = tmp_path / "does_not_exist"
    with patch("app.UPLOAD_FOLDER", str(missing)):
        response = authenticated_client.get("/api/sessions")

    assert response.status_code == 200
    assert response.get_json() == {"sessions": []}


def test_sessions_empty_uploads_dir(authenticated_client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.get("/api/sessions")

    assert response.status_code == 200
    assert response.get_json() == {"sessions": []}


@patch("app.connect")
def test_sessions_lists_owned_upload_directories(mock_connect, authenticated_client, tmp_path):
    (tmp_path / "session-a").mkdir()
    (tmp_path / "session-b").mkdir()
    (tmp_path / "not-a-dir.txt").write_text("ignore me")
    db = MagicMock()
    db.query.return_value.filter_by.return_value.all.return_value = [
        Dicom(upload_id="session-a", user_id=1),
        Dicom(upload_id="session-b", user_id=1),
    ]
    mock_connect.return_value.__enter__.return_value = db

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.get("/api/sessions")

    assert response.status_code == 200
    sessions = response.get_json()["sessions"]
    assert sorted(sessions) == ["session-a", "session-b"]
