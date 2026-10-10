"""Session/ownership regression tests, using an isolated in-memory database."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from werkzeug.security import generate_password_hash

import app as routes
import session_tokens
from base import Base
from models import Dicom, LoginSession, User


@pytest.fixture
def session_db(monkeypatch, tmp_path):
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
        for user_id in (1, 2):
            db.add(User(user_id=user_id, user_name=f"user{user_id}",
                        user_email=f"user{user_id}@example.com",
                        user_password=generate_password_hash("password123")))
        db.flush()
        db.add_all([Dicom(upload_id="owned", user_id=1),
                    Dicom(upload_id="foreign", user_id=2)])
    for upload_id in ("owned", "foreign"):
        (tmp_path / upload_id).mkdir()
    monkeypatch.setattr(routes, "connect", connect)
    monkeypatch.setattr(routes, "UPLOAD_FOLDER", str(tmp_path))
    yield connect
    engine.dispose()


@pytest.fixture
def issued(client, session_db):
    response = client.post("/api/login", json={
        "user_name": "user1", "user_password": "password123"})
    assert response.status_code == 200
    return response.get_json()


def stored_session(db, token):
    return db.get(LoginSession, hashlib.sha256(token.encode()).hexdigest())


def expire(connect, token):
    with connect() as db:
        stored = stored_session(db, token)
        stored.issued_at = datetime.now(timezone.utc) - timedelta(hours=2)
        stored.expires_at = stored.issued_at + timedelta(hours=1)


def test_login_persists_identity_and_one_hour_lifetime(issued, session_db):
    assert issued["expires_at"] - issued["issued_at"] == 3600
    with session_db() as db:
        stored = stored_session(db, issued["session_token"])
        assert stored.user_id == issued["user_id"] == 1
        assert not stored.revoked
        assert stored.token_hash != issued["session_token"]
        assert session_tokens.validate_session(db, issued["session_token"]).user_id == 1


def test_repeated_login_creates_distinct_tokens(client, issued, session_db):
    second = client.post("/api/login", json={
        "user_name": "user1", "user_password": "password123"}).get_json()
    assert second["session_token"] != issued["session_token"]


# Every DICOM endpoint must reject authentication before touching files/data.
DICOM_ROUTES = [
    ("POST", "/api/upload_dicom"),
    ("POST", "/api/users/1/scans"),
    ("POST", "/api/sessions"),
    ("POST", "/api/render_dicom/owned"),
    ("POST", "/api/render_dicom/owned/metadata"),
    ("POST", "/api/download_dicom/owned"),
    ("POST", "/api/scans/owned/labels"),
    ("POST", "/api/scans/owned/labels/list"),
    ("PATCH", "/api/scans/owned/labels/1/toggle"),
    ("GET", "/api/users/1/scans"),
    ("GET", "/api/sessions"),
    ("GET", "/api/render_dicom/owned"),
    ("GET", "/api/render_dicom/owned/metadata"),
    ("GET", "/api/download_dicom/owned"),
    ("GET", "/api/scans/owned/labels"),
]


@pytest.mark.parametrize("method,url", DICOM_ROUTES)
@pytest.mark.parametrize("kind,code", [
    ("missing", "SESSION_REQUIRED"), ("invalid", "SESSION_INVALID"),
    ("expired", "SESSION_EXPIRED"),
])
def test_dicom_routes_reject_unusable_sessions(client, issued, session_db,
                                              method, url, kind, code):
    token = issued["session_token"]
    if kind == "expired":
        expire(session_db, token)
    if kind == "invalid":
        token = "forged-token"
    data = {} if kind == "missing" else {"session_token": token}
    response = client.open(url, method=method, json=data)
    assert response.status_code == 401
    assert response.get_json()["code"] == code


@pytest.mark.parametrize("method,url", [
    (method, url.replace("owned", "foreign"))
    for method, url in DICOM_ROUTES if "owned" in url
] + [("POST", "/api/users/2/scans")])
def test_cannot_access_another_users_dicom(client, issued, session_db, method, url):
    response = client.open(url, method=method, json={
        "session_token": issued["session_token"], "user_id": 2})
    assert response.status_code == 403
    assert response.get_json()["code"] == "ACCESS_DENIED"


def test_owner_can_read_labels(client, issued, session_db):
    response = client.post("/api/scans/owned/labels/list", json={
        "session_token": issued["session_token"]})
    assert response.status_code == 200
    assert response.get_json() == {"scan_id": "owned", "labels": []}


def test_scan_lists_only_include_owned_records(client, issued, session_db):
    data = {"session_token": issued["session_token"]}
    response = client.post("/api/users/1/scans", json=data)
    assert response.status_code == 200
    assert [scan["upload_id"] for scan in response.get_json()] == ["owned"]
    response = client.post("/api/sessions", json=data)
    assert response.status_code == 200
    assert response.get_json()["sessions"] == ["owned"]


def test_token_expires_at_exactly_one_hour(issued, session_db, monkeypatch):
    class ExpirationClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromtimestamp(issued["expires_at"], timezone.utc)

    monkeypatch.setattr(session_tokens, "datetime", ExpirationClock)
    with session_db() as db, pytest.raises(session_tokens.SessionAuthenticationError) as error:
        session_tokens.validate_session(db, issued["session_token"])
    assert error.value.code == "SESSION_EXPIRED"


def test_refresh_replaces_token_and_rejects_reuse(client, issued, session_db):
    old_token = issued["session_token"]
    response = client.post("/api/session/refresh", json={"session_token": old_token})
    assert response.status_code == 200
    new = response.get_json()
    assert new["session_token"] != old_token
    assert new["expires_at"] - new["issued_at"] == 3600
    with session_db() as db:
        assert stored_session(db, old_token).revoked
        assert session_tokens.validate_session(db, new["session_token"]).user_id == 1
    for url in ("/api/session/refresh", "/api/scans/owned/labels/list"):
        response = client.post(url, json={"session_token": old_token})
        assert response.status_code == 401
        assert response.get_json()["code"] == "SESSION_INVALID"


@pytest.mark.parametrize("url", ["/api/session/refresh", "/api/logout"])
@pytest.mark.parametrize("kind,code", [("invalid", "SESSION_INVALID"),
                                       ("expired", "SESSION_EXPIRED")])
def test_session_operations_reject_bad_tokens(client, issued, session_db, url, kind, code):
    token = issued["session_token"]
    if kind == "expired":
        expire(session_db, token)
    else:
        token = "invalid"
    response = client.post(url, json={"session_token": token})
    assert response.status_code == 401
    assert response.get_json()["code"] == code


def test_failed_renewal_keeps_old_token_active(client, issued, session_db, monkeypatch):
    def fail(*args):
        raise RuntimeError("Simulated session insert failure")

    monkeypatch.setattr(session_tokens, "create_session", fail)
    response = client.post("/api/session/refresh", json={
        "session_token": issued["session_token"]})
    assert response.status_code == 500
    with session_db() as db:
        assert session_tokens.validate_session(db, issued["session_token"]).user_id == 1


def test_logout_revokes_token(client, issued, session_db):
    data = {"session_token": issued["session_token"]}
    assert client.post("/api/logout", json=data).status_code == 200
    response = client.post("/api/scans/owned/labels/list", json=data)
    assert response.status_code == 401
    assert response.get_json()["code"] == "SESSION_INVALID"
