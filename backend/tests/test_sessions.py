from unittest.mock import patch


def test_sessions_missing_uploads_dir(client, tmp_path):
    missing = tmp_path / "does_not_exist"
    with patch("app.UPLOAD_FOLDER", str(missing)):
        response = client.get("/api/sessions")

    assert response.status_code == 200
    assert response.get_json() == {"sessions": []}


def test_sessions_empty_uploads_dir(client, tmp_path):
    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get("/api/sessions")

    assert response.status_code == 200
    assert response.get_json() == {"sessions": []}


def test_sessions_lists_subdirectories(client, tmp_path):
    (tmp_path / "session-a").mkdir()
    (tmp_path / "session-b").mkdir()
    (tmp_path / "not-a-dir.txt").write_text("ignore me")

    with patch("app.UPLOAD_FOLDER", str(tmp_path)):
        response = client.get("/api/sessions")

    assert response.status_code == 200
    sessions = response.get_json()["sessions"]
    assert sorted(sessions) == ["session-a", "session-b"]
