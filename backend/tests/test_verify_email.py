"""Tests for POST /api/verify_email.

@patch("app.connect") replaces the real DB session so these never need Postgres.
Uses the shared `client` fixture from conftest.
"""
import time
from unittest.mock import patch, MagicMock

from itsdangerous import URLSafeTimedSerializer

from app import make_verification_token, VERIFY_TOKEN_MAX_AGE


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
