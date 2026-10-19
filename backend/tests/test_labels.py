"""Label behavior with valid sessions and database-backed scan ownership."""
from models import Label


def test_create_label_requires_three_coordinates(authenticated_client):
    authenticated_client.add_scan("scan-1")
    response = authenticated_client.post(
        "/api/scans/scan-1/labels",
        json={"session_token": authenticated_client.session_token,
              "name": "Femur", "coordinates": {"x": 1, "y": 2}},
    )
    assert response.status_code == 400
    assert "x, y, and z" in response.get_json()["error"]


def test_create_label_stores_scan_and_coordinates(authenticated_client):
    authenticated_client.add_scan("scan-1")
    response = authenticated_client.post(
        "/api/scans/scan-1/labels",
        json={"session_token": authenticated_client.session_token,
              "name": "Femur head", "description": "Reference point",
              "coordinates": {"x": 1, "y": 2.5, "z": -3},
              "body_part_id": "femur", "scan_2d_id": "slice-4"},
    )
    assert response.status_code == 201
    body = response.get_json()
    assert isinstance(body["label_id"], int)
    assert body["scan_id"] == "scan-1"
    assert body["coordinates"] == {"x": 1.0, "y": 2.5, "z": -3.0}
    assert body["scan_3d_id"] == "scan-1"
    with authenticated_client.session_db() as db:
        stored = db.get(Label, body["label_id"])
        assert stored.name == "Femur head"
        assert stored.scan_id == "scan-1"
        assert (stored.x, stored.y, stored.z) == (1, 2.5, -3)


def test_list_labels_is_scoped_to_scan(authenticated_client):
    authenticated_client.add_scan("scan-2")
    authenticated_client.add_scan("another-scan")
    with authenticated_client.session_db() as db:
        db.add_all([
            Label(name="Tibia", description="Landmark", x=4, y=5, z=6,
                  scan_id="scan-2", visible=True),
            Label(name="Other label", x=0, y=0, z=0,
                  scan_id="another-scan", visible=True),
        ])
    response = authenticated_client.get("/api/scans/scan-2/labels")
    assert response.status_code == 200
    assert response.get_json()["scan_id"] == "scan-2"
    assert [label["name"] for label in response.get_json()["labels"]] == ["Tibia"]


def test_toggle_label_changes_visibility(authenticated_client):
    authenticated_client.add_scan("scan-3")
    with authenticated_client.session_db() as db:
        label = Label(name="Patella", description="Landmark", x=1, y=2, z=3,
                      scan_id="scan-3", visible=True)
        db.add(label)
        db.flush()
        label_id = label.label_id
    response = authenticated_client.patch(
        f"/api/scans/scan-3/labels/{label_id}/toggle",
        json={"session_token": authenticated_client.session_token},
    )
    assert response.status_code == 200
    assert response.get_json()["visible"] is False
    with authenticated_client.session_db() as db:
        assert db.get(Label, label_id).visible is False
