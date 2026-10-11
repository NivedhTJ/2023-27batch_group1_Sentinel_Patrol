from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import create_db_and_tables
from routes import router as api_router
from admin_routes import admin_router, personnel_router, suspect_router, digital_evidence_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database and tables automatically at startup
    create_db_and_tables()
    yield

app = FastAPI(
    title="Sentinel Patrol Backend",
    description="Backend API for Sentinel Patrol application",
    version="2.0.0",
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
app.include_router(admin_router)
app.include_router(personnel_router)
app.include_router(suspect_router)
app.include_router(digital_evidence_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/ml/health")
async def ml_health_check():
    """
    Reports whether the XGBoost + SHAP ML engine loaded successfully.
    No auth required — useful for quick smoke tests on startup.
    """
    from ml_engine import (
        _model, _explainer, _base_score, _ML_AVAILABLE,
        _ML_IMPORT_ERROR, FEATURE_NAMES, KERALA_DISTRICTS,
    )
    if not _ML_AVAILABLE:
        return {
            "ml_ready": False,
            "error": f"ML dependencies not installed: {_ML_IMPORT_ERROR}",
        }
    if _model is None or _explainer is None:
        return {
            "ml_ready": False,
            "error": "Model training failed at startup — check server logs.",
        }
    return {
        "ml_ready": True,
        "model_type": "XGBClassifier",
        "explainer_type": "SHAP TreeExplainer",
        "n_features": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "base_score": round(_base_score, 4),
        "districts": KERALA_DISTRICTS,
    }

