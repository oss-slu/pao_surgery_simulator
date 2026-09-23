"""Tests for POST /api/signup.

DB is mocked; validation-only cases never open a session.
Signup success JSON uses `id` (not `user_id`) — keep assertions aligned with app.py.
"""
from unittest.mock import patch, MagicMock


def _mock_db(mock_connect, username_user=None, email_user=None):
    """Fake session for the two uniqueness lookups (username, then email)."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.side_effect = [
        username_user,
        email_user,
    ]
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


@patch("app.connect")
def test_signup_success(mock_connect, client):
    mock_db = _mock_db(mock_connect)

    def _flush_sets_id():
        # User(...) was passed to add(); give it an id like a real flush would.
        new_user = mock_db.add.call_args[0][0]
        new_user.user_id = 42

    mock_db.flush.side_effect = _flush_sets_id

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["id"] == 42
    assert "user_id" not in data
    assert data["message"] == "User Account"


def test_signup_missing_data(client):
    response = client.post("/api/signup", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing data"


def test_signup_invalid_username(client):
    response = client.post("/api/signup", json={
        "user_name": "   ",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid username"


def test_signup_invalid_email(client):
    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "not-an-email",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid email"


def test_signup_invalid_password(client):
    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "short",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid password"


@patch("app.connect")
def test_signup_username_already_used(mock_connect, client):
    _mock_db(mock_connect, username_user=MagicMock())

    response = client.post("/api/signup", json={
        "user_name": "taken",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Username has been used"


@patch("app.connect")
def test_signup_email_already_used(mock_connect, client):
    _mock_db(mock_connect, username_user=None, email_user=MagicMock())

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "taken@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Email has been used"
