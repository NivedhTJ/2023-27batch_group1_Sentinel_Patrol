"""
Admin, Personnel, Suspect/Criminal & Digital Evidence routes for Sentinel Patrol.

Authorization model:
  - System Administrator (is_admin=True): Platform-level role. Independent of police rank.
    Can manage users, stations, audit logs, etc.
  - Operational police ranks (RANK_LEVELS): Kerala Police hierarchy. Unchanged.

Normal police officers (even high-ranking) CANNOT access /api/admin/* endpoints.
"""

from datetime import datetime, timezone
from typing import Optional, List
import os
import uuid
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import User, Station, Suspect, AuditLog, DigitalEvidence, Case, Incident
from auth import get_current_user, get_password_hash, require_admin, require_min_rank, RANK_LEVELS

admin_router = APIRouter(prefix="/api/admin", tags=["System Admin"])
personnel_router = APIRouter(prefix="/api/personnel", tags=["Personnel"])
suspect_router = APIRouter(prefix="/api/suspects", tags=["Suspects/Criminals"])
digital_evidence_router = APIRouter(prefix="/api/digital-evidence", tags=["Digital Evidence"])

# Upload directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# --- Pydantic Request Models ---

class UserCreate(BaseModel):
    badge_number: str
    name: str
    password: str
    role: str
    station_id: Optional[int] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_admin: bool = False
    joined_date: Optional[datetime] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    station_id: Optional[int] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    joined_date: Optional[datetime] = None

class ActivationUpdate(BaseModel):
    is_active: bool

class StationCreate(BaseModel):
    name: str
    district: str
    address: str
    phone: Optional[str] = None
    officer_in_charge: Optional[str] = None

class StationUpdate(BaseModel):
    name: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    officer_in_charge: Optional[str] = None
    is_active: Optional[bool] = None

class SuspectCreate(BaseModel):
    full_name: str
    alias: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    nationality: Optional[str] = "Indian"
    aadhaar_number: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    category: str = "Suspect"
    criminal_history: Optional[str] = None
    physical_description: Optional[str] = None
    is_wanted: bool = False
    is_arrested: bool = False
    linked_case_ids: Optional[str] = None

class SuspectUpdate(BaseModel):
    full_name: Optional[str] = None
    alias: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    aadhaar_number: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    category: Optional[str] = None
    criminal_history: Optional[str] = None
    physical_description: Optional[str] = None
    is_wanted: Optional[bool] = None
    is_arrested: Optional[bool] = None
    linked_case_ids: Optional[str] = None


# --- Helper: write audit log ---

def log_audit(
    session: Session,
    actor: User,
    action: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    detail: Optional[str] = None,
    request: Optional[Request] = None,
):
    ip = None
    if request:
        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    entry = AuditLog(
        actor_id=actor.id,
        actor_badge=actor.badge_number,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip,
    )
    session.add(entry)
    session.commit()


# ============================================================
# SYSTEM ADMINISTRATOR ROUTES  (/api/admin/*)
# All require is_admin=True.  Operational rank is irrelevant.
# ============================================================

@admin_router.get("/me")
async def admin_me(admin: User = Depends(require_admin)):
    return {
        "id": admin.id,
        "badge_number": admin.badge_number,
        "name": admin.name,
        "is_admin": admin.is_admin,
        "role": admin.role,
    }


# --- User / Personnel Management (Admin-only) ---

@admin_router.get("/users")
async def admin_list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    station_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User)).all()
    results = []
    for u in users:
        if search and search.lower() not in (u.name + " " + u.badge_number).lower():
            continue
        if role and u.role != role:
            continue
        if station_id is not None and u.station_id != station_id:
            continue
        if is_active is not None and u.is_active != is_active:
            continue
        results.append({
            "id": u.id,
            "badge_number": u.badge_number,
            "name": u.name,
            "role": u.role,
            "station_id": u.station_id,
            "department": u.department,
            "phone": u.phone,
            "email": u.email,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "joined_date": u.joined_date,
            "created_at": u.created_at,
        })
    return results


