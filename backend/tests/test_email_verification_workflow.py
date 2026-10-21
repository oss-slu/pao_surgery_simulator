"""Higher-level email verification workflow (mocked DB, real mailer path).

signup → unverified → login denied → verify → login allowed
Also: resend with real console mailer; login does not send mail.
"""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from werkzeug.security import check_password_hash

from mailer import send_verification_email as real_send_verification_email


class _FakeQuery:
    def __init__(self, store):
        self._store = store
        self._filters = {}

    def filter_by(self, **kwargs):
        self._filters = kwargs
        return self

    def first(self):
        user = self._store.user
        if user is None:
            return None
        if "user_id" in self._filters and user.user_id != self._filters["user_id"]:
            return None
        if "user_email" in self._filters and user.user_email != self._filters["user_email"]:
            return None
        if "user_name" in self._filters and user.user_name != self._filters["user_name"]:
            return None
        return user


class _FakeStore:
    """Minimal in-memory user store for signup/login/verify against one account."""

    def __init__(self):
        self.user = None
        self._next_id = 1

    def query(self, _model):
        return _FakeQuery(self)

    def add(self, user):
        self.user = user

    def flush(self):
        if self.user is not None and getattr(self.user, "user_id", None) is None:
            self.user.user_id = self._next_id
            self._next_id += 1


@patch("app.create_session")
@patch("app.send_verification_email")
@patch("app.connect")
def test_signup_verify_login_workflow(
    mock_connect, mock_send, mock_create_session, client
):
    store = _FakeStore()

    @contextmanager
    def fake_connect():
        yield store

    mock_connect.side_effect = fake_connect

    session = MagicMock()
    session.token = "session-token"
    session.issued_at.timestamp.return_value = 1_800_000_000
    session.expires_at.timestamp.return_value = 1_800_003_600
    mock_create_session.return_value = session

    signup = client.post("/api/signup", json={
        "user_name": "workflowuser",
        "user_email": "workflow@example.com",
        "user_password": "password123",
    })
    assert signup.status_code == 201
    assert signup.get_json()["id"] == 1
    assert store.user is not None
    assert store.user.user_verified is False
    assert check_password_hash(store.user.user_password, "password123")

    mock_send.assert_called_once()
    mail_to, token = mock_send.call_args[0]
    assert mail_to == "workflow@example.com"
    assert isinstance(token, str) and token

    denied = client.post("/api/login", json={
        "user_email": "workflow@example.com",
        "user_password": "password123",
    })
    assert denied.status_code == 403
    assert denied.get_json() == {
        "error": "Email verification required",
        "code": "EMAIL_NOT_VERIFIED",
    }
    mock_create_session.assert_not_called()

    verified = client.post("/api/verify_email", json={"token": token})
    assert verified.status_code == 200
    assert verified.get_json() == {"message": "Email verified"}
    assert store.user.user_verified is True

    allowed = client.post("/api/login", json={
        "user_email": "workflow@example.com",
        "user_password": "password123",
    })
    assert allowed.status_code == 200
    data = allowed.get_json()
    assert data["user_id"] == 1
    assert data["user_name"] == "workflowuser"
    assert data["session_token"] == "session-token"
    mock_create_session.assert_called_once()


@patch("app.create_session")
@patch("app.connect")
def test_signup_resend_verify_with_real_mailer(
    mock_connect, mock_create_session, client, monkeypatch, capsys
):
    """Signup + resend use real console mailer; login denied does not send mail."""
    monkeypatch.setenv("MAIL_SENDER", "noreply@example.com")
    monkeypatch.setenv("MAIL_BACKEND", "console")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    store = _FakeStore()

    @contextmanager
    def fake_connect():
        yield store

    mock_connect.side_effect = fake_connect

    session = MagicMock()
    session.token = "session-token"
    session.issued_at.timestamp.return_value = 1_800_000_000
    session.expires_at.timestamp.return_value = 1_800_003_600
    mock_create_session.return_value = session

    with patch(
        "app.send_verification_email", wraps=real_send_verification_email
    ) as spy_send:
        signup = client.post("/api/signup", json={
            "user_name": "realmailuser",
            "user_email": "realmail@example.com",
            "user_password": "password123",
        })
        assert signup.status_code == 201
        assert store.user.user_verified is False
        assert spy_send.call_count == 1
        signup_token = spy_send.call_args[0][1]

        out_after_signup = capsys.readouterr().out
        assert f"?token={signup_token}" in out_after_signup
        assert "token=3D" not in out_after_signup

        denied = client.post("/api/login", json={
            "user_email": "realmail@example.com",
            "user_password": "password123",
        })
        assert denied.status_code == 403
        assert denied.get_json()["code"] == "EMAIL_NOT_VERIFIED"
        # Login must not trigger another verification email.
        assert spy_send.call_count == 1

        resend = client.post(
            "/api/resend_verification",
            json={"email": "realmail@example.com"},
        )
        assert resend.status_code == 200
        assert spy_send.call_count == 2
        resend_token = spy_send.call_args[0][1]
        assert isinstance(resend_token, str) and resend_token

        out_after_resend = capsys.readouterr().out
        assert f"?token={resend_token}" in out_after_resend
        assert "token=3D" not in out_after_resend

        verified = client.post("/api/verify_email", json={"token": resend_token})
        assert verified.status_code == 200
        assert store.user.user_verified is True

        allowed = client.post("/api/login", json={
            "user_email": "realmail@example.com",
            "user_password": "password123",
        })
        assert allowed.status_code == 200
        assert allowed.get_json()["user_id"] == 1
        mock_create_session.assert_called_once()
        # Successful login also must not send mail.
        assert spy_send.call_count == 2
