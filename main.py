from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_db_and_tables
from routes import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database and tables automatically at startup
    create_db_and_tables()
    yield

app = FastAPI(
    title="Sentinel Patrol Backend",
    description="Backend API for Sentinel Patrol application",
    version="1.0.0",
    lifespan=lifespan
)

# Allow CORS for all origins, methods, and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routes
app.include_router(api_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
