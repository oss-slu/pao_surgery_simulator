"""Tests for POST /api/auth/google and Google identity helpers.

Google token verification is mocked; these tests never call Google or Postgres.
"""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from google_auth import (
    GoogleAuthConfigError,
    allocate_unique_username,
    google_email_is_authoritative,
    username_from_email,
    verify_google_id_token,
)


def _idinfo(
    *,
    sub="google-sub-1",
    email="user@gmail.com",
    email_verified=True,
    hd=None,
    aud="test-google-client-id",
    iss="https://accounts.google.com",
):
    info = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "aud": aud,
        "iss": iss,
    }
    if hd is not None:
        info["hd"] = hd
    return info


def _session_mock():
    session = MagicMock()
    session.token = "session-token"
    session.issued_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    session.expires_at = datetime(2026, 1, 1, 1, tzinfo=timezone.utc)
    return session


def _mock_connect(mock_connect, db):
    mock_connect.return_value.__enter__.return_value = db
    # Returning a truthy value from __exit__ would swallow IntegrityError.
    mock_connect.return_value.__exit__.return_value = False
    return db


def _query_side_effect(*, by_google_sub=None, by_email=None, by_username=None):
    """Route User.filter_by lookups used by Google auth / username allocation."""

    def filter_by(**kwargs):
        result = MagicMock()
        if "google_sub" in kwargs:
            result.first.return_value = by_google_sub
        elif "user_email" in kwargs:
            result.first.return_value = by_email
        elif "user_name" in kwargs:
            name = kwargs["user_name"]
            if callable(by_username):
                result.first.return_value = by_username(name)
            elif isinstance(by_username, dict):
                result.first.return_value = by_username.get(name)
            else:
                result.first.return_value = by_username
        else:
            result.first.return_value = None
        return result

    return filter_by


# --- helpers -----------------------------------------------------------------


def test_username_from_email_truncates_and_sanitizes():
    assert username_from_email("Alice.Bob+tag@gmail.com") == "alicebobtag"
    assert len(username_from_email("a" * 40 + "@gmail.com")) == 20
    assert username_from_email("!@x.com") == "user"


def test_allocate_unique_username_adds_suffix():
    db = MagicMock()
    taken = {"alice": MagicMock(), "alice1": MagicMock()}

    def by_name(name):
        return taken.get(name)

    db.query.return_value.filter_by.side_effect = lambda **kw: MagicMock(
        first=lambda: by_name(kw.get("user_name"))
    )
    assert allocate_unique_username(db, "alice@gmail.com") == "alice2"


def test_google_email_authoritative_gmail_and_workspace():
    assert google_email_is_authoritative(_idinfo(email="a@gmail.com")) is True
    assert google_email_is_authoritative(
        _idinfo(email="a@googlemail.com")
    ) is True
    assert google_email_is_authoritative(
        _idinfo(email="a@company.com", hd="company.com")
    ) is True


def test_google_email_not_authoritative_for_third_party():
    assert google_email_is_authoritative(
        _idinfo(email="a@outlook.com", email_verified=True)
    ) is False
    assert google_email_is_authoritative(
        _idinfo(email="a@gmail.com", email_verified=False)
    ) is False


@patch("google_auth.id_token.verify_oauth2_token")
@patch("google_auth.get_google_client_id", return_value="test-google-client-id")
def test_verify_rejects_wrong_issuer(mock_client_id, mock_verify):
    mock_verify.return_value = _idinfo(iss="https://evil.example")
    with pytest.raises(ValueError, match="issuer"):
        verify_google_id_token("fake-token")


@patch("google_auth.id_token.verify_oauth2_token")
@patch("google_auth.get_google_client_id", return_value="test-google-client-id")
def test_verify_rejects_wrong_audience(mock_client_id, mock_verify):
    mock_verify.return_value = _idinfo(aud="other-client")
    with pytest.raises(ValueError, match="audience"):
        verify_google_id_token("fake-token")


# --- endpoint ----------------------------------------------------------------


@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_creates_new_verified_gmail_user(
    mock_connect, mock_verify, mock_create_session, client
):
    mock_verify.return_value = _idinfo()
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=None, by_email=None, by_username=None
    )
    _mock_connect(mock_connect, db)

    created = []

    def capture_add(user):
        user.user_id = 42
        created.append(user)

    db.add.side_effect = capture_add
    mock_create_session.return_value = _session_mock()

    response = client.post("/api/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["message"] == "Login successful"
    assert body["user_id"] == 42
    assert body["session_token"] == "session-token"
    assert "issued_at" in body and "expires_at" in body
    assert created and created[0].google_sub == "google-sub-1"
    assert created[0].user_password is None
    assert created[0].user_verified is True
    mock_create_session.assert_called_once()


@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_returning_user(
    mock_connect, mock_verify, mock_create_session, client
):
    mock_verify.return_value = _idinfo(sub="existing-sub")
    existing = MagicMock()
    existing.user_id = 7
    existing.user_name = "existing"
    existing.user_verified = True
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=existing
    )
    _mock_connect(mock_connect, db)
    mock_create_session.return_value = _session_mock()

    response = client.post("/api/auth/google", json={"id_token": "valid-token"})

    assert response.status_code == 200
    assert response.get_json()["user_id"] == 7
    assert response.get_json()["user_name"] == "existing"
    db.add.assert_not_called()
    mock_create_session.assert_called_once_with(db, 7)


