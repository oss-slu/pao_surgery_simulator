"""Verify Google Identity Services ID tokens and derive account fields."""

from __future__ import annotations

import os
import re
from typing import Any, Mapping

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.exc import IntegrityError

from models import User

# Google documents both issuer forms for ID tokens.
_GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
_USERNAME_MAX_LEN = 20
_USERNAME_SAFE = re.compile(r"[^a-z0-9]+")


class GoogleAuthConfigError(RuntimeError):
    """GOOGLE_CLIENT_ID is missing or blank."""


def get_google_client_id() -> str:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise GoogleAuthConfigError("GOOGLE_CLIENT_ID is not configured")
    return client_id


def verify_google_id_token(credential: str) -> Mapping[str, Any]:
    """Verify signature, audience, expiry, and issuer; return decoded claims.

    Never log or persist ``credential``.
    """
    client_id = get_google_client_id()
    idinfo = id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        audience=client_id,
    )
    issuer = idinfo.get("iss")
    if issuer not in _GOOGLE_ISSUERS:
        raise ValueError("Invalid token issuer")
    if idinfo.get("aud") != client_id:
        raise ValueError("Invalid token audience")
    return idinfo


def google_email_is_authoritative(idinfo: Mapping[str, Any]) -> bool:
    """True when Google is authoritative for the email (Gmail or Workspace hd).

    Per Google Identity docs: @gmail.com/@googlemail.com, or email_verified with
    an ``hd`` claim. Other addresses need the app's email-verification workflow.
    """
    email = idinfo.get("email")
    if not isinstance(email, str):
        return False
    email_lower = email.strip().lower()
    if idinfo.get("email_verified") is not True:
        return False
    if email_lower.endswith("@gmail.com") or email_lower.endswith("@googlemail.com"):
        return True
    if idinfo.get("hd"):
        return True
    return False


def username_from_email(email: str) -> str:
    """Derive a schema-compatible username base from an email local-part."""
    local = email.split("@", 1)[0].lower()
    cleaned = _USERNAME_SAFE.sub("", local)
    if not cleaned:
        cleaned = "user"
    return cleaned[:_USERNAME_MAX_LEN]


def allocate_unique_username(db, email: str) -> str:
    """Pick an unused username (<=20 chars) derived from ``email``."""
    base = username_from_email(email)
    candidate = base
    suffix = 0
    while db.query(User).filter_by(user_name=candidate).first() is not None:
        suffix += 1
        suffix_text = str(suffix)
        trimmed = base[: _USERNAME_MAX_LEN - len(suffix_text)]
        candidate = f"{trimmed}{suffix_text}"
    return candidate


def create_google_user(db, *, google_sub: str, email: str, verified: bool) -> User:
    """Insert a Google-only user (no local password). Caller commits."""
    user = User(
        user_name=allocate_unique_username(db, email),
        user_email=email,
        user_verified=verified,
        user_organization="",
        user_password=None,
        google_sub=google_sub,
    )
    db.add(user)
    db.flush()
    return user


def is_unique_violation(exc: BaseException) -> bool:
    """True for PostgreSQL unique-constraint races (and SQLite equivalents in tests)."""
    if not isinstance(exc, IntegrityError):
        return False
    orig = getattr(exc, "orig", None)
    text = str(orig or exc).lower()
    return "unique" in text or "duplicate" in text
