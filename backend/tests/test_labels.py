from unittest.mock import MagicMock, patch

from models import Dicom, Label


def _session(mock_connect):
    session = MagicMock()
    mock_connect.return_value.__enter__.return_value = session
    return session


def test_create_label_requires_three_coordinates(client):
    response = client.post(
        "/api/scans/scan-1/labels",
        json={"name": "Femur", "coordinates": {"x": 1, "y": 2}},
    )

    assert response.status_code == 400
    assert "x, y, and z" in response.get_json()["error"]


@patch("app.connect")
def test_create_label_stores_scan_and_coordinates(mock_connect, client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Dicom(
        upload_id="scan-1", user_id=1
    )
    session.add.side_effect = lambda label: setattr(label, "label_id", 7)

    response = client.post(
        "/api/scans/scan-1/labels",
        json={
            "name": "Femur head",
            "description": "Reference point",
            "coordinates": {"x": 1, "y": 2.5, "z": -3},
            "body_part_id": "femur",
            "scan_2d_id": "slice-4",
        },
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["label_id"] == 7
    assert body["scan_id"] == "scan-1"
    assert body["coordinates"] == {"x": 1.0, "y": 2.5, "z": -3.0}
    assert body["scan_3d_id"] == "scan-1"


@patch("app.connect")
def test_list_labels_is_scoped_to_scan(mock_connect, client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.all.return_value = [
        Label(
            label_id=3,
            name="Tibia",
            description="Landmark",
            x=4,
            y=5,
            z=6,
            scan_id="scan-2",
            visible=True,
        )
    ]

    response = client.get("/api/scans/scan-2/labels")

    assert response.status_code == 200
    assert response.get_json()["scan_id"] == "scan-2"
    assert response.get_json()["labels"][0]["name"] == "Tibia"


@patch("app.connect")
def test_toggle_label_changes_visibility(mock_connect, client):
    session = _session(mock_connect)
    session.query.return_value.filter_by.return_value.first.return_value = Label(
        label_id=4,
        name="Patella",
        description="Landmark",
        x=1,
        y=2,
        z=3,
        scan_id="scan-3",
        visible=True,
    )

    response = client.patch("/api/scans/scan-3/labels/4/toggle")

    assert response.status_code == 200
    assert response.get_json()["visible"] is False