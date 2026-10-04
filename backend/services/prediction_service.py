"""
prediction_service.py
=====================
Business logic layer for AI predictions using pre-trained .joblib models.
Calls predictor.predict_all(), saves to prediction_history MySQL table,
and returns enriched response data.
"""

import uuid
import logging
from datetime import date, datetime
from sqlalchemy.orm import Session
from typing import List, Optional

from .. import models, schemas
from ..ml import predictor

logger = logging.getLogger(__name__)


def run_prediction(
    db: Session,
    user_id: str,
    inp: schemas.PredictionInput,
) -> dict:
    """
    Run demand + sales prediction and persist result to MySQL.
    Returns the enriched prediction result dict.
    """
    # Parse date
    pred_date = date.today()
    if inp.date:
        try:
            pred_date = date.fromisoformat(inp.date)
        except ValueError:
            pass

    # Run models
    result = predictor.predict_all(
        pred_date=pred_date,
        product_id=inp.product_id or "0",
        category=inp.category,
        gold_rate=float(inp.gold_rate),
        festival=inp.festival or "No",
        wedding_season=int(inp.wedding_season),
        current_stock=int(inp.current_stock),
        previous_sales=float(inp.previous_sales),
        month=inp.month,
        week=inp.week,
    )

    # Persist to prediction_history
    _save_prediction(db, user_id, inp, result)

    return result


def _save_prediction(
    db: Session,
    user_id: str,
    inp: schemas.PredictionInput,
    result: dict,
) -> None:
    """Save prediction result to the prediction_history MySQL table."""
    try:
        record = models.PredictionHistory(
            id=str(uuid.uuid4()),
            user_id=user_id,
            product_id=inp.product_id,
            category=inp.category,
            festival=inp.festival,
            gold_rate=float(inp.gold_rate),
            wedding_season=int(inp.wedding_season),
            current_stock=int(inp.current_stock),
            previous_sales=float(inp.previous_sales),
            predicted_demand=result.get("predicted_demand"),
            predicted_sales=result.get("predicted_sales"),
            prediction_date=inp.date or str(date.today()),
            created_at=datetime.utcnow(),
        )
        db.add(record)
        db.commit()
        logger.info("[PREDICT] Saved prediction for user=%s category=%s", user_id, inp.category)
    except Exception:
        db.rollback()
        logger.exception("[PREDICT] Failed to save prediction history for user %s", user_id)
        raise RuntimeError("Prediction history could not be saved.")


def get_history(db: Session, user_id: str, limit: int = 50) -> List[dict]:
    """Return the last N predictions for this user."""
    rows = (
        db.query(models.PredictionHistory)
        .filter(models.PredictionHistory.user_id == user_id)
        .order_by(models.PredictionHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_history(r) for r in rows]


def get_chart_data(db: Session, user_id: str) -> dict:
    """
    Return chart-ready data:
      - demand_trend: [{date, demand}]  (last 30 predictions)
      - sales_trend:  [{date, sales}]   (last 30 predictions)
      - by_category:  [{category, demand, sales}]
      - by_festival:  [{festival, demand}]
    """
    rows = (
        db.query(models.PredictionHistory)
        .filter(models.PredictionHistory.user_id == user_id)
        .order_by(models.PredictionHistory.created_at.asc())
        .all()
    )

    demand_trend = []
    sales_trend = []
    category_map: dict = {}
    festival_map: dict = {}

    for r in rows[-30:]:
        ts = r.created_at.strftime("%d %b") if r.created_at else ""
        if r.predicted_demand is not None:
            demand_trend.append({"date": ts, "demand": round(r.predicted_demand, 1)})
        if r.predicted_sales is not None:
            sales_trend.append({"date": ts, "sales": round(r.predicted_sales, 2)})
        if r.category:
            prev = category_map.get(r.category, {"category": r.category, "demand": 0, "sales": 0})
            prev["demand"] = round(prev["demand"] + (r.predicted_demand or 0), 1)
            prev["sales"] = round(prev["sales"] + (r.predicted_sales or 0), 2)
            category_map[r.category] = prev
        if r.festival:
            prev = festival_map.get(r.festival, {"festival": r.festival, "demand": 0})
            prev["demand"] = round(prev["demand"] + (r.predicted_demand or 0), 1)
            festival_map[r.festival] = prev

    return {
        "demand_trend": demand_trend,
        "sales_trend": sales_trend,
        "by_category": list(category_map.values()),
        "by_festival": list(festival_map.values()),
    }


def _serialize_history(r: models.PredictionHistory) -> dict:
    return {
        "id": r.id,
        "product_id": r.product_id,
        "category": r.category,
        "festival": r.festival,
        "gold_rate": r.gold_rate,
        "predicted_demand": r.predicted_demand,
        "predicted_sales": r.predicted_sales,
        "prediction_date": r.prediction_date,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
