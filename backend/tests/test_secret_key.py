"""Tests for app._require_secret_key() startup validation."""
import pytest

from app import _require_secret_key


def test_require_secret_key_returns_value(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a-real-secret")

    assert _require_secret_key() == "a-real-secret"


def test_require_secret_key_missing(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)

    with pytest.raises(RuntimeError, match="SECRET_KEY is not set"):
        _require_secret_key()


@pytest.mark.parametrize("value", ["", "   "])
def test_require_secret_key_blank(monkeypatch, value):
    monkeypatch.setenv("SECRET_KEY", value)

    with pytest.raises(RuntimeError, match="SECRET_KEY is not set"):
        _require_secret_key()
