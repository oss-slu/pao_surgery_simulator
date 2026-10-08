"""Create signed one-hour sessions for users whose passwords were verified."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import os
import secrets

from itsdangerous import BadData, URLSafeSerializer
from models import LoginSession, User


@dataclass(frozen=True)
class IssuedSession:
    token: str
    issued_at: datetime
    expires_at: datetime


def _serializer() -> URLSafeSerializer:
    secret = os.environ.get("SESSION_SIGNING_SECRET", "")
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError(
            "Configure SESSION_SIGNING_SECRET with at least 32 bytes of random secret material."
        )
    return URLSafeSerializer(
        secret, salt="pao-login-session-v1",
        signer_kwargs={"digest_method": hashlib.sha256},
    )


def create_session(db, user_id: int) -> IssuedSession:
    """Flush a new session; the caller must commit before returning its token."""
    if type(user_id) is not int or user_id <= 0:
        raise ValueError("user_id must be a positive integer")
    serializer = _serializer()
    issued_at = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = issued_at + timedelta(hours=1)
    session_id = secrets.token_urlsafe(32)
    token = serializer.dumps({
        "version": 1,
        "user_id": user_id,
        "issued_at": int(issued_at.timestamp()),
        "expires_at": int(expires_at.timestamp()),
        "session_id": session_id,
    })
    db.add(LoginSession(
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        session_id=session_id,
        user_id=user_id,
        issued_at=issued_at,
        expires_at=expires_at,
        revoked=False,
    ))
    db.flush()
    return IssuedSession(token, issued_at, expires_at)


class SessionAuthenticationError(Exception):
    """An authentication rejection suitable for a 401 JSON response."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class AuthenticatedSession:
    user_id: int
    session_id: str
    token_hash: str
    issued_at: datetime
    expires_at: datetime


def _utc_timestamp(value: datetime) -> int:
    # PostgreSQL preserves timezone information; naive DB values represent UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())


def validate_session(db, token) -> AuthenticatedSession:
    """Verify the signed claims, active stored record, and server-side expiry."""
    if token is None or token == "":
        raise SessionAuthenticationError("SESSION_REQUIRED", "Session token is required")
    if not isinstance(token, str) or len(token) > 4096:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")
    try:
        claims = _serializer().loads(token)
    except BadData:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token") from None

    if (
        not isinstance(claims, dict)
        or type(claims.get("version")) is not int or claims["version"] != 1
        or type(claims.get("user_id")) is not int or claims["user_id"] <= 0
        or type(claims.get("issued_at")) is not int
        or type(claims.get("expires_at")) is not int
        or not isinstance(claims.get("session_id"), str)
        or len(claims["session_id"]) != 43
        or claims["expires_at"] - claims["issued_at"] != 3600
    ):
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    stored = db.get(LoginSession, token_hash)
    if stored is None or stored.revoked:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid or revoked session token")
    if (
        stored.user_id != claims["user_id"]
        or stored.session_id != claims["session_id"]
        or _utc_timestamp(stored.issued_at) != claims["issued_at"]
        or _utc_timestamp(stored.expires_at) != claims["expires_at"]
    ):
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")

    now = datetime.now(timezone.utc).timestamp()
    if claims["issued_at"] > now:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")
    # At exactly one hour old the token is already expired.
    if now >= claims["expires_at"]:
        raise SessionAuthenticationError("SESSION_EXPIRED", "Session token has expired")
    if db.get(User, stored.user_id) is None:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")

    return AuthenticatedSession(
        user_id=stored.user_id,
        session_id=stored.session_id,
        token_hash=token_hash,
        issued_at=stored.issued_at,
        expires_at=stored.expires_at,
    )
