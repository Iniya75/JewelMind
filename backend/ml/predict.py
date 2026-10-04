"""
predict.py
==========
Prediction functions for all three XGBoost models.
Loads models via model_service (cached), builds feature vectors from real data,
and returns structured prediction results.
"""

import numpy as np
import pandas as pd
from datetime import datetime, date
from calendar import monthrange
from sqlalchemy.orm import Session
from sqlalchemy import text

from .model_service import get_model, get_demand_meta, ModelNotTrainedError
from .preprocessing import (
    build_churn_features,
    build_demand_features,
    build_sales_features,
    build_sales_prediction_features,
    _load_gold_rates_df,
    CHURN_FEATURE_COLS,
    DEMAND_FEATURE_COLS,
)


# ─── 1. Sales Prediction ──────────────────────────────────────────────────────

def predict_sales(db: Session, user_id: str, months_ahead: int = 3) -> dict:
    """
    Predict monthly revenue for the next `months_ahead` months.
    Uses the last available data point to build rolling/lag features.
    """
    pipeline = get_model("sales")

    history = build_sales_features(db, user_id)
    gold_df = _load_gold_rates_df(db, user_id)

    if history.empty:
        return {
            "status": "no_data",
            "message": "No historical sales data found. Cannot generate predictions."
        }

    # Use last known values for lag features
    last_row = history.sort_values(["year", "month"]).iloc[-1]
    last_revenue = float(last_row["target_revenue"])
    lag_1 = float(last_row["target_revenue"])
    lag_2 = float(history.iloc[-2]["target_revenue"]) if len(history) >= 2 else lag_1
    rolling_3 = float(history["target_revenue"].tail(3).mean())

    # Average gold rate (latest available)
    avg_gold = float(gold_df["rate22k"].mean()) if not gold_df.empty else 0.0
    avg_customers = float(last_row.get("active_customers", 0))
    avg_transactions = float(last_row.get("num_transactions", 0))

    now = datetime.utcnow()
    start_year = now.year
    start_month = now.month + 1
    if start_month > 12:
        start_month = 1
        start_year += 1

    predictions = []
    for i in range(months_ahead):
        pred_month = ((start_month - 1 + i) % 12) + 1
        pred_year = start_year + (start_month - 1 + i) // 12

        n_feat = getattr(pipeline, "n_features_in_", None)
        if n_feat == 8:
            approx_week = min(52, max(1, int((pred_month - 1) * 4.3 + 2)))
            features = np.array([[
                int(pred_month),
                int(approx_week),
                0,  # category
                float(avg_gold),
                0,  # festival
                1 if pred_month in [4, 5, 10, 11, 12] else 0,
                10,
                float(lag_1),
            ]], dtype=float)
        else:
            features = build_sales_prediction_features(
                year=pred_year,
                month=pred_month,
                avg_gold_rate=avg_gold,
                lag_1_revenue=lag_1,
                lag_2_revenue=lag_2,
                rolling_3_avg=rolling_3,
                active_customers=int(avg_customers),
                num_transactions=int(avg_transactions),
            )

        import sys
        print("Features sent:", len(features[0]), file=sys.stderr)
        print("Model expects:", getattr(pipeline, "n_features_in_", len(features[0])), file=sys.stderr)
        if hasattr(pipeline, "n_features_in_") and len(features[0]) != pipeline.n_features_in_:
            raise ValueError(
                f"Model expects {pipeline.n_features_in_} features but received {len(features[0])}"
            )

        predicted = float(pipeline.predict(features)[0])
        predicted = max(predicted, 0.0)  # clamp negatives

        month_label = date(pred_year, pred_month, 1).strftime("%B %Y")
        predictions.append({
            "month": month_label,
            "year": pred_year,
            "month_num": pred_month,
            "predicted_revenue": round(predicted, 2),
            "confidence": "medium" if len(history) < 12 else "high",
        })

        # Update lag for next iteration
        lag_2 = lag_1
        lag_1 = predicted
        rolling_3 = (rolling_3 * 2 + predicted) / 3

    total = sum(p["predicted_revenue"] for p in predictions)
    return {
        "status": "success",
        "months_ahead": months_ahead,
        "predictions": predictions,
        "total_predicted_revenue": round(total, 2),
        "currency": "INR",
        "historical_months_used": len(history),
        "generated_at": datetime.utcnow().isoformat(),
    }


# ─── 2. Churn Prediction ──────────────────────────────────────────────────────