@patch("app.verify_google_id_token", side_effect=ValueError("Token expired"))
def test_google_auth_expired_token(mock_verify, client):
    response = client.post("/api/auth/google", json={"credential": "expired"})
    assert response.status_code == 401
    assert response.get_json()["error"] == "Invalid Google credential"


@patch("app.verify_google_id_token", side_effect=ValueError("Invalid token audience"))
def test_google_auth_wrong_audience(mock_verify, client):
    response = client.post("/api/auth/google", json={"credential": "bad-aud"})
    assert response.status_code == 401


@patch("app.verify_google_id_token", side_effect=ValueError("Invalid token issuer"))
def test_google_auth_wrong_issuer(mock_verify, client):
    response = client.post("/api/auth/google", json={"credential": "bad-iss"})
    assert response.status_code == 401


def test_google_auth_missing_credential(client):
    response = client.post("/api/auth/google", json={})
    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing Google credential"


def test_google_auth_missing_body(client):
    response = client.post(
        "/api/auth/google",
        data="not-json",
        content_type="text/plain",
    )
    assert response.status_code == 400


@patch("app.verify_google_id_token", side_effect=GoogleAuthConfigError("missing"))
def test_google_auth_missing_client_id_config(mock_verify, client):
    response = client.post("/api/auth/google", json={"credential": "token"})
    assert response.status_code == 503


@patch("app.send_verification_email")
@patch("app.make_verification_token", return_value="verify-token")
@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_conflict_with_password_account(
    mock_connect, mock_verify, mock_create_session, mock_token, mock_send, client
):
    mock_verify.return_value = _idinfo(email="taken@gmail.com")
    password_user = MagicMock()
    password_user.user_password = "hashed"
    password_user.google_sub = None
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=None, by_email=password_user
    )
    _mock_connect(mock_connect, db)

    response = client.post("/api/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 409
    body = response.get_json()
    assert body["code"] == "ACCOUNT_CONFLICT"
    assert "password" in body["error"].lower()
    assert "user_id" not in body
    mock_create_session.assert_not_called()
    mock_send.assert_not_called()


@patch("app.send_verification_email")
@patch("app.make_verification_token", return_value="verify-token")
@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_non_authoritative_email_requires_verification(
    mock_connect, mock_verify, mock_create_session, mock_token, mock_send, client
):
    mock_verify.return_value = _idinfo(
        email="person@outlook.com", email_verified=True
    )
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=None, by_email=None, by_username=None
    )
    _mock_connect(mock_connect, db)

    def capture_add(user):
        user.user_id = 9
        user.user_email = "person@outlook.com"

    db.add.side_effect = capture_add

    response = client.post("/api/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 403
    assert response.get_json()["code"] == "EMAIL_NOT_VERIFIED"
    mock_create_session.assert_not_called()
    mock_send.assert_called_once()
    assert db.add.called
    created_user = db.add.call_args[0][0]
    assert created_user.user_verified is False
    assert created_user.user_password is None


@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_existing_unverified_rejected(
    mock_connect, mock_verify, mock_create_session, client
):
    mock_verify.return_value = _idinfo(sub="unverified-sub")
    existing = MagicMock()
    existing.user_id = 3
    existing.user_verified = False
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=existing
    )
    _mock_connect(mock_connect, db)

    response = client.post("/api/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 403
    assert response.get_json()["code"] == "EMAIL_NOT_VERIFIED"
    mock_create_session.assert_not_called()


@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_concurrent_unique_conflict_retries(
    mock_connect, mock_verify, mock_create_session, client
):
    mock_verify.return_value = _idinfo(sub="race-sub", email="race@gmail.com")
    winner = MagicMock()
    winner.user_id = 99
    winner.user_name = "race"
    winner.user_verified = True

    db_first = MagicMock()
    db_first.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=None, by_email=None, by_username=None
    )
    db_first.flush.side_effect = IntegrityError(
        "INSERT", {}, Exception("duplicate key value violates unique constraint")
    )

    db_second = MagicMock()
    db_second.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=winner
    )

    mock_connect.return_value.__enter__.side_effect = [db_first, db_second]
    mock_connect.return_value.__exit__.return_value = False
    mock_create_session.return_value = _session_mock()

    def add_and_fail(user):
        raise IntegrityError(
            "INSERT", {}, Exception("duplicate key value violates unique constraint")
        )

    db_first.add.side_effect = add_and_fail

    response = client.post("/api/auth/google", json={"credential": "valid-token"})

    assert response.status_code == 200
    assert response.get_json()["user_id"] == 99
    assert mock_connect.return_value.__enter__.call_count == 2
    mock_create_session.assert_called_once_with(db_second, 99)


@patch("app.create_session")
@patch("app.verify_google_id_token")
@patch("app.connect")
def test_google_auth_session_matches_login_shape(
    mock_connect, mock_verify, mock_create_session, client
):
    mock_verify.return_value = _idinfo()
    existing = MagicMock()
    existing.user_id = 1
    existing.user_name = "testuser"
    existing.user_verified = True
    db = MagicMock()
    db.query.return_value.filter_by.side_effect = _query_side_effect(
        by_google_sub=existing
    )
    _mock_connect(mock_connect, db)
    mock_create_session.return_value = _session_mock()

    response = client.post("/api/auth/google", json={"credential": "token"})
    body = response.get_json()
    assert set(body.keys()) == {
        "message",
        "user_id",
        "user_name",
        "session_token",
        "issued_at",
        "expires_at",
    }
    assert response.headers.get("Cache-Control") == "no-store"
