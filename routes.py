from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlmodel import Session, select
from typing import Optional, List, Dict
import logging

from database import get_session
from models import User, Incident, Case, Evidence
from auth import get_current_user, verify_password, create_access_token, require_min_rank
from ai_engine import collection, index_incidents_to_vectorstore, query_local_llm

router = APIRouter()
logger = logging.getLogger("sentinel_patrol.routes")

# --- Request/Response Validation Models ---
class LoginRequest(BaseModel):
    badge_number: str
    password: str

class IncidentCreate(BaseModel):
    title: str
    description: str
    latitude: float
    longitude: float
    district: str

class IncidentStatusUpdate(BaseModel):
    status: str

class CaseCreate(BaseModel):
    title: str
    description: str
    incident_id: int
    assigned_officer_id: int
    status: Optional[str] = "Open"

class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_officer_id: Optional[int] = None

class EvidenceCreate(BaseModel):
    case_id: int
    description: str
    evidence_type: str
    collected_by: Optional[int] = None

class AIQueryRequest(BaseModel):
    question: str

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        # Maps officer_id to WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WebSocket client {client_id} connected.")

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"WebSocket client {client_id} disconnected.")

    async def broadcast(self, message: dict):
        for client_id, connection in list(self.active_connections.items()):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to broadcast to {client_id}: {e}")
                self.disconnect(client_id)

manager = ConnectionManager()

# --- Authentication Endpoint ---
@router.post("/api/auth/login")
async def login(data: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.badge_number == data.badge_number)).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid badge number or password"
        )
    
    token = create_access_token(data={"sub": user.badge_number})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "badge_number": user.badge_number,
            "name": user.name,
            "role": user.role,
            "station_id": user.station_id
        }
    }

# --- Incident Endpoints ---
@router.post("/api/incidents", status_code=status.HTTP_201_CREATED)
async def create_incident(
    data: IncidentCreate,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    incident = Incident(
        title=data.title,
        description=data.description,
        latitude=data.latitude,
        longitude=data.longitude,
        district=data.district,
        status="Open",
        reported_by=current_user.id
    )
    session.add(incident)
    session.commit()
    session.refresh(incident)
    return incident

@router.get("/api/incidents")
async def list_incidents(
    district: Optional[str] = None,
    session: Session = Depends(get_session)
):
    query = select(Incident)
    if district:
        query = query.where(Incident.district == district)
    
    incidents = session.exec(query).all()
    return incidents

@router.patch("/api/incidents/{id}")
async def update_incident_status(
    id: int,
    data: IncidentStatusUpdate,
    current_user: User = Depends(require_min_rank("Assistant Sub-Inspector")),
    session: Session = Depends(get_session)
):
    incident = session.get(Incident, id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {id} not found"
        )
    allowed_statuses = ["Open", "Investigating", "Closed"]
    if data.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{data.status}'. Allowed values are: {', '.join(allowed_statuses)}"
        )
    incident.status = data.status
    session.add(incident)
    session.commit()
    session.refresh(incident)
    return incident

# --- Case Endpoints ---
@router.post("/api/cases", status_code=status.HTTP_201_CREATED)
async def create_case(
    data: CaseCreate,
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session)
):
    incident = session.get(Incident, data.incident_id)
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {data.incident_id} not found"
        )
    assigned_officer = session.get(User, data.assigned_officer_id)
    if not assigned_officer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {data.assigned_officer_id} not found"
        )

    allowed_statuses = ["Open", "Under Investigation", "Closed"]
    case_status = data.status or "Open"
    if case_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{case_status}'. Allowed values are: {', '.join(allowed_statuses)}"
        )

    case_obj = Case(
        title=data.title,
        description=data.description,
        status=case_status,
        incident_id=data.incident_id,
        assigned_officer_id=data.assigned_officer_id,
        created_at=datetime.now(timezone.utc)
    )
    session.add(case_obj)
    session.commit()
    session.refresh(case_obj)
    return case_obj

@router.get("/api/cases")
async def list_cases(
    status_filter: Optional[str] = None,
    incident_id: Optional[int] = None,
    assigned_officer_id: Optional[int] = None,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    query = select(Case)
    if status_filter:
        query = query.where(Case.status == status_filter)
    if incident_id:
        query = query.where(Case.incident_id == incident_id)
    if assigned_officer_id:
        query = query.where(Case.assigned_officer_id == assigned_officer_id)
    
    cases = session.exec(query).all()
    return cases

@router.get("/api/cases/{case_id}")
async def get_case(
    case_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    case_obj = session.get(Case, case_id)
    if not case_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with id {case_id} not found"
        )
    evidence_items = session.exec(select(Evidence).where(Evidence.case_id == case_id)).all()
    return {
        "case": case_obj,
        "evidence": evidence_items
    }

@router.patch("/api/cases/{case_id}")
async def update_case(
    case_id: int,
    data: CaseUpdate,
    current_user: User = Depends(require_min_rank("Sub-Inspector")),
    session: Session = Depends(get_session)
):
    case_obj = session.get(Case, case_id)
    if not case_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with id {case_id} not found"
        )
    if data.title is not None:
        case_obj.title = data.title
    if data.description is not None:
        case_obj.description = data.description
    if data.status is not None:
        allowed_statuses = ["Open", "Under Investigation", "Closed"]
        if data.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status '{data.status}'. Allowed values are: {', '.join(allowed_statuses)}"
            )
        case_obj.status = data.status
    if data.assigned_officer_id is not None:
        officer = session.get(User, data.assigned_officer_id)
        if not officer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with id {data.assigned_officer_id} not found"
            )
        case_obj.assigned_officer_id = data.assigned_officer_id
    
    session.add(case_obj)
    session.commit()
    session.refresh(case_obj)
    return case_obj

