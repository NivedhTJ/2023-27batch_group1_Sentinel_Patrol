import httpx
import chromadb
from sqlmodel import select
from models import Incident

# Initialize a persistent local ChromaDB client storing data in "./chroma_db"
chroma_client = chromadb.PersistentClient(path="./chroma_db")

# Get or create the collection for Kerala incidents
collection = chroma_client.get_or_create_collection(name="kerala_incidents")

def index_incidents_to_vectorstore(db_session):
    """
    Query all Incident records from MySQL, format them into plain-text summaries,
    and upsert them into the ChromaDB collection.
    """
    incidents = db_session.exec(select(Incident)).all()
    
    if not incidents:
        return
        
    ids = []
    documents = []
    metadatas = []
    
    for inc in incidents:
        ids.append(str(inc.id))
        
        # Format incident into a descriptive plain-text summary
        summary = (
            f"Incident ID: {inc.id} | "
            f"Title: {inc.title} | "
            f"District: {inc.district} | "
            f"Location: (lat={inc.latitude}, lng={inc.longitude}) | "
            f"Status: {inc.status} | "
            f"Description: {inc.description}"
        )
        documents.append(summary)
        
        # Store metadata attributes to return later or use for filtering
        metadatas.append({
            "id": inc.id,
            "title": inc.title,
            "description": inc.description,
            "latitude": inc.latitude,
            "longitude": inc.longitude,
            "district": inc.district,
            "status": inc.status,
            "reported_by": inc.reported_by
        })
        
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

async def query_local_llm(prompt_text: str, context: str) -> str:
    """
    Send query request to the local Ollama instance running llama3.2:3b.
    Raises exception if service is unreachable.
    """
    url = "http://localhost:11434/api/generate"
    system_prompt = (
        "You are Sentinel Patrol AI, an assistant for Kerala Police. "
        "Use ONLY the provided police incident context to answer the officer's question concisely. "
        "If context is empty, state that no relevant incidents were found."
    )
    
    payload = {
        "model": "llama3.2:3b",
        "prompt": f"Context:\n{context}\n\nQuestion: {prompt_text}",
        "system": system_prompt,
        "stream": False
    }
    
    # Send HTTP request asynchronously with a 30-second timeout
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")