def predict_churn(db: Session, user_id: str, threshold: float = 0.5) -> dict:
    """
    Predict churn probability for every customer.
    Returns customers sorted by churn risk (highest first).
    """
    pipeline = get_model("churn")

    df = build_churn_features(db, user_id)
    if df.empty:
        return {
            "status": "no_data",
            "message": "No customer purchase history found. Cannot predict churn."
        }

    X = df[CHURN_FEATURE_COLS].fillna(0)
    probabilities = pipeline.predict_proba(X)[:, 1]  # P(churn)

    # Enrich with customer names from the DB
    cust_rows = db.execute(
        text("SELECT id, name, phone FROM customers WHERE user_id = :uid"),
        {"uid": user_id}
    ).fetchall()
    cust_map = {row[0]: {"name": row[1], "phone": row[2]} for row in cust_rows}

    results = []
    for i, row in df.iterrows():
        cid = row["customer_id"]
        prob = float(probabilities[i])
        risk_level = (
            "High" if prob >= 0.70 else
            "Medium" if prob >= threshold else
            "Low"
        )
        cust_info = cust_map.get(cid, {"name": "Unknown", "phone": "N/A"})
        results.append({
            "customer_id": cid,
            "customer_name": cust_info["name"],
            "phone": cust_info["phone"],
            "churn_probability": round(prob, 4),
            "risk_level": risk_level,
            "days_since_last_purchase": int(row["days_since_last_purchase"]),
            "total_purchases": int(row["total_purchases"]),
            "total_spend": round(float(row["total_spend"]), 2),
        })

    results.sort(key=lambda x: x["churn_probability"], reverse=True)

    at_risk = [r for r in results if r["risk_level"] in ("High", "Medium")]
    high_risk = [r for r in results if r["risk_level"] == "High"]

    return {
        "status": "success",
        "total_customers_analyzed": len(results),
        "at_risk_count": len(at_risk),
        "high_risk_count": len(high_risk),
        "threshold_used": threshold,
        "customers": results,
        "generated_at": datetime.utcnow().isoformat(),
    }


# ─── 3. Demand Prediction ─────────────────────────────────────────────────────

def predict_demand(db: Session, user_id: str) -> dict:
    """
    Predict next month's demand per product category and flag restock urgency.
    """
    pipeline = get_model("demand")
    meta = get_demand_meta()
    all_feature_cols = meta["feature_cols"]
    trained_categories = meta["categories"]

    df = build_demand_features(db, user_id)
    if df.empty:
        return {
            "status": "no_data",
            "message": "No product/inventory data found. Cannot predict demand."
        }

    now = datetime.utcnow()
    next_month = now.month + 1
    next_year = now.year
    if next_month > 12:
        next_month = 1
        next_year += 1

    results = []
    for cat in trained_categories:
        cat_df = df[df["category"] == cat].sort_values(["year", "month"])
        if cat_df.empty:
            lag_1 = 0.0
            rolling_3 = 0.0
        else:
            last = cat_df.iloc[-1]
            lag_1 = float(last["units_sold"])
            rolling_3 = float(cat_df["units_sold"].tail(3).mean())

        from .preprocessing import _is_festival_month, _get_quarter
        quarter = _get_quarter(next_month)
        is_festival = _is_festival_month(next_year, next_month)

        # Build base features
        base_features = {
            "month": next_month,
            "quarter": quarter,
            "is_festival": is_festival,
            "avg_gold_rate": float(df["avg_gold_rate"].mean()) if not df.empty else 0.0,
            "lag_1_units": lag_1,
            "rolling_3_avg_units": rolling_3,
        }

        # One-hot encode category — match trained columns exactly
        for c in trained_categories:
            base_features[f"cat_{c}"] = 1.0 if c == cat else 0.0

        row_df = pd.DataFrame([base_features])
        # Align to trained feature columns
        for col in all_feature_cols:
            if col not in row_df.columns:
                row_df[col] = 0.0
        row_df = row_df[all_feature_cols]

        predicted_units = float(pipeline.predict(row_df)[0])
        predicted_units = max(round(predicted_units, 1), 0)

        # Restock urgency based on momentum
        recent_avg = rolling_3 if rolling_3 > 0 else lag_1
        urgency_score = predicted_units / max(recent_avg, 1)
        urgency = (
            "High" if urgency_score >= 1.2 or is_festival else
            "Medium" if urgency_score >= 0.8 else
            "Low"
        )

        results.append({
            "category": cat,
            "predicted_units_next_month": predicted_units,
            "restock_urgency": urgency,
            "urgency_score": round(urgency_score, 3),
            "recent_avg_units": round(recent_avg, 1),
            "is_festival_month": bool(is_festival),
        })

    results.sort(key=lambda x: x["urgency_score"], reverse=True)

    return {
        "status": "success",
        "prediction_month": date(next_year, next_month, 1).strftime("%B %Y"),
        "categories_analyzed": len(results),
        "high_urgency_count": len([r for r in results if r["restock_urgency"] == "High"]),
        "predictions": results,
        "generated_at": datetime.utcnow().isoformat(),
    }