@admin_router.get("/users/{user_id}")
async def admin_get_user(
    user_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": u.id,
        "badge_number": u.badge_number,
        "name": u.name,
        "role": u.role,
        "station_id": u.station_id,
        "department": u.department,
        "phone": u.phone,
        "email": u.email,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "joined_date": u.joined_date,
        "created_at": u.created_at,
        "updated_at": u.updated_at,
    }


@admin_router.post("/users", status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    data: UserCreate,
    request: Request,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    all_roles = list(RANK_LEVELS.keys())
    if not data.is_admin and data.role not in all_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{data.role}'. Valid ranks: {', '.join(all_roles)}"
        )
    existing = session.exec(select(User).where(User.badge_number == data.badge_number)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Badge number '{data.badge_number}' already exists")

    new_user = User(
        badge_number=data.badge_number,
        name=data.name,
        password_hash=get_password_hash(data.password),
        role=data.role,
        station_id=data.station_id,
        department=data.department,
        phone=data.phone,
        email=data.email,
        is_admin=data.is_admin,
        is_active=True,
        joined_date=data.joined_date or datetime.now(timezone.utc),
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    log_audit(session, admin, "CREATE_USER", "User", new_user.id,
              f"Created user {new_user.badge_number} ({new_user.name}, {new_user.role})", request)
    return {"id": new_user.id, "badge_number": new_user.badge_number, "message": "User created successfully"}


@admin_router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    changed = []
    if data.name is not None:
        u.name = data.name; changed.append(f"name={data.name}")
    if data.role is not None:
        if data.role not in RANK_LEVELS:
            raise HTTPException(status_code=400, detail=f"Invalid role '{data.role}'")
        u.role = data.role; changed.append(f"role={data.role}")
    if data.station_id is not None:
        u.station_id = data.station_id; changed.append(f"station_id={data.station_id}")
    if data.department is not None:
        u.department = data.department
    if data.phone is not None:
        u.phone = data.phone
    if data.email is not None:
        u.email = data.email
    if data.is_admin is not None:
        u.is_admin = data.is_admin; changed.append(f"is_admin={data.is_admin}")
    if data.joined_date is not None:
        u.joined_date = data.joined_date
    u.updated_at = datetime.now(timezone.utc)
    session.add(u)
    session.commit()
    session.refresh(u)
    log_audit(session, admin, "UPDATE_USER", "User", u.id,
              f"Updated: {', '.join(changed)}", request)
    return {"message": "User updated", "id": u.id}


@admin_router.patch("/users/{user_id}/activation")
async def admin_toggle_activation(
    user_id: int,
    data: ActivationUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    u.is_active = data.is_active
    u.updated_at = datetime.now(timezone.utc)
    session.add(u)
    session.commit()
    action = "ACTIVATE_USER" if data.is_active else "DEACTIVATE_USER"
    log_audit(session, admin, action, "User", u.id,
              f"{'Activated' if data.is_active else 'Deactivated'} user {u.badge_number}", request)
    return {"message": f"User {'activated' if data.is_active else 'deactivated'}", "is_active": u.is_active}


@admin_router.patch("/users/{user_id}/rank")
async def admin_assign_rank(
    user_id: int,
    role: str = Query(..., description="New rank to assign"),
    request: Request = None,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    if role not in RANK_LEVELS:
        raise HTTPException(status_code=400, detail=f"Invalid rank '{role}'")
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = u.role
    u.role = role
    u.updated_at = datetime.now(timezone.utc)
    session.add(u)
    session.commit()
    log_audit(session, admin, "ASSIGN_RANK", "User", u.id,
              f"Rank changed from {old_role} to {role}", request)
    return {"message": f"Rank updated to {role}", "user_id": u.id}


@admin_router.patch("/users/{user_id}/station")
async def admin_assign_station(
    user_id: int,
    station_id: int = Query(...),
    request: Request = None,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    station = session.get(Station, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    u.station_id = station_id
    u.updated_at = datetime.now(timezone.utc)
    session.add(u)
    session.commit()
    log_audit(session, admin, "ASSIGN_STATION", "User", u.id,
              f"Assigned to station {station.name} (ID={station_id})", request)
    return {"message": f"User assigned to station {station.name}"}


# --- Station Management (Admin-only) ---

@admin_router.get("/stations")
async def admin_list_stations(
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    return session.exec(select(Station)).all()


@admin_router.post("/stations", status_code=status.HTTP_201_CREATED)
async def admin_create_station(
    data: StationCreate,
    request: Request,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    station = Station(**data.model_dump())
    session.add(station)
    session.commit()
    session.refresh(station)
    log_audit(session, admin, "CREATE_STATION", "Station", station.id,
              f"Created station {station.name} in {station.district}", request)
    return station


@admin_router.patch("/stations/{station_id}")
async def admin_update_station(
    station_id: int,
    data: StationUpdate,
    request: Request,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    s = session.get(Station, station_id)
    if not s:
        raise HTTPException(status_code=404, detail="Station not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(s, field, val)
    session.add(s)
    session.commit()
    log_audit(session, admin, "UPDATE_STATION", "Station", s.id, None, request)
    return s


# --- Audit Logs (Admin-only) ---

@admin_router.get("/audit-logs")
async def admin_audit_logs(
    limit: int = 100,
    offset: int = 0,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    logs = session.exec(
        select(AuditLog).order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    ).all()
    return logs


# --- System Stats (Admin-only) ---

@admin_router.get("/stats")
async def admin_stats(
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    total_users = len(session.exec(select(User)).all())
    active_users = len(session.exec(select(User).where(User.is_active == True)).all())
    total_stations = len(session.exec(select(Station)).all())
    total_suspects = len(session.exec(select(Suspect)).all())
    wanted = len(session.exec(select(Suspect).where(Suspect.is_wanted == True)).all())
    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users,
        "total_stations": total_stations,
        "total_suspects": total_suspects,
        "wanted_suspects": wanted,
    }


# ============================================================
# PERSONNEL ROUTES  (/api/personnel/*)
# Read: all logged-in officers; Write: admin only
# ============================================================

@personnel_router.get("/stations/list")
async def list_stations_public(
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    return session.exec(select(Station).where(Station.is_active == True)).all()


@personnel_router.get("")
async def list_personnel(
    search: Optional[str] = None,
    role: Optional[str] = None,
    station_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User)).all()
    results = []
    for u in users:
        if search and search.lower() not in (u.name + " " + u.badge_number).lower():
            continue
        if role and u.role != role:
            continue
        if station_id is not None and u.station_id != station_id:
            continue
        if is_active is not None and u.is_active != is_active:
            continue
        results.append({
            "id": u.id,
            "badge_number": u.badge_number,
            "name": u.name,
            "role": u.role,
            "station_id": u.station_id,
            "department": u.department,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "joined_date": u.joined_date,
        })
    return results


@personnel_router.get("/{user_id}")
async def get_personnel_by_id(
    user_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    u = session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Personnel not found")
    return {
        "id": u.id,
        "badge_number": u.badge_number,
        "name": u.name,
        "role": u.role,
        "station_id": u.station_id,
        "department": u.department,
        "phone": u.phone,
        "email": u.email,
        "is_admin": u.is_admin,
        "is_active": u.is_active,
        "joined_date": u.joined_date,
        "created_at": u.created_at,
    }


# ============================================================
# SUSPECT / CRIMINAL ROUTES  (/api/suspects/*)
# View: Constable+; Create/Edit: Sub-Inspector+
# ============================================================

@suspect_router.get("")
async def list_suspects(
    search: Optional[str] = None,
    category: Optional[str] = None,
    district: Optional[str] = None,
    is_wanted: Optional[bool] = None,
    is_arrested: Optional[bool] = None,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    suspects = session.exec(select(Suspect)).all()
    results = []
    for s in suspects:
        if search and search.lower() not in (s.full_name + " " + (s.alias or "")).lower():
            continue
        if category and s.category != category:
            continue
        if district and s.district != district:
            continue
        if is_wanted is not None and s.is_wanted != is_wanted:
            continue
        if is_arrested is not None and s.is_arrested != is_arrested:
            continue
        results.append(s)
    return results


@suspect_router.get("/{suspect_id}")
async def get_suspect(
    suspect_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    s = session.get(Suspect, suspect_id)
    if not s:
        raise HTTPException(status_code=404, detail="Suspect not found")
    return s


@suspect_router.post("", status_code=status.HTTP_201_CREATED)
async def create_suspect(
    data: SuspectCreate,
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session),
):
    suspect = Suspect(**data.model_dump(), registered_by=current_user.id)
    session.add(suspect)
    session.commit()
    session.refresh(suspect)
    return suspect


@suspect_router.patch("/{suspect_id}")
async def update_suspect(
    suspect_id: int,
    data: SuspectUpdate,
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session),
):
    s = session.get(Suspect, suspect_id)
    if not s:
        raise HTTPException(status_code=404, detail="Suspect not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(s, field, val)
    s.updated_at = datetime.now(timezone.utc)
    session.add(s)
    session.commit()
    session.refresh(s)
    return s


@suspect_router.patch("/{suspect_id}/link-case")
async def link_case_to_suspect(
    suspect_id: int,
    case_id: int = Query(...),
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session),
):
    s = session.get(Suspect, suspect_id)
    if not s:
        raise HTTPException(status_code=404, detail="Suspect not found")
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    existing_ids = [x.strip() for x in s.linked_case_ids.split(",") if x.strip()] if s.linked_case_ids else []
    if str(case_id) not in existing_ids:
        existing_ids.append(str(case_id))
    s.linked_case_ids = ",".join(existing_ids)
    s.updated_at = datetime.now(timezone.utc)
    session.add(s)
    session.commit()
    return {"message": f"Case {case_id} linked to suspect {suspect_id}", "linked_case_ids": s.linked_case_ids}


@suspect_router.get("/{suspect_id}/cases")
async def get_suspect_cases(
    suspect_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    s = session.get(Suspect, suspect_id)
    if not s:
        raise HTTPException(status_code=404, detail="Suspect not found")
    if not s.linked_case_ids:
        return []
    ids = [int(x.strip()) for x in s.linked_case_ids.split(",") if x.strip()]
    return [session.get(Case, cid) for cid in ids if session.get(Case, cid)]


# ============================================================
# DIGITAL EVIDENCE ROUTES  (/api/digital-evidence/*)
# Upload files with SHA-256 integrity hashing.
# ============================================================

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/quicktime", "video/x-msvideo",
    "audio/mpeg", "audio/wav", "audio/ogg",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


def detect_category(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "Photo"
    if mime_type.startswith("video/"):
        return "Video"
    if mime_type.startswith("audio/"):
        return "Audio"
    return "Document"


@digital_evidence_router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_digital_evidence(
    case_id: int = Form(...),
    description: str = Form(""),
    is_sensitive: bool = Form(False),
    file: UploadFile = File(...),
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"File type '{mime}' not allowed.")

    contents = await file.read()
    size = len(contents)
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 100 MB limit")
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file not allowed")

    ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    sha256 = hashlib.sha256(contents).hexdigest()
    category = detect_category(mime)

    file_path = os.path.join(UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    record = DigitalEvidence(
        case_id=case_id,
        original_filename=file.filename or stored_name,
        stored_filename=stored_name,
        file_size_bytes=size,
        mime_type=mime,
        category=category,
        description=description or None,
        hash_sha256=sha256,
        uploaded_by=current_user.id,
        is_sensitive=is_sensitive,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return {
        "id": record.id,
        "original_filename": record.original_filename,
        "category": record.category,
        "file_size_bytes": record.file_size_bytes,
        "hash_sha256": record.hash_sha256,
        "uploaded_at": record.uploaded_at,
        "message": "File uploaded and hashed successfully",
    }


@digital_evidence_router.get("/case/{case_id}")
async def list_digital_evidence_for_case(
    case_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return session.exec(select(DigitalEvidence).where(DigitalEvidence.case_id == case_id)).all()


@digital_evidence_router.get("/{evidence_id}")
async def get_digital_evidence(
    evidence_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session),
):
    item = session.get(DigitalEvidence, evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Digital evidence not found")
    return item


@digital_evidence_router.delete("/{evidence_id}")
async def delete_digital_evidence(
    evidence_id: int,
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session),
):
    item = session.get(DigitalEvidence, evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Digital evidence not found")
    file_path = os.path.join(UPLOAD_DIR, item.stored_filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    session.delete(item)
    session.commit()
    return {"message": "Digital evidence deleted"}
