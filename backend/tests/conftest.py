"""Shared pytest setup: stub heavy imports before app loads, share test client."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["MAIL_BACKEND"] = "console"

# Must run before any test does "from app import app".
# app.py imports vtk at module level; Windows Application Control may block the DLL.
for _name in (
    "vtk",
    "vtkmodules",
    "vtkmodules.util",
    "vtkmodules.util.numpy_support",
):
    sys.modules.setdefault(_name, MagicMock())

# initialize_db() runs at import time; avoid needing a live Postgres for collection.
with patch("db.initialize_db", return_value=True):
    import app as routes  # noqa: E402
    from app import app  # noqa: E402


@pytest.fixture
def client():
    """Flask test client shared by route tests (in-process HTTP, no real server)."""
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def authenticated_client(monkeypatch):
    """Client for route tests that exercise handlers beyond session validation."""
    from session_tokens import AuthenticatedSession

    now = datetime.now(timezone.utc)
    authenticated = AuthenticatedSession(
        user_id=1,
        session_id="test-session",
        token_hash="test-token-hash",
        issued_at=now,
        expires_at=now + timedelta(hours=1),
    )
    monkeypatch.setattr(
        routes, "validate_session", lambda _db, _token: authenticated
    )

    db = MagicMock()
    scan = MagicMock()
    scan.user_id = 1
    db.query.return_value.filter_by.return_value.first.return_value = scan

    @contextmanager
    def test_connect():
        yield db

    monkeypatch.setattr(routes, "connect", test_connect)
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client