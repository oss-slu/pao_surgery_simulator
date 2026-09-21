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
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client