"""Tests for db.initialize_db() startup schema upgrade.

db.engine is patched so these never need Postgres.
"""
from unittest.mock import patch

import db


def _executed_sql(mock_conn):
    return [str(call.args[0]) for call in mock_conn.execute.call_args_list]


@patch("db.Base.metadata.create_all")
@patch("db.engine")
def test_initialize_db_adds_user_verified_column(mock_engine, mock_create_all):
    begin_conn = mock_engine.begin.return_value.__enter__.return_value

    assert db.initialize_db() is True

    mock_create_all.assert_called_once_with(bind=mock_engine)
    assert _executed_sql(begin_conn) == [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_verified BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE users ALTER COLUMN user_verified SET DEFAULT false",
    ]


@patch("db.Base.metadata.create_all")
@patch("db.engine")
def test_initialize_db_returns_false_when_alter_fails(mock_engine, mock_create_all):
    begin_conn = mock_engine.begin.return_value.__enter__.return_value
    begin_conn.execute.side_effect = Exception("permission denied for table users")

    assert db.initialize_db() is False
