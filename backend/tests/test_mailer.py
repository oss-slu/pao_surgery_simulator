"""Tests for mailer console/SMTP backends and signup creating unverified users.

Covers mailer.py (console vs SMTP, TLS/login, failures, verification link)
and that signup persists `user_verified=False`.
SMTP and the DB are mocked; no real mail is sent and no Postgres is needed.
"""
import logging
import smtplib
from unittest.mock import patch, MagicMock

import pytest

from mailer import MailError, send_email, send_verification_email

SMTP_PASSWORD = "s3cret"


@pytest.fixture
def console_env(monkeypatch):
    monkeypatch.setenv("MAIL_SENDER", "noreply@example.com")
    monkeypatch.delenv("MAIL_BACKEND", raising=False)


@pytest.fixture
def smtp_env(monkeypatch):
    monkeypatch.setenv("MAIL_SENDER", "noreply@example.com")
    monkeypatch.setenv("MAIL_BACKEND", "smtp")
    monkeypatch.setenv("MAIL_SERVER", "smtp.example.com")
    monkeypatch.setenv("MAIL_USERNAME", "mailer-user")
    monkeypatch.setenv("MAIL_PASSWORD", SMTP_PASSWORD)
    monkeypatch.delenv("MAIL_PORT", raising=False)


def _smtp_session(mock_smtp):
    """The object bound by `with smtplib.SMTP(...) as smtp`."""
    return mock_smtp.return_value.__enter__.return_value


# --- send_email ---------------------------------------------------------------

@patch("mailer.smtplib.SMTP")
def test_send_email_console_backend_prints_and_skips_smtp(mock_smtp, console_env, capsys):
    send_email("user@example.com", "Hello", "Body text")

    out = capsys.readouterr().out
    assert "To: user@example.com" in out
    assert "Subject: Hello" in out
    mock_smtp.assert_not_called()


@patch("mailer.smtplib.SMTP")
def test_send_email_smtp_backend_sends_message(mock_smtp, smtp_env):
    send_email("user@example.com", "Hello", "Body text")

    mock_smtp.assert_called_once_with("smtp.example.com", 587, timeout=10)
    smtp = _smtp_session(mock_smtp)
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("mailer-user", SMTP_PASSWORD)
    smtp.send_message.assert_called_once()

    sent = smtp.send_message.call_args[0][0]
    assert sent["From"] == "noreply@example.com"
    assert sent["To"] == "user@example.com"
    assert sent["Subject"] == "Hello"


@patch("mailer.smtplib.SMTP")
def test_send_email_smtp_uses_custom_port(mock_smtp, smtp_env, monkeypatch):
    monkeypatch.setenv("MAIL_PORT", "2525")

    send_email("user@example.com", "Hello", "Body text")

    mock_smtp.assert_called_once_with("smtp.example.com", 2525, timeout=10)


@patch("mailer.smtplib.SMTP")
def test_send_email_includes_html_alternative(mock_smtp, smtp_env):
    send_email("user@example.com", "Hello", "Body text", html="<p>Body text</p>")

    sent = _smtp_session(mock_smtp).send_message.call_args[0][0]
    assert sent.is_multipart()
    content_types = [part.get_content_type() for part in sent.iter_parts()]
    assert "text/plain" in content_types
    assert "text/html" in content_types


@patch("mailer.smtplib.SMTP")
def test_send_email_smtp_failure_raises_mail_error(mock_smtp, smtp_env, caplog):
    _smtp_session(mock_smtp).login.side_effect = smtplib.SMTPAuthenticationError(535, b"bad")
    caplog.set_level(logging.ERROR, logger="mailer")

    with pytest.raises(MailError):
        send_email("user@example.com", "Hello", "Body text")

    assert "SMTPAuthenticationError" in caplog.text
    assert SMTP_PASSWORD not in caplog.text


