import pytest
from unittest.mock import patch, MagicMock
from app import app
from werkzeug.security import generate_password_hash

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

@patch("app.connect")
def test_login_success(mock_connect, client):
    # 1. Fake user (what the DB would return)
    mock_user = MagicMock()
    mock_user.user_id = 1
    mock_user.user_name = "testuser"
    mock_user.user_password = generate_password_hash("password123")
    # 2. Fake database session
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = mock_user
    mock_connect.return_value.__enter__.return_value = mock_db
    # 3. Send login request
    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "password123",
    })
    # 4. Check the response
    assert response.status_code == 200
    assert response.get_json()["user_id"] == 1


@patch("app.connect")
def test_login_wrong_password(mock_connect, client):
    mock_user = MagicMock()
    mock_user.user_id = 1
    mock_user.user_name = "testuser"
    mock_user.user_password = generate_password_hash("password123")

    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = mock_user
    mock_connect.return_value.__enter__.return_value = mock_db

    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "wrongpassword123",
    })

    assert response.status_code == 401
    assert response.get_json()["error"] == "Invalid password"