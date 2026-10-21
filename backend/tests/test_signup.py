"""Tests for POST /api/signup.

DB is mocked; validation-only cases never open a session.
Email delivery is mocked — never hits real SMTP.
Signup success JSON uses `id` (not `user_id`) — keep assertions aligned with app.py.
"""
from unittest.mock import patch, MagicMock

from mailer import MailError


SUCCESS_MESSAGE = (
    "Account created. Please verify your email. "
    "A verification email has been sent."
)
MAIL_FAIL_MESSAGE = (
    "Account created, but the verification email could not be sent. "
    "You can request another verification email."
)


def _mock_db(mock_connect, username_user=None, email_user=None):
    """Fake session for the two uniqueness lookups (username, then email)."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.side_effect = [
        username_user,
        email_user,
    ]
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


def _flush_sets_id(mock_db, user_id=42):
    def _flush():
        new_user = mock_db.add.call_args[0][0]
        new_user.user_id = user_id

    mock_db.flush.side_effect = _flush


@patch("app.send_verification_email")
@patch("app.make_verification_token", return_value="signup-token")
@patch("app.connect")
def test_signup_success_sends_verification_email(
    mock_connect, mock_make_token, mock_send, client
):
    mock_db = _mock_db(mock_connect)
    _flush_sets_id(mock_db)

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["id"] == 42
    assert "user_id" not in data
    assert data["message"] == SUCCESS_MESSAGE

    new_user = mock_db.add.call_args[0][0]
    assert new_user.user_verified is False
    mock_make_token.assert_called_once()
    token_user = mock_make_token.call_args[0][0]
    assert token_user.user_id == 42
    assert token_user.user_email == "new@example.com"
    mock_send.assert_called_once_with("new@example.com", "signup-token")


@patch("app.send_verification_email")
@patch("app.connect")
def test_signup_creates_unverified_user(mock_connect, mock_send, client):
    mock_db = _mock_db(mock_connect)
    _flush_sets_id(mock_db)

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 201
    new_user = mock_db.add.call_args[0][0]
    assert new_user.user_verified is False
    mock_send.assert_called_once()


@patch("app.send_verification_email")
def test_signup_missing_data_does_not_send_email(mock_send, client):
    response = client.post("/api/signup", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing data"
    mock_send.assert_not_called()


@patch("app.send_verification_email")
def test_signup_invalid_username_does_not_send_email(mock_send, client):
    response = client.post("/api/signup", json={
        "user_name": "   ",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid username"
    mock_send.assert_not_called()


@patch("app.send_verification_email")
def test_signup_invalid_email_does_not_send_email(mock_send, client):
    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "not-an-email",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid email"
    mock_send.assert_not_called()


@patch("app.send_verification_email")
def test_signup_invalid_password_does_not_send_email(mock_send, client):
    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "short",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Invalid password"
    mock_send.assert_not_called()


@patch("app.send_verification_email")
@patch("app.connect")
def test_signup_username_already_used_does_not_send_email(
    mock_connect, mock_send, client
):
    _mock_db(mock_connect, username_user=MagicMock())

    response = client.post("/api/signup", json={
        "user_name": "taken",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Username has been used"
    mock_send.assert_not_called()


@patch("app.send_verification_email")
@patch("app.connect")
def test_signup_email_already_used_does_not_send_email(
    mock_connect, mock_send, client
):
    _mock_db(mock_connect, username_user=None, email_user=MagicMock())

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "taken@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 400
    assert response.get_json()["error"] == "Email has been used"
    mock_send.assert_not_called()


@patch("app.send_verification_email", side_effect=MailError)
@patch("app.make_verification_token", return_value="signup-token")
@patch("app.connect")
def test_signup_mail_failure_keeps_account(
    mock_connect, mock_make_token, mock_send, client
):
    mock_db = _mock_db(mock_connect)
    _flush_sets_id(mock_db)

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data["id"] == 42
    assert data["message"] == MAIL_FAIL_MESSAGE
    body = response.get_data(as_text=True)
    assert "MailError" not in body
    assert "SMTP" not in body
    assert "signup-token" not in body
    # Account was added before mail failure; connect context already exited.
    mock_db.add.assert_called_once()
    new_user = mock_db.add.call_args[0][0]
    assert new_user.user_verified is False
    mock_send.assert_called_once()