# --- Evidence Endpoints ---
@router.post("/api/evidence", status_code=status.HTTP_201_CREATED)
async def create_evidence(
    data: EvidenceCreate,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    case_obj = session.get(Case, data.case_id)
    if not case_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with id {data.case_id} not found"
        )
    
    allowed_types = ["Physical", "Digital", "Testimonial", "Document"]
    if data.evidence_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid evidence_type '{data.evidence_type}'. Allowed values are: {', '.join(allowed_types)}"
        )

    collected_by_id = data.collected_by if data.collected_by is not None else current_user.id
    collector = session.get(User, collected_by_id)
    if not collector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {collected_by_id} not found"
        )

    evidence_obj = Evidence(
        case_id=data.case_id,
        description=data.description,
        evidence_type=data.evidence_type,
        collected_by=collected_by_id,
        collected_at=datetime.now(timezone.utc)
    )
    session.add(evidence_obj)
    session.commit()
    session.refresh(evidence_obj)
    return evidence_obj

@router.get("/api/evidence")
async def list_evidence(
    case_id: Optional[int] = None,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    query = select(Evidence)
    if case_id:
        query = query.where(Evidence.case_id == case_id)
    evidence_items = session.exec(query).all()
    return evidence_items

@router.get("/api/cases/{case_id}/evidence")
async def list_case_evidence(
    case_id: int,
    current_user: User = Depends(require_min_rank("Constable")),
    session: Session = Depends(get_session)
):
    case_obj = session.get(Case, case_id)
    if not case_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Case with id {case_id} not found"
        )
    evidence_items = session.exec(select(Evidence).where(Evidence.case_id == case_id)).all()
    return evidence_items


# --- Real-Time WebSocket Patrol Location ---
@router.websocket("/ws/patrol/{officer_id}")
async def websocket_patrol(websocket: WebSocket, officer_id: str):
    await manager.connect(officer_id, websocket)
    try:
        while True:
            # Expecting coordinate payload: {"lat": float, "lng": float}
            data = await websocket.receive_json()
            print(f"[WS Update] Officer {officer_id} Location: lat={data.get('lat')}, lng={data.get('lng')}")
            
            # Broadcast the coordinate update to all listening clients (e.g. dashboards)
            broadcast_payload = {
                "officer_id": officer_id,
                "lat": data.get("lat"),
                "lng": data.get("lng"),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            await manager.broadcast(broadcast_payload)
    except WebSocketDisconnect:
        manager.disconnect(officer_id)
        print(f"[WS Disconnect] Officer {officer_id} disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error on connection {officer_id}: {e}")
        manager.disconnect(officer_id)

# --- Local AI Assistant Endpoints ---
@router.post("/api/ai/sync-index")
async def sync_index(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """
    Sync MySQL incidents into the local ChromaDB vector store.
    """
    try:
        index_incidents_to_vectorstore(session)
        return {"message": "Vector index updated successfully"}
    except Exception as e:
        logger.error(f"Error indexing incidents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to sync incidents to vector store."
        )

@router.post("/api/ai/query")
async def query_ai(
    data: AIQueryRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Query the AI assistant which retrieves context from ChromaDB and generates an answer using local Ollama.
    """
    # 1. Query ChromaDB for top 3 relevant incident context snippets
    try:
        results = collection.query(
            query_texts=[data.question],
            n_results=3
        )
    except Exception as e:
        logger.error(f"ChromaDB query error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to query vector database."
        )

    # Extract matching document summaries
    documents = results.get("documents", [[]])[0]
    context_str = "\n\n".join(documents)

    # Extract corresponding metadata dicts to return to caller
    retrieved_incidents = []
    metadatas = results.get("metadatas", [[]])[0]
    for meta in metadatas:
        if meta:
            retrieved_incidents.append(meta)

    # 2. Query Ollama and handle connection exceptions
    try:
        answer = await query_local_llm(data.question, context_str)
    except (httpx.ConnectError, httpx.HTTPError, httpx.TimeoutException) as e:
        logger.error(f"Ollama connection error: {e}")
        raise HTTPException(
            status_code=status.HTTP_533_SERVICE_UNAVAILABLE if hasattr(e, 'status_code') and getattr(e, 'status_code') == 503 else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ollama service unavailable. Please run 'ollama serve' on your host machine."
        )
    except Exception as e:
        logger.error(f"Unexpected LLM query error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while generating the answer."
        )

    return {
        "answer": answer,
        "retrieved_incidents": retrieved_incidents
    }
