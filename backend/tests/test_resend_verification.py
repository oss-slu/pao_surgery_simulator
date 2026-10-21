"""Tests for POST /api/resend_verification.

@patch("app.connect") replaces the real DB session so these never need Postgres.
Email delivery is mocked; no real SMTP.
Uses the shared `client` fixture from conftest.
"""
from unittest.mock import patch, MagicMock

from mailer import MailError


GENERIC_MESSAGE = (
    "If an unverified account exists for that email, "
    "a verification email has been sent."
)


def _mock_db_with_user(mock_connect, user=None):
    """Make connect()'s session return `user` from query(...).filter_by(...).first()."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter_by.return_value.first.return_value = user
    mock_connect.return_value.__enter__.return_value = mock_db
    return mock_db


def _make_user(user_id=1, user_email="test@example.com", verified=False):
    mock_user = MagicMock()
    mock_user.user_id = user_id
    mock_user.user_email = user_email
    mock_user.user_verified = verified
    return mock_user


def test_resend_missing_body(client):
    response = client.post("/api/resend_verification")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing data"


def test_resend_non_json_body(client):
    response = client.post(
        "/api/resend_verification",
        data="email=test@example.com",
        content_type="text/plain",
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing data"


def test_resend_missing_email(client):
    response = client.post("/api/resend_verification", json={})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing email"


def test_resend_empty_email(client):
    response = client.post("/api/resend_verification", json={"email": "   "})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing email"


def test_resend_non_string_email(client):
    response = client.post("/api/resend_verification", json={"email": 12345})

    assert response.status_code == 400
    assert response.get_json()["error"] == "Missing email"


@patch("app.send_verification_email")
@patch("app.connect")
def test_resend_unverified_user_sends_email(mock_connect, mock_send, client):
    user = _make_user(verified=False)
    _mock_db_with_user(mock_connect, user)

    response = client.post(
        "/api/resend_verification", json={"email": "test@example.com"}
    )

    assert response.status_code == 200
    assert response.get_json() == {"message": GENERIC_MESSAGE}
    mock_send.assert_called_once()
    to_addr, token = mock_send.call_args[0]
    assert to_addr == "test@example.com"
    assert isinstance(token, str) and token
    assert user.user_verified is False


@patch("app.send_verification_email")
@patch("app.make_verification_token", return_value="expected-token")
@patch("app.connect")
def test_resend_passes_generated_token_to_mailer(
    mock_connect, mock_make_token, mock_send, client
):
    user = _make_user(verified=False)
    _mock_db_with_user(mock_connect, user)

    response = client.post(
        "/api/resend_verification", json={"email": "test@example.com"}
    )

    assert response.status_code == 200
    mock_make_token.assert_called_once_with(user)
    mock_send.assert_called_once_with("test@example.com", "expected-token")


@patch("app.send_verification_email")
@patch("app.connect")
def test_resend_already_verified_does_not_send(mock_connect, mock_send, client):
    user = _make_user(verified=True)
    _mock_db_with_user(mock_connect, user)

    response = client.post(
        "/api/resend_verification", json={"email": "test@example.com"}
    )

    assert response.status_code == 200
    assert response.get_json() == {"message": "Account is already verified"}
    mock_send.assert_not_called()


@patch("app.send_verification_email")
@patch("app.connect")
def test_resend_nonexistent_user_generic_success(mock_connect, mock_send, client):
    _mock_db_with_user(mock_connect, user=None)

    response = client.post(
        "/api/resend_verification", json={"email": "nobody@example.com"}
    )

    assert response.status_code == 200
    assert response.get_json() == {"message": GENERIC_MESSAGE}
    mock_send.assert_not_called()


@patch("app.send_verification_email", side_effect=MailError)
@patch("app.connect")
def test_resend_mailer_failure_returns_controlled_error(
    mock_connect, mock_send, client
):
    user = _make_user(verified=False)
    _mock_db_with_user(mock_connect, user)

    response = client.post(
        "/api/resend_verification", json={"email": "test@example.com"}
    )

    assert response.status_code == 500
    assert response.get_json() == {"error": "Unable to send verification email"}
    body = response.get_data(as_text=True)
    assert "MailError" not in body
    assert "SMTP" not in body


@patch("app.connect")
def test_resend_db_failure_returns_generic_500(mock_connect, client):
    mock_connect.side_effect = Exception("connection to server at 10.0.0.5 failed")

    response = client.post(
        "/api/resend_verification", json={"email": "test@example.com"}
    )

    assert response.status_code == 500
    assert response.get_json() == {"error": "An internal error has occurred"}
    assert "10.0.0.5" not in response.get_data(as_text=True)
