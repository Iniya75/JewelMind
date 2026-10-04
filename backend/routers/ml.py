"""
routers/ml.py
=============
FastAPI ML endpoints for JewelMind AI.
All endpoints require JWT authentication via the existing auth module.

Endpoints:
    POST /train-sales-model      Train XGBoost sales forecasting model
    POST /train-churn-model      Train XGBoost churn prediction model
    POST /train-demand-model     Train XGBoost demand prediction model
    POST /predict-sales          Predict future monthly revenue
    POST /predict-churn          Predict customers likely to churn
    POST /predict-demand         Predict product categories needing restock
"""

import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from .. import models, auth, database, schemas
from ..services.ml_service import (
    run_train_sales, run_train_churn, run_train_demand,
    run_predict_sales, run_predict_churn, run_predict_demand,
)
from ..services.sales_prediction_service import format_sales_response
from ..services.churn_service import format_churn_response
from ..services.demand_service import format_demand_response

router = APIRouter(prefix="/api", tags=["ML Predictions"])
logger = logging.getLogger(__name__)


# ─── Training Endpoints ────────────────────────────────────────────────────────

@router.post("/train-sales-model")
def train_sales(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Train the XGBoost sales forecasting model on this user's bill history.
    Must be called before /predict-sales works.
    """
    result = run_train_sales(db, current_user.id)
    if result.get("status") == "skipped":
        raise HTTPException(status_code=422, detail=result)
    return result


@router.post("/train-churn-model")
def train_churn(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Train the XGBoost churn prediction model on this user's customer purchase history.
    Must be called before /predict-churn works.
    """
    result = run_train_churn(db, current_user.id)
    if result.get("status") == "skipped":
        raise HTTPException(status_code=422, detail=result)
    return result


@router.post("/train-demand-model")
def train_demand(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Train the XGBoost demand/restock prediction model on this user's bill item data.
    Must be called before /predict-demand works.
    """
    result = run_train_demand(db, current_user.id)
    if result.get("status") == "skipped":
        raise HTTPException(status_code=422, detail=result)
    return result


# ─── Prediction Endpoints ──────────────────────────────────────────────────────

@router.post("/predict-sales")
def predict_sales_endpoint(
    months_ahead: int = Body(default=3, ge=1, le=12, embed=True),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Predict monthly revenue for the next N months (default: 3, max: 12).
    Requires the sales model to be trained first.
    """
    raw = run_predict_sales(db, current_user.id, months_ahead)

    if raw.get("status") == "error":
        raise HTTPException(status_code=400, detail=raw.get("message"))
    if raw.get("status") == "no_data":
        raise HTTPException(status_code=422, detail=raw.get("message"))

    result = format_sales_response(raw)

    # Persist predictions to history table
    _save_sales_predictions(db, current_user.id, result.get("predictions", []))

    return result


@router.post("/predict-churn")
def predict_churn_endpoint(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Predict churn probability for all customers.
    Returns customers sorted by risk level (highest first).
    Requires the churn model to be trained first.
    """
    raw = run_predict_churn(db, current_user.id)

    if raw.get("status") == "error":
        raise HTTPException(status_code=400, detail=raw.get("message"))
    if raw.get("status") == "no_data":
        raise HTTPException(status_code=422, detail=raw.get("message"))

    result = format_churn_response(raw)

    # Persist top-risk predictions to history table
    _save_churn_predictions(db, current_user.id, result.get("customers", []))

    return result


@router.post("/predict-demand")
def predict_demand_endpoint(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Predict demand and restock urgency for each product category.
    Returns categories ranked by restock urgency.
    Requires the demand model to be trained first.
    """
    raw = run_predict_demand(db, current_user.id)

    if raw.get("status") == "error":
        raise HTTPException(status_code=400, detail=raw.get("message"))
    if raw.get("status") == "no_data":
        raise HTTPException(status_code=422, detail=raw.get("message"))

    result = format_demand_response(raw)

    # Persist to history table
    _save_demand_predictions(db, current_user.id, result)

    return result


# ─── Model Status ──────────────────────────────────────────────────────────────

@router.get("/ml-status")
def ml_status(current_user: models.User = Depends(auth.get_current_user)):
    """Check which ML models are trained and ready to use."""
    from ..ml.model_service import list_model_status
    return {
        "user_id": current_user.id,
        "models": list_model_status()
    }


# ─── Private History Persistence Helpers ──────────────────────────────────────

def _save_sales_predictions(db: Session, user_id: str, predictions: list) -> None:
    try:
        for p in predictions:
            record = models.SalesPrediction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                predicted_month=p.get("month"),
                predicted_month_num=p.get("month_num"),
                predicted_year=p.get("year"),
                predicted_revenue=p.get("predicted_revenue"),
                confidence=p.get("confidence"),
                model_version="xgboost_v1",
                created_at=datetime.utcnow()
            )
            db.add(record)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist sales predictions for user %s", user_id)
        raise HTTPException(status_code=500, detail="Sales predictions could not be saved.")


def _save_churn_predictions(db: Session, user_id: str, customers: list) -> None:
    try:
        for c in customers:
            record = models.ChurnPrediction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                customer_id=c.get("customer_id"),
                customer_name=c.get("customer_name"),
                churn_probability=c.get("churn_probability"),
                risk_level=c.get("risk_level"),
                days_since_last_purchase=c.get("days_since_last_purchase"),
                total_purchases=c.get("total_purchases"),
                total_spend=c.get("total_spend"),
                model_version="xgboost_v1",
                created_at=datetime.utcnow()
            )
            db.add(record)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist churn predictions for user %s", user_id)
        raise HTTPException(status_code=500, detail="Churn predictions could not be saved.")


def _save_demand_predictions(db: Session, user_id: str, result: dict) -> None:
    try:
        for p in result.get("predictions", []):
            record = models.DemandPrediction(
                id=str(uuid.uuid4()),
                user_id=user_id,
                product_id=None,
                category=p.get("category"),
                predicted_quantity=p.get("predicted_units_next_month"),
                confidence_score=p.get("urgency_score"),
                recommended_action=p.get("recommendation"),
                created_at=datetime.utcnow()
            )
            db.add(record)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist demand predictions for user %s", user_id)
        raise HTTPException(status_code=500, detail="Demand predictions could not be saved.")
