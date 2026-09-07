import pytest
from unittest.mock import patch, MagicMock
from app import app
from werkzeug.security import generate_password_hash


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def _mock_db_with_user(mock_connect, user=None):
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = user
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


def _make_user(user_id=1, user_name="testuser", password="password123"):
    mock_user = MagicMock()
    mock_user.user_id = user_id
    mock_user.user_name = user_name
    mock_user.user_password = generate_password_hash(password)
    return mock_user


@patch("app.connect")
def test_login_success(mock_connect, client):
    _mock_db_with_user(mock_connect, _make_user())

    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "password123",
    })

    assert response.status_code == 200
    assert response.get_json()["user_id"] == 1


@patch("app.connect")
def test_login_wrong_password(mock_connect, client):
    _mock_db_with_user(mock_connect, _make_user())

    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "wrongpassword123",
    })

    assert response.status_code == 401
    assert response.get_json()["error"] == "Invalid password"


def test_login_missing_body(client):
    response = client.post("/api/login", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing data"


@patch("app.connect")
def test_login_missing_username(mock_connect, client):
    response = client.post("/api/login", json={
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing Username"


@patch("app.connect")
def test_login_missing_password(mock_connect, client):
    response = client.post("/api/login", json={
        "user_name": "testuser",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing Password"


@patch("app.connect")
def test_login_empty_username(mock_connect, client):
    response = client.post("/api/login", json={
        "user_name": "",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing Username"


@patch("app.connect")
def test_login_empty_password(mock_connect, client):
    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing Password"


@patch("app.connect")
def test_login_invalid_username(mock_connect, client):
    _mock_db_with_user(mock_connect, user=None)

    response = client.post("/api/login", json={
        "user_name": "unknownuser",
        "user_password": "password123",
    })

    assert response.status_code == 401
    assert response.get_json()["error"] == "Invalid username"


@patch("app.connect")
def test_login_alt_field_names(mock_connect, client):
    _mock_db_with_user(mock_connect, _make_user())

    response = client.post("/api/login", json={
        "username": "testuser",
        "password": "password123",
    })

    assert response.status_code == 200
    assert response.get_json()["user_id"] == 1


@patch("app.connect")
def test_login_success_includes_message(mock_connect, client):
    _mock_db_with_user(mock_connect, _make_user())

    response = client.post("/api/login", json={
        "user_name": "testuser",
        "user_password": "password123",
    })

    assert response.status_code == 200
    assert response.get_json()["message"] == "Login successful"
