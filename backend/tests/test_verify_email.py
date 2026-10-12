"""Tests for POST /api/verify_email.

@patch("app.connect") replaces the real DB session so these never need Postgres.
Uses the shared `client` fixture from conftest.
"""
import time
from unittest.mock import patch, MagicMock

from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import generate_password_hash

from app import app, make_verification_token, VERIFY_TOKEN_MAX_AGE


def _mock_db_with_user(mock_connect, user=None):
    """Make connect()'s session return `user` from query(...).filter_by(...).first()."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = user
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


def _make_user(user_id=1, user_email="test@example.com", verified=False):
    """Fake User row; user_email must be a real string for the token email check."""
    mock_user = MagicMock()
    mock_user.user_id = user_id
    mock_user.user_email = user_email
    mock_user.user_verified = verified
    return mock_user


def _post_token(client, token):
    return client.post("/api/verify_email", json={"token": token})


@patch("app.connect")
def test_verify_email_success(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)

    response = _post_token(client, make_verification_token(user))

    assert response.status_code == 200
    assert response.get_json() == {"message": "Email verified"}
    assert user.user_verified is True


@patch("app.connect")
def test_verify_email_already_verified(mock_connect, client):
    user = _make_user(verified=True)
    _mock_db_with_user(mock_connect, user)

    response = _post_token(client, make_verification_token(user))

    assert response.status_code == 200
    assert response.get_json() == {"message": "Email verified"}
    assert user.user_verified is True


@patch("app.connect")
def test_verify_email_wrong_secret(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)
    forged = URLSafeTimedSerializer("other-secret", salt="email-verify").dumps(
        {"uid": user.user_id, "email": user.user_email}
    )

    response = _post_token(client, forged)

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"
    assert user.user_verified is False


@patch("app.connect")
def test_verify_email_garbage_token(mock_connect, client):
    response = _post_token(client, "not-a-real-token")

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"


@patch("app.connect")
def test_verify_email_expired_token(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)
    issued_at = int(time.time()) - VERIFY_TOKEN_MAX_AGE - 60
    with patch(
        "itsdangerous.timed.TimestampSigner.get_timestamp", return_value=issued_at
    ):
        token = make_verification_token(user)

    response = _post_token(client, token)

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_expired"
    assert user.user_verified is False


@patch("app.connect")
def test_verify_email_changed_email(mock_connect, client):
    token = make_verification_token(_make_user(user_email="old@example.com"))
    user = _make_user(user_email="new@example.com")
    _mock_db_with_user(mock_connect, user)

    response = _post_token(client, token)

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"
    assert user.user_verified is False


@patch("app.connect")
def test_verify_email_unknown_user(mock_connect, client):
    _mock_db_with_user(mock_connect, user=None)

    response = _post_token(client, make_verification_token(_make_user(user_id=999)))

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"


def test_verify_email_missing_token(client):
    response = client.post("/api/verify_email", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing token"


def test_verify_email_non_string_token(client):
    response = _post_token(client, 12345)

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing token"


@patch("app.connect")
def test_verify_email_reused_token_is_idempotent(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)
    token = make_verification_token(user)

    first = _post_token(client, token)
    second = _post_token(client, token)

    assert first.status_code == 200
    assert second.status_code == 200
    assert user.user_verified is True


@patch("app.connect")
def test_verify_email_rejects_token_with_other_salt(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)
    other_purpose = URLSafeTimedSerializer(
        app.config["SECRET_KEY"], salt="password-reset"
    ).dumps({"uid": user.user_id, "email": user.user_email})

    response = _post_token(client, other_purpose)

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"
    assert user.user_verified is False


@patch("app.connect")
def test_verify_email_tampered_token(mock_connect, client):
    user = _make_user()
    _mock_db_with_user(mock_connect, user)
    token = make_verification_token(user)
    tampered = ("f" if token[0] != "f" else "g") + token[1:]

    response = _post_token(client, tampered)

    assert response.status_code == 400
    assert response.get_json()["code"] == "token_invalid"
    assert user.user_verified is False


def test_verify_email_non_json_body(client):
    response = client.post(
        "/api/verify_email", data="token=abc", content_type="text/plain"
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing token"


def test_verify_email_no_body(client):
    response = client.post("/api/verify_email")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing token"


@patch("app.connect")
def test_verify_email_db_failure_returns_generic_500(mock_connect, client):
    mock_connect.side_effect = Exception("connection to server at 10.0.0.5 failed")

    response = _post_token(client, make_verification_token(_make_user()))

    assert response.status_code == 500
    assert response.get_json() == {"error": "An internal error has occurred"}
    assert "10.0.0.5" not in response.get_data(as_text=True)


@patch("app.connect")
def test_verify_then_login_succeeds(mock_connect, client):
    user = _make_user()
    user.user_name = "testuser"
    user.user_password = generate_password_hash("password123")
    _mock_db_with_user(mock_connect, user)
    credentials = {"user_name": "testuser", "user_password": "password123"}

    before = client.post("/api/login", json=credentials)
    verify = _post_token(client, make_verification_token(user))
    after = client.post("/api/login", json=credentials)

    assert before.status_code == 403
    assert before.get_json()["code"] == "email_not_verified"
    assert verify.status_code == 200
    assert after.status_code == 200
    assert after.get_json()["user_id"] == user.user_id
