"""Tests for GET /api/sessions.

"Sessions" here means upload subdirectories under UPLOAD_FOLDER, not login sessions.
"""
from unittest.mock import patch


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


def test_sessions_lists_only_owned_subdirectories(authenticated_client, tmp_path):
    for upload_id in ("session-a", "session-b", "foreign", "unregistered"):
        (tmp_path / upload_id).mkdir()
    (tmp_path / "not-a-dir.txt").write_text("ignore me")
    authenticated_client.add_scan("session-a")
    authenticated_client.add_scan("session-b")
    authenticated_client.add_scan("foreign", user_id=2)
    authenticated_client.add_scan("missing-directory")
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = authenticated_client.get("/api/sessions")
    assert response.status_code == 200
    assert sorted(response.get_json()["sessions"]) == ["session-a", "session-b"]
