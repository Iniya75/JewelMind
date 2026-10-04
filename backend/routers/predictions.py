"""
routers/predictions.py
======================
FastAPI routes for AI predictions using pre-trained .joblib Colab models.

Endpoints:
    POST /api/predict/demand        Predict product demand
    POST /api/predict/sales         Predict product sales
    POST /api/predict/all           Predict both demand and sales (combined)
    GET  /api/predict/history       Retrieve prediction history for the user
    GET  /api/predict/chart         Retrieve chart-ready aggregated data
    GET  /api/predict/status        Model load status
    GET  /api/predict/labels        Category and festival encoder labels

No training endpoints — models are pre-trained from Google Colab.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, auth, database, schemas
from ..ml import predictor
from ..services import prediction_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/predict", tags=["AI Predictions"])


# ─── Combined Prediction ──────────────────────────────────────────────────────

@router.post("/all", response_model=schemas.PredictionOutput)
def predict_all_endpoint(
    inp: schemas.PredictionInput,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Run both demand and sales models.
    Returns predicted_demand, predicted_sales, category, festival, timestamp.
    Result is automatically saved to MySQL prediction_history table.
    """
    try:
        result = prediction_service.run_prediction(db, current_user.id, inp)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("[PREDICT] /all error: %s", e)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@router.post("/demand")
def predict_demand_endpoint(
    inp: schemas.PredictionInput,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Run only the demand model."""
    try:
        result = prediction_service.run_prediction(db, current_user.id, inp)
        return {
            "predicted_demand": result["predicted_demand"],
            "category": result["category"],
            "festival": result["festival"],
            "prediction_timestamp": result["prediction_timestamp"],
        }
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demand prediction failed: {e}")


@router.post("/sales")
def predict_sales_endpoint(
    inp: schemas.PredictionInput,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Run only the sales model."""
    try:
        result = prediction_service.run_prediction(db, current_user.id, inp)
        return {
            "predicted_sales": result.get("predicted_sales"),
            "category": result["category"],
            "festival": result["festival"],
            "prediction_timestamp": result["prediction_timestamp"],
        }
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sales prediction failed: {e}")


# ─── History & Chart Data ─────────────────────────────────────────────────────

@router.get("/history")
def get_prediction_history(
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return the last N predictions made by this user."""
    return prediction_service.get_history(db, current_user.id, limit=limit)


@router.get("/chart")
def get_prediction_chart_data(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Return aggregated chart data:
    - demand_trend   [{date, demand}]
    - sales_trend    [{date, sales}]
    - by_category    [{category, demand, sales}]
    - by_festival    [{festival, demand}]
    """
    return prediction_service.get_chart_data(db, current_user.id)


# ─── Model Status & Labels ────────────────────────────────────────────────────

@router.get("/status")
def get_model_status(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Check which models are loaded and ready."""
    return predictor.get_model_status()


@router.get("/labels")
def get_encoder_labels(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return known category and festival values from the encoders."""
    return {
        "categories": predictor.get_known_categories(),
        "festivals": predictor.get_known_festivals(),
    }
