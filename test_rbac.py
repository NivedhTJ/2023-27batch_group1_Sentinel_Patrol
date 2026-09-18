from fastapi import HTTPException, status
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from main import app
from database import get_session
from models import User, Incident
from auth import (
    RANK_LEVELS,
    get_password_hash,
    create_access_token,
    require_min_rank,
    require_oversight_access
)

# Setup in-memory database for testing
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

def get_test_session():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_test_session

client = TestClient(app)

def test_rank_levels_ordering():
    """Verify RANK_LEVELS dictionary order across all 12 ranks."""
    expected_order = [
        "Constable",
        "Head Constable",
        "Assistant Sub-Inspector",
        "Sub-Inspector",
        "Circle Inspector",
        "Deputy Superintendent of Police",
        "Superintendent of Police",
        "Deputy Inspector General",
        "Inspector General of Police",
        "Additional Director General of Police",
        "Director General of Police",
        "Home Minister"
    ]
    assert len(RANK_LEVELS) == 12
    for idx, rank in enumerate(expected_order, start=1):
        assert RANK_LEVELS[rank] == idx, f"Rank {rank} has level {RANK_LEVELS.get(rank)}, expected {idx}"

    # Test require_min_rank ordering for all pairs
    for r_req, level_req in RANK_LEVELS.items():
        checker = require_min_rank(r_req)
        for r_user, level_user in RANK_LEVELS.items():
            test_user = User(badge_number="TEST", name="Test User", password_hash="", role=r_user, station_id=101)
            if level_user >= level_req:
                res = checker(test_user)
                assert res == test_user
            else:
                raised = False
                try:
                    checker(test_user)
                except HTTPException as exc:
                    raised = True
                    assert exc.status_code == status.HTTP_403_FORBIDDEN
                    assert f"Requires rank of {r_req} or above" in exc.detail
                assert raised, f"Expected 403 when user rank {r_user} tries min rank {r_req}"

def test_oversight_access_dependency():
    """Verify require_oversight_access admits Level >= 7 and rejects Level <= 6."""
    for rank, level in RANK_LEVELS.items():
        test_user = User(badge_number="TEST", name="Test User", password_hash="", role=rank, station_id=101)
        if level >= 7:
            res = require_oversight_access(test_user)
            assert res == test_user
        else:
            raised = False
            try:
                require_oversight_access(test_user)
            except HTTPException as exc:
                raised = True
                assert exc.status_code == status.HTTP_403_FORBIDDEN
                assert "Requires rank of Superintendent of Police or above" in exc.detail
            assert raised, f"Expected 403 when rank {rank} (level {level}) accesses oversight"

def test_endpoint_rbac_permissions():
    """
    Integration test:
    - Constable gets 403 on POST /api/cases
    - Sub-Inspector gets 201 on POST /api/cases
    - GET /api/incidents is unauthenticated (200)
    """
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Create users
        constable = User(
            badge_number="CONST-01",
            name="Constable Alex",
            password_hash=get_password_hash("pass123"),
            role="Constable",
            station_id=101
        )
        si = User(
            badge_number="SI-01",
            name="Sub-Inspector Ben",
            password_hash=get_password_hash("pass123"),
            role="Sub-Inspector",
            station_id=101
        )
        session.add(constable)
        session.add(si)
        session.commit()
        session.refresh(constable)
        session.refresh(si)
        constable_id = constable.id
        si_id = si.id

        # Create sample incident
        incident = Incident(
            title="Test Incident",
            description="Sample description",
            latitude=10.0,
            longitude=76.0,
            district="Ernakulam",
            status="Open",
            reported_by=constable_id
        )
        session.add(incident)
        session.commit()
        session.refresh(incident)
        incident_id = incident.id

    constable_token = create_access_token(data={"sub": "CONST-01"})
    si_token = create_access_token(data={"sub": "SI-01"})

    # 1. Unauthenticated GET /api/incidents should succeed (200)
    res = client.get("/api/incidents")
    assert res.status_code == 200, f"Expected 200 for unauthenticated GET /api/incidents, got {res.status_code}"

    # 2. Constable POST /api/cases should fail with 403 Forbidden
    res = client.post(
        "/api/cases",
        json={
            "title": "Constable Case",
            "description": "Unauthorized attempt",
            "incident_id": incident_id,
            "assigned_officer_id": constable_id
        },
        headers={"Authorization": f"Bearer {constable_token}"}
    )
    assert res.status_code == 403, res.text
    assert "Requires rank of Sub-Inspector or above" in res.json()["detail"]

    # 3. Sub-Inspector POST /api/cases should succeed with 201 Created
    res = client.post(
        "/api/cases",
        json={
            "title": "Sub-Inspector Case",
            "description": "Authorized case creation",
            "incident_id": incident_id,
            "assigned_officer_id": si_id
        },
        headers={"Authorization": f"Bearer {si_token}"}
    )
    assert res.status_code == 201, res.text
    assert res.json()["title"] == "Sub-Inspector Case"

    print("ALL RBAC TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_rank_levels_ordering()
    test_oversight_access_dependency()
    test_endpoint_rbac_permissions()