@patch("mailer.smtplib.SMTP")
def test_send_email_connection_error_raises_mail_error(mock_smtp, smtp_env):
    mock_smtp.side_effect = OSError("connection refused")

    with pytest.raises(MailError):
        send_email("user@example.com", "Hello", "Body text")


# --- send_verification_email --------------------------------------------------

@patch("mailer.send_email")
def test_send_verification_email_builds_link(mock_send, monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")

    send_verification_email("user@example.com", "abc123")

    mock_send.assert_called_once()
    to, subject, body = mock_send.call_args[0]
    assert to == "user@example.com"
    assert subject == "Verify your PAO Surgery Simulator account"
    assert "https://app.example.com/verify?token=abc123" in body
    assert "24 hours" in body


@patch("mailer.send_email")
def test_verification_email_expiry_matches_token_max_age(mock_send, monkeypatch):
    from app import VERIFY_TOKEN_MAX_AGE

    monkeypatch.setenv("FRONTEND_URL", "https://app.example.com")

    send_verification_email("user@example.com", "abc123")

    body = mock_send.call_args[0][2]
    assert f"expires in {VERIFY_TOKEN_MAX_AGE // 3600} hours" in body


def test_send_email_missing_mail_sender_raises_mail_error(monkeypatch):
    monkeypatch.delenv("MAIL_SENDER", raising=False)
    monkeypatch.setenv("MAIL_BACKEND", "console")

    with pytest.raises(MailError):
        send_email("user@example.com", "Hello", "Body text")


def test_send_verification_email_missing_frontend_url_raises_mail_error(
    monkeypatch,
):
    monkeypatch.setenv("MAIL_SENDER", "noreply@example.com")
    monkeypatch.setenv("MAIL_BACKEND", "console")
    monkeypatch.delenv("FRONTEND_URL", raising=False)

    with pytest.raises(MailError):
        send_verification_email("user@example.com", "abc123")


def test_console_verification_print_is_copy_pasteable(monkeypatch, capsys):
    """Console must print a plain link — not quoted-printable MIME (token=3D...)."""
    monkeypatch.setenv("MAIL_SENDER", "noreply@example.com")
    monkeypatch.setenv("MAIL_BACKEND", "console")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    # Long JWT-like token similar to itsdangerous output (triggers QP soft-wrap if MIME printed).
    token = (
        "eyJ1aWQiOjIsImVtYWlsIjoiYWRyaWFud2VobGVuMTNAaG90bWFpbC5jb20ifQ"
        ".atgmZw.4KDKEs6v-2njm3lhMul4kVIAF4k"
    )
    expected_link = f"http://localhost:3000/verify?token={token}"

    send_verification_email("user@example.com", token)

    out = capsys.readouterr().out
    assert expected_link in out
    assert "token=3D" not in out
    assert "Content-Transfer-Encoding" not in out
    # URL must appear on a single line (no soft-break mid-token).
    link_lines = [line for line in out.splitlines() if "verify?token=" in line]
    assert len(link_lines) == 1
    assert link_lines[0].strip() == expected_link
    assert f"?token={token}" in link_lines[0]


# --- signup -------------------------------------------------------------------

@patch("app.send_verification_email")
@patch("app.connect")
def test_signup_creates_unverified_user(mock_connect, mock_send, client):
    mock_db = MagicMock()
    # Username and email uniqueness lookups both find nothing.
    mock_db.query.return_value.filter_by.return_value.first.side_effect = [None, None]
    mock_connect.return_value.__enter__.return_value = mock_db

    def _flush_sets_id():
        new_user = mock_db.add.call_args[0][0]
        new_user.user_id = 1

    mock_db.flush.side_effect = _flush_sets_id

    response = client.post("/api/signup", json={
        "user_name": "newuser",
        "user_email": "new@example.com",
        "user_password": "password123",
    })

    assert response.status_code == 201
    new_user = mock_db.add.call_args[0][0]
    assert new_user.user_verified is False
    mock_send.assert_called_once()
