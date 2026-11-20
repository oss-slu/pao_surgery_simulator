from unittest.mock import MagicMock, patch

from models import Dicom, ScanHistory


def _session(mock_connect):
    session = MagicMock()
    mock_connect.return_value.__enter__.return_value = session
    return session


def _sample_actions():
    return [
        {
            "type": "cut",
            "start": [0, 0, 0],
            "end": [10, 0, 0],
            "depthDirection": [0, 0, -1],
            "thickness": 3,
            "emptyValue": -1000,
        },
        {
            "type": "markerStroke",
            "strokeId": "stroke-1",
            "color": "#ff0000",
            "points": [[1, 2, 3], [4, 5, 6]],
            "markers": [
                {
                    "id": "marker-1",
                    "strokeId": "stroke-1",
                    "coordinates": {"x": 1, "y": 2, "z": 3},
                    "color": "#ff0000",
                },
                {
                    "id": "marker-2",
                    "strokeId": "stroke-1",
                    "coordinates": {"x": 4, "y": 5, "z": 6},
                    "color": "#ff0000",
                },
            ],
        },
    ]


@patch("app.connect")
def test_get_history_returns_empty_document_when_missing(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.side_effect = [
        Dicom(upload_id="scan-1", user_id=1),
        None,
    ]

    response = authenticated_client.get("/api/scans/scan-1/history")

    assert response.status_code == 200
    assert response.get_json() == {
        "scan_id": "scan-1",
        "revision": 0,
        "cursor": 0,
        "actions": [],
    }


@patch("app.connect")
def test_put_history_round_trip_preserves_cursor_and_redo_tail(
    mock_connect, authenticated_client
):
    session = _session(mock_connect)
    actions = _sample_actions()
    stored = {}

    def query_side_effect(model):
        query = MagicMock()
        if model is Dicom:
            query.filter_by.return_value.first.return_value = Dicom(
                upload_id="scan-1", user_id=1
            )
        elif model is ScanHistory:
            query.filter_by.return_value.first.return_value = stored.get("history")
        return query

    session.query.side_effect = query_side_effect
    session.add.side_effect = lambda history: stored.__setitem__("history", history)

    put_response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={"revision": 0, "cursor": 1, "actions": actions},
    )
    assert put_response.status_code == 200
    put_body = put_response.get_json()
    assert put_body["revision"] == 1
    assert put_body["cursor"] == 1
    assert put_body["actions"] == actions
    assert put_body["cursor"] < len(put_body["actions"])

    get_response = authenticated_client.get("/api/scans/scan-1/history")
    assert get_response.status_code == 200
    get_body = get_response.get_json()
    assert get_body["revision"] == 1
    assert get_body["cursor"] == 1
    assert get_body["actions"] == actions


@patch("app.connect")
def test_put_history_rejects_stale_revision(mock_connect, authenticated_client):
    session = _session(mock_connect)
    existing = ScanHistory(
        scan_id="scan-1",
        revision=2,
        cursor=1,
        actions=_sample_actions()[:1],
    )

    def query_side_effect(model):
        query = MagicMock()
        if model is Dicom:
            query.filter_by.return_value.first.return_value = Dicom(
                upload_id="scan-1", user_id=1
            )
        else:
            query.filter_by.return_value.first.return_value = existing
        return query

    session.query.side_effect = query_side_effect

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={"revision": 1, "cursor": 0, "actions": []},
    )

    assert response.status_code == 409
    body = response.get_json()
    assert body["code"] == "REVISION_CONFLICT"
    assert body["revision"] == 2
    assert body["cursor"] == 1
    assert body["actions"] == existing.actions
    session.add.assert_not_called()


@patch("app.connect")
def test_put_history_rejects_unknown_action_type(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={
            "revision": 0,
            "cursor": 1,
            "actions": [{"type": "paint", "value": 1}],
        },
    )

    assert response.status_code == 400
    assert "cut" in response.get_json()["error"]
    session.add.assert_not_called()


@patch("app.connect")
def test_put_history_rejects_bad_cut_geometry(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={
            "revision": 0,
            "cursor": 1,
            "actions": [
                {
                    "type": "cut",
                    "start": [0, 0],
                    "end": [1, 0, 0],
                    "depthDirection": [0, 0, -1],
                    "thickness": 2,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert "start" in response.get_json()["error"]
    session.add.assert_not_called()


@patch("app.connect")
def test_put_history_rejects_nonpositive_thickness(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={
            "revision": 0,
            "cursor": 1,
            "actions": [
                {
                    "type": "cut",
                    "start": [0, 0, 0],
                    "end": [1, 0, 0],
                    "depthDirection": [0, 0, -1],
                    "thickness": 0,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert "thickness" in response.get_json()["error"]
    session.add.assert_not_called()


@patch("app.connect")
def test_put_history_rejects_cursor_out_of_range(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={"revision": 0, "cursor": 2, "actions": _sample_actions()[:1]},
    )

    assert response.status_code == 400
    assert "cursor" in response.get_json()["error"]
    session.add.assert_not_called()


@patch("app.connect")
def test_put_history_rejects_non_list_actions(mock_connect, authenticated_client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )

    response = authenticated_client.put(
        "/api/scans/scan-1/history",
        json={"revision": 0, "cursor": 0, "actions": {"type": "cut"}},
    )

    assert response.status_code == 400
    assert "actions must be a list" in response.get_json()["error"]
    session.add.assert_not_called()
