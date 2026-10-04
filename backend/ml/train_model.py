"""
train_model.py
==============
Train XGBoost models using real JewelMind MySQL data.
Each function saves a sklearn Pipeline (.pkl) to backend/ml/models/.
"""

import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, accuracy_score, classification_report
from xgboost import XGBRegressor, XGBClassifier
from sqlalchemy.orm import Session

from .preprocessing import (
    build_sales_features, build_churn_features, build_demand_features,
    SALES_FEATURE_COLS, CHURN_FEATURE_COLS, DEMAND_FEATURE_COLS
)


# ─── Model storage path ───────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MIN_SAMPLES_REGRESSION = 5   # Minimum rows needed to train regressor
MIN_SAMPLES_CLASSIFIER = 10  # Minimum rows needed to train classifier
SALES_TARGET_COL = "target_revenue"



def _save_model(pipeline: Pipeline, name: str) -> str:
    """Save model to disk and return file path."""
    path = MODELS_DIR / f"{name}.pkl"
    joblib.dump(pipeline, path)
    return str(path)


# ─── 1. Sales Forecasting Model ──────────────────────────────────────────────




def train_sales_model(db: Session, user_id: str) -> dict:
    """
    Train XGBRegressor to predict monthly sales revenue.
    Returns training metadata dict.
    """
    df = build_sales_features(db, user_id)

    if df.empty or len(df) < MIN_SAMPLES_REGRESSION:
        return {
            "status": "skipped",
            "reason": f"Insufficient data. Need at least {MIN_SAMPLES_REGRESSION} months of sales history. Found {len(df)}.",
            "rows_found": len(df)
        }

    X = df[SALES_FEATURE_COLS].fillna(0)
    y = df[SALES_TARGET_COL].fillna(0)

    # Split if enough data
    if len(df) >= 10:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=0
        ))
    ])

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    mae = float(np.mean(np.abs(y_test.values - y_pred)))

    path = _save_model(pipeline, "sales_forecast_model")

    return {
        "status": "success",
        "model": "sales_forecast_model",
        "rows_trained": len(X_train),
        "rows_tested": len(X_test),
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "model_path": path,
        "trained_at": datetime.utcnow().isoformat(),
        "feature_importance": dict(
            zip(SALES_FEATURE_COLS,
                pipeline.named_steps["model"].feature_importances_.round(4).tolist())
        )
    }


# ─── 2. Customer Churn Model ──────────────────────────────────────────────────

CHURN_FEATURE_COLS = [
    "days_since_last_purchase", "total_purchases", "total_spend",
    "avg_basket_size", "purchase_frequency_days", "visit_count"
]
CHURN_TARGET_COL = "is_churned"


def train_churn_model(db: Session, user_id: str) -> dict:
    """
    Train XGBClassifier to predict customer churn probability.
    Returns training metadata dict.
    """
    df = build_churn_features(db, user_id)

    if df.empty or len(df) < MIN_SAMPLES_CLASSIFIER:
        return {
            "status": "skipped",
            "reason": f"Insufficient data. Need at least {MIN_SAMPLES_CLASSIFIER} customers with purchase history. Found {len(df)}.",
            "rows_found": len(df)
        }

    X = df[CHURN_FEATURE_COLS].fillna(0)
    y = df[CHURN_TARGET_COL]

    # Handle class imbalance
    n_churned = int(y.sum())
    n_active = int(len(y) - n_churned)
    scale_pos_weight = n_active / max(n_churned, 1)

    if len(df) >= 20:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y if n_churned > 1 else None
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=scale_pos_weight,
            use_label_encoder=False,
            eval_metric="logloss",
            random_state=42,
            verbosity=0
        ))
    ])

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))

    path = _save_model(pipeline, "churn_model")

    return {
        "status": "success",
        "model": "churn_model",
        "rows_trained": len(X_train),
        "rows_tested": len(X_test),
        "accuracy": round(accuracy, 4),
        "churned_customers_in_data": n_churned,
        "active_customers_in_data": n_active,
        "model_path": path,
        "trained_at": datetime.utcnow().isoformat(),
        "feature_importance": dict(
            zip(CHURN_FEATURE_COLS,
                pipeline.named_steps["model"].feature_importances_.round(4).tolist())
        )
    }


# ─── 3. Demand / Restock Model ────────────────────────────────────────────────

DEMAND_FEATURE_COLS = [
    "month", "quarter", "is_festival", "avg_gold_rate",
    "lag_1_units", "rolling_3_avg_units"
]
DEMAND_TARGET_COL = "units_sold"


def train_demand_model(db: Session, user_id: str) -> dict:
    """
    Train XGBRegressor to predict units sold per product category per month.
    Returns training metadata dict.
    """
    df = build_demand_features(db, user_id)

    if df.empty or len(df) < MIN_SAMPLES_REGRESSION:
        return {
            "status": "skipped",
            "reason": f"Insufficient data. Need at least {MIN_SAMPLES_REGRESSION} category-month rows. Found {len(df)}.",
            "rows_found": len(df)
        }

    # One-hot encode category
    category_dummies = pd.get_dummies(df["category"], prefix="cat")
    X = pd.concat([df[DEMAND_FEATURE_COLS].fillna(0), category_dummies], axis=1)
    y = df[DEMAND_TARGET_COL].fillna(0)

    all_feature_cols = list(X.columns)

    if len(df) >= 10:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, shuffle=False
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", XGBRegressor(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbosity=0
        ))
    ])

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))

    # Save feature columns alongside model for prediction alignment
    meta_path = MODELS_DIR / "demand_model_meta.pkl"
    joblib.dump({
        "feature_cols": all_feature_cols,
        "categories": list(df["category"].unique())
    }, meta_path)

    path = _save_model(pipeline, "demand_model")

    return {
        "status": "success",
        "model": "demand_model",
        "rows_trained": len(X_train),
        "rows_tested": len(X_test),
        "rmse": round(rmse, 2),
        "categories_trained": list(df["category"].unique()),
        "model_path": path,
        "trained_at": datetime.utcnow().isoformat(),
    }
