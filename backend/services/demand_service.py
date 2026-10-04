"""
demand_service.py
=================
Business logic layer for product demand / restock predictions.
Maps urgency scores to human-readable restock recommendations
and priority action lists.
"""


def format_demand_response(raw: dict) -> dict:
    """
    Enrich raw demand predictions with:
    - Urgency emoji indicators
    - Restock recommendation text
    - Summary for Gemini narration
    """
    if raw.get("status") != "success":
        return raw

    predictions = raw.get("predictions", [])

    for p in predictions:
        urgency = p.get("restock_urgency", "Low")
        category = p.get("category", "Unknown")
        units = p.get("predicted_units_next_month", 0)
        festival = p.get("is_festival_month", False)

        # Emoji indicator
        indicator = {"High": "🔴", "Medium": "🟡", "Low": "🟢"}.get(urgency, "⚪")
        p["urgency_indicator"] = indicator

        # Restock recommendation
        if urgency == "High":
            rec = (
                f"Stock up {category} immediately — predicted demand is {units:.0f} units"
                + (" due to upcoming festival season 🪔" if festival else "")
            )
        elif urgency == "Medium":
            rec = f"Monitor {category} stock levels — moderate demand of ~{units:.0f} units expected"
        else:
            rec = f"{category} stock is sufficient — low demand of ~{units:.0f} units predicted"

        p["recommendation"] = rec

    high_urgency = [p for p in predictions if p.get("restock_urgency") == "High"]
    prediction_month = raw.get("prediction_month", "next month")

    summary = (
        f"For {prediction_month}, {len(high_urgency)} product categor{'y' if len(high_urgency) == 1 else 'ies'} "
        f"need immediate restocking: {', '.join(p['category'] for p in high_urgency) or 'none'}. "
        f"Total categories analyzed: {raw.get('categories_analyzed', 0)}."
    )

    raw["summary"] = summary
    raw["high_urgency_categories"] = high_urgency
    return raw


def get_restock_priorities(predictions: list[dict]) -> list[dict]:
    """Return only High and Medium urgency categories sorted by score."""
    priority = [p for p in predictions if p.get("restock_urgency") in ("High", "Medium")]
    return sorted(priority, key=lambda x: x.get("urgency_score", 0), reverse=True)
