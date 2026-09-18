from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    badge_number: str = Field(sa_column_kwargs={"unique": True}, index=True)
    name: str
    password_hash: str
    role: str  # "Station Officer" or "Field Officer"
    station_id: int

class Incident(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str
    latitude: float
    longitude: float
    district: str
    status: str
    reported_by: int = Field(foreign_key="user.id")

class Case(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str
    status: str = Field(default="Open")  # "Open" | "Under Investigation" | "Closed"
    incident_id: int = Field(foreign_key="incident.id")
    assigned_officer_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Evidence(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id")
    description: str
    evidence_type: str  # "Physical" | "Digital" | "Testimonial" | "Document"
    collected_by: int = Field(foreign_key="user.id")
    collected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

