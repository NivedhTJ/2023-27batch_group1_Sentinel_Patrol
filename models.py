from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Station(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    district: str
    address: str
    phone: Optional[str] = None
    officer_in_charge: Optional[str] = None
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    badge_number: str = Field(sa_column_kwargs={"unique": True}, index=True)
    name: str
    password_hash: str
    role: str  # Kerala Police operational rank (e.g. "Constable", "Sub-Inspector", etc.)
    station_id: Optional[int] = Field(default=None, foreign_key="station.id")
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_admin: bool = Field(default=False)   # Platform-level System Administrator (NOT a police rank)
    is_active: bool = Field(default=True)
    joined_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


class DigitalEvidence(SQLModel, table=True):
    """Digital files uploaded as evidence — separate from textual Evidence records."""
    id: Optional[int] = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id")
    original_filename: str
    stored_filename: str          # UUID-based safe filename on disk
    file_size_bytes: int
    mime_type: str
    category: str                 # "Photo" | "Video" | "Audio" | "Document" | "Other"
    description: Optional[str] = None
    hash_sha256: Optional[str] = None  # integrity fingerprint
    uploaded_by: int = Field(foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_sensitive: bool = Field(default=False)


class Suspect(SQLModel, table=True):
    """Criminal / Suspect registry."""
    id: Optional[int] = Field(default=None, primary_key=True)
    full_name: str
    alias: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None          # "Male" | "Female" | "Other"
    nationality: Optional[str] = Field(default="Indian")
    aadhaar_number: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    category: str = Field(default="Suspect")  # "Suspect" | "Criminal" | "Wanted" | "Released"
    criminal_history: Optional[str] = None
    physical_description: Optional[str] = None
    photo_filename: Optional[str] = None
    is_wanted: bool = Field(default=False)
    is_arrested: bool = Field(default=False)
    registered_by: int = Field(foreign_key="user.id")
    linked_case_ids: Optional[str] = None   # comma-separated case IDs "1,2,3"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AuditLog(SQLModel, table=True):
    """Platform-level audit trail for admin actions."""
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: int = Field(foreign_key="user.id")
    actor_badge: str
    action: str            # e.g. "CREATE_USER", "DEACTIVATE_USER", "UPDATE_RANK"
    resource_type: str     # e.g. "User", "Station", "Suspect"
    resource_id: Optional[int] = None
    detail: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
