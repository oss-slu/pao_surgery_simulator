"""Shared pytest setup: stub heavy imports before app loads, share test client."""
import sys
from unittest.mock import MagicMock, patch

import pytest

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
    from app import app  # noqa: E402


@pytest.fixture
def client():
    """Flask test client shared by route tests (in-process HTTP, no real server)."""
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client

@pytest.fixture
def authenticated_client(client, monkeypatch):
    """Real session and ownership records for protected route behavior tests.

    GETs use the session cookie. POST/PATCH tests explicitly submit the token
    as JSON (or JSON metadata for multipart uploads).
    """
    from contextlib import contextmanager
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    import app as routes
    from base import Base
    from models import Dicom, User
    from session_tokens import create_session

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)

    @contextmanager
    def connect():
        with factory() as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise

    with connect() as db:
        db.add_all([
            User(user_id=1, user_name="owner", user_email="owner@example.com",
                 user_password="unused-by-these-tests"),
            User(user_id=2, user_name="other", user_email="other@example.com",
                 user_password="unused-by-these-tests"),
        ])
        db.flush()
        issued = create_session(db, 1)

    def add_scan(upload_id, user_id=1):
        with connect() as db:
            db.add(Dicom(upload_id=upload_id, user_id=user_id))

    monkeypatch.setattr(routes, "connect", connect)
    client.set_cookie("session_token", issued.token)
    client.session_token = issued.token
    client.session_db = connect
    client.add_scan = add_scan
    try:
        yield client
    finally:
        client.delete_cookie("session_token")
        engine.dispose()
