import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

if __package__ is None or __package__ == "":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    __package__ = "backend"

logger = logging.getLogger(__name__)

from dotenv import load_dotenv
# Load .env FIRST so all os.getenv calls pick up the API key
load_dotenv()
if not os.getenv("OPENAI_API_KEY"):
    parent_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(parent_env):
        load_dotenv(parent_env)

# Validate that OPENAI_API_KEY is set in environment
if not os.getenv("OPENAI_API_KEY"):
    logger.critical("OPENAI_API_KEY is missing from environment. Application cannot start.")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import text
from .database import engine, Base, SessionLocal
from .migrations import ensure_schema
from .routers import auth, users, data, ml, whatsapp_settings, realtime_router
from .routers import predictions as predictions_router
from .ml import predictor as ml_predictor
from .routers.whatsapp_router import router as whatsapp_router
from .routers.whatsapp_integration import router as whatsapp_integration_router
from .services.gold_rate_service import (
    run_daily_gold_rate_scheduler,
    update_gold_rates_for_all_users,
)

# Create database tables
Base.metadata.create_all(bind=engine)
ensure_schema(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks, then yield to serve requests, then run shutdown tasks."""
    # ── Startup ────────────────────────────────────────────────────────────────
    # Run OpenAI config validation
    try:
        from .config import validate_openai_config
        validate_openai_config()
    except Exception as exc:
        logger.critical("[STARTUP] OpenAI validation failed: %s. Exiting.", exc)
        import sys
        sys.exit(1)

    # Run automatic user migration check from Supabase
    try:
        from .migration_service import migrate_users_from_supabase
        db = SessionLocal()
        try:
            migrate_users_from_supabase(db)
        finally:
            db.close()
    except Exception as exc:
        logger.warning("[STARTUP] Automatic user migration check failed: %s", exc)

    # Load pre-trained Colab .joblib models into memory once
    try:
        model_status = ml_predictor.load_models()
        logger.info("[STARTUP] ML models loaded: %s", model_status)
        print("Models loaded successfully")
    except Exception as exc:
        logger.warning("[STARTUP] ML model load failed (predictions will be unavailable): %s", exc)
        print(f"Model load failed: {exc}")

    # Immediately fetch today's gold rate for all registered users in background
    api_key = os.getenv("GOLD_RATE_API_KEY", "").strip()
    if api_key:
        logger.info("[STARTUP] GoldAPI key found — fetching live gold rates in background…")
        def _fetch_rates_bg():
            db = SessionLocal()
            try:
                result = update_gold_rates_for_all_users(db, retries=1)
                logger.info("[STARTUP] Gold rates updated: %s users, errors: %s", result["updated"], result["errors"])
            except Exception as exc:
                logger.warning("[STARTUP] Gold rate fetch failed on startup: %s", exc)
            finally:
                db.close()
        asyncio.create_task(asyncio.to_thread(_fetch_rates_bg))
    else:
        logger.warning("[STARTUP] GOLD_RATE_API_KEY not set — gold rates will not auto-fetch.")

    # Start recurring daily scheduler (fetches at 6 AM each day)
    asyncio.create_task(run_daily_gold_rate_scheduler())
    print("Backend started successfully")

    yield  # serve requests

    # ── Shutdown (nothing special needed currently) ─────────────────────────
    logger.info("[SHUTDOWN] JewelMind backend shutting down.")


app = FastAPI(
    title="JewelMind AI API",
    description="AI Business Operating System for Jewelry Stores — with XGBoost ML predictions",
    version="2.0.0",
    lifespan=lifespan,
)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import Request

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    safe_errors = [
        {key: error[key] for key in ("loc", "msg", "type") if key in error}
        for error in exc.errors()
    ]
    logger.warning(
        "Request validation failed for %s %s: %s",
        request.method,
        request.url.path,
        safe_errors,
    )
    return JSONResponse(
        status_code=422,
        content={"detail": safe_errors, "message": "Validation failed"},
    )

# Configure CORS to allow requests from frontend
origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:8000",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    for r in allowed_origins_env.split(","):
        r_stripped = r.strip()
        if r_stripped and r_stripped not in origins:
            origins.append(r_stripped)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(data.router)
app.include_router(ml.router)
app.include_router(predictions_router.router)
app.include_router(whatsapp_router)
app.include_router(whatsapp_integration_router)
app.include_router(whatsapp_settings.router)
app.include_router(realtime_router.router)


# startup_tasks moved into the lifespan() context manager above


@app.get("/api/status")
def read_status():
    """API status endpoint"""
    api_key = os.getenv("GOLD_RATE_API_KEY", "").strip()
    return {
        "message": "JewelMind API is running!",
        "version": "2.0.0",
        "status": "backend_ready",
        "database": "connected",
        "goldApi": "configured" if api_key else "not_configured",
    }


@app.get("/api/health")
def health_check():
    """Health endpoint returning backend, database and model status."""
    # Check database connectivity
    db_status = "disconnected"
    try:
        from .database import SessionLocal
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"
    finally:
        try:
            db.close()
        except Exception:
            pass

    models_status = ml_predictor.get_model_status() if hasattr(ml_predictor, "get_model_status") else {"models": "unknown"}
    models_ok = "loaded" if all(v == "ready" for v in models_status.values()) else "not_loaded"

    return {
        "backend": "running",
        "database": db_status,
        "models": models_ok,
    }


@app.get("/")
def root():
    """Root endpoint - frontend should be served by TanStack dev server"""
    return {
        "message": "JewelMind Backend API",
        "api_docs": "Visit http://localhost:8000/docs for Swagger UI",
        "frontend": "Started on http://localhost:8080",
        "apis": {
            "auth": "/api/auth",
            "users": "/api/users",
            "data": "/api/data",
            "ml": "/api/ml"
        }
    }
