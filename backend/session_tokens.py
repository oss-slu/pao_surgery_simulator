"""Create and validate database-backed, one-hour login sessions."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from models import LoginSession, User


@dataclass(frozen=True)
class IssuedSession:
    token: str
    issued_at: datetime
    expires_at: datetime

def create_session(db, user_id: int) -> IssuedSession:
    """Flush a new session; the caller must commit before returning its token."""
    if type(user_id) is not int or user_id <= 0:
        raise ValueError("user_id must be a positive integer")
    issued_at = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = issued_at + timedelta(hours=1)
    session_id = secrets.token_urlsafe(32)
    # Include the required ID/timestamp plus unpredictable random material.
    # The database record supplies identity and expiry when checking the token.
    # Do not store the random material: it could reconstruct the bearer token.
    material = f"{user_id}:{int(issued_at.timestamp())}:{secrets.token_urlsafe(32)}"
    token = hashlib.sha256(material.encode("utf-8")).hexdigest()
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
    """Only a token matching an active, unexpired database record is valid."""
    if token is None or token == "":
        raise SessionAuthenticationError("SESSION_REQUIRED", "Session token is required")
    if not isinstance(token, str) or len(token) > 4096:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    stored = db.get(LoginSession, token_hash)
    if stored is None or stored.revoked:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid or revoked session token")
    issued_at = _utc_timestamp(stored.issued_at)
    expires_at = _utc_timestamp(stored.expires_at)
    if expires_at - issued_at != 3600:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")

    now = datetime.now(timezone.utc).timestamp()
    if issued_at > now:
        raise SessionAuthenticationError("SESSION_INVALID", "Invalid session token")
    # At exactly one hour old the token is already expired.
    if now >= expires_at:
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

def revoke_session(db, token):
    """Revoke the submitted session; the caller commits before confirming logout."""
    authenticated = validate_session(db, token)
    changed = db.query(LoginSession).filter_by(
        token_hash=authenticated.token_hash, revoked=False
    ).update(
        {LoginSession.revoked: True}, synchronize_session=False
    )
    if changed != 1:
        raise SessionAuthenticationError("SESSION_INVALID", "Session is no longer active")

def renew_session(db, token) -> IssuedSession:
    """Atomically consume an active token and issue its replacement.

    The caller must commit both changes before sending the new token.
    A conditional UPDATE ensures only one competing renewal succeeds.
    """
    authenticated = validate_session(db, token)
    changed = (
        db.query(LoginSession)
        .filter(
            LoginSession.token_hash == authenticated.token_hash,
            LoginSession.revoked.is_(False),
            LoginSession.expires_at > datetime.now(timezone.utc),
        )
        .update({LoginSession.revoked: True}, synchronize_session=False)
    )
    if changed != 1:
        if datetime.now(timezone.utc).timestamp() >= _utc_timestamp(authenticated.expires_at):
            raise SessionAuthenticationError("SESSION_EXPIRED", "Session token has expired")
        raise SessionAuthenticationError("SESSION_INVALID", "Session is no longer active")
    return create_session(db, authenticated.user_id)
