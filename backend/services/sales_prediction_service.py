"""
sales_prediction_service.py
===========================
Business logic layer for sales predictions.
Formats raw model output into human-readable JSON with month labels,
revenue summaries, and growth trend analysis.
"""

from datetime import datetime
from typing import Any


def format_sales_response(raw: dict) -> dict:
    """
    Enrich raw sales prediction with business-friendly formatting:
    - Month labels (e.g., 'July 2026')
    - Revenue formatted in INR
    - Growth trend (vs previous month)
    - Summary paragraph for Gemini narration
    """
    if raw.get("status") != "success":
        return raw

    predictions = raw.get("predictions", [])
    if not predictions:
        return raw

    # Calculate month-over-month growth
    for i, pred in enumerate(predictions):
        if i == 0:
            pred["growth_vs_previous"] = None
            pred["growth_pct"] = None
        else:
            prev = predictions[i - 1]["predicted_revenue"]
            curr = pred["predicted_revenue"]
            if prev > 0:
                pct = round(((curr - prev) / prev) * 100, 1)
            else:
                pct = None
            pred["growth_vs_previous"] = round(curr - prev, 2)
            pred["growth_pct"] = pct

        pred["formatted_revenue"] = f"₹{pred['predicted_revenue']:,.2f}"

    total = raw.get("total_predicted_revenue", 0)
    avg_monthly = total / len(predictions) if predictions else 0

    # Build a summary text for Gemini to use
    month_labels = [p["month"] for p in predictions]
    summary = (
        f"Based on your historical sales data ({raw.get('historical_months_used', 0)} months), "
        f"the predicted total revenue for the next {raw.get('months_ahead', len(predictions))} month(s) "
        f"({', '.join(month_labels)}) is ₹{total:,.2f}. "
        f"Average monthly revenue expected: ₹{avg_monthly:,.2f}."
    )

    raw["summary"] = summary
    raw["avg_monthly_revenue"] = round(avg_monthly, 2)
    raw["formatted_total"] = f"₹{total:,.2f}"
    return raw


def get_revenue_insight(predictions: list[dict]) -> str:
    """Generate a one-line insight string for the highest-revenue month."""
    if not predictions:
        return "No predictions available."
    best = max(predictions, key=lambda x: x["predicted_revenue"])
    return (
        f"Best predicted month: {best['month']} with revenue of "
        f"₹{best['predicted_revenue']:,.2f}"
        + (" (festival season boost 🪔)" if best.get("is_festival_month") else "")
    )
