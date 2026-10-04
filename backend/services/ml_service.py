"""
ml_service.py
=============
Orchestrates ML training and prediction calls.
Handles model-not-found and insufficient-data cases gracefully.
"""

from sqlalchemy.orm import Session
from ..ml.train_model import train_sales_model, train_churn_model, train_demand_model
from ..ml.predict import predict_sales, predict_churn, predict_demand
from ..ml.model_service import ModelNotTrainedError, invalidate_cache


def run_train_sales(db: Session, user_id: str) -> dict:
    """Train the sales forecasting model and invalidate cache."""
    result = train_sales_model(db, user_id)
    if result.get("status") == "success":
        invalidate_cache("sales")
    return result


def run_train_churn(db: Session, user_id: str) -> dict:
    """Train the churn prediction model and invalidate cache."""
    result = train_churn_model(db, user_id)
    if result.get("status") == "success":
        invalidate_cache("churn")
    return result


def run_train_demand(db: Session, user_id: str) -> dict:
    """Train the demand prediction model and invalidate cache."""
    result = train_demand_model(db, user_id)
    if result.get("status") == "success":
        invalidate_cache("demand")
    return result


def run_predict_sales(db: Session, user_id: str, months_ahead: int = 3) -> dict:
    """Run sales prediction with error handling."""
    try:
        return predict_sales(db, user_id, months_ahead)
    except ModelNotTrainedError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Prediction failed: {str(e)}"}


def run_predict_churn(db: Session, user_id: str) -> dict:
    """Run churn prediction with error handling."""
    try:
        return predict_churn(db, user_id)
    except ModelNotTrainedError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Prediction failed: {str(e)}"}


def run_predict_demand(db: Session, user_id: str) -> dict:
    """Run demand prediction with error handling."""
    try:
        return predict_demand(db, user_id)
    except ModelNotTrainedError as e:
        return {"status": "error", "message": str(e)}
    except Exception as e:
        return {"status": "error", "message": f"Prediction failed: {str(e)}"}
