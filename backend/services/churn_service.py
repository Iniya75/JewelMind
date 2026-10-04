"""
churn_service.py
================
Business logic layer for customer churn predictions.
Enriches raw model output with actionable retention advice
and segments customers into priority action groups.
"""


def format_churn_response(raw: dict) -> dict:
    """
    Enrich raw churn predictions with:
    - Risk badge colour (red / orange / green)
    - Retention action recommendation
    - Summary text for Gemini narration
    """
    if raw.get("status") != "success":
        return raw

    customers = raw.get("customers", [])

    for c in customers:
        risk = c.get("risk_level", "Low")
        days = c.get("days_since_last_purchase", 0)
        spend = c.get("total_spend", 0)

        # Colour tags for UI display
        c["badge_colour"] = {"High": "red", "Medium": "orange", "Low": "green"}.get(risk, "green")

        # Contextual retention action
        if risk == "High":
            if spend > 50000:
                action = "🎁 Send personalised gold jewelry offer — VIP customer at high churn risk"
            else:
                action = "📞 Schedule personal outreach call — last purchase was over 3 months ago"
        elif risk == "Medium":
            action = "💌 Send WhatsApp reminder about festive collection or new arrivals"
        else:
            action = "✅ Customer is active — maintain regular engagement"

        c["recommended_action"] = action
        c["formatted_spend"] = f"₹{spend:,.2f}"

    high = [c for c in customers if c.get("risk_level") == "High"]
    medium = [c for c in customers if c.get("risk_level") == "Medium"]

    summary = (
        f"Out of {raw.get('total_customers_analyzed', 0)} customers analyzed, "
        f"{len(high)} are at HIGH risk of churning and "
        f"{len(medium)} are at MEDIUM risk. "
        f"Immediate action recommended for {len(high)} customers."
    )

    raw["summary"] = summary
    raw["high_risk_customers"] = high
    raw["medium_risk_customers"] = medium
    return raw


def get_top_churn_risks(customers: list[dict], top_n: int = 5) -> list[dict]:
    """Return the top N highest-risk customers."""
    sorted_custs = sorted(
        customers, key=lambda x: x.get("churn_probability", 0), reverse=True
    )
    return sorted_custs[:top_n]
