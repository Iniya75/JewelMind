"""
analytics_service.py
====================
Aggregated WhatsApp analytics from MySQL via SQLAlchemy.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models

logger = logging.getLogger(__name__)


def get_analytics(db: Session, user_id: str) -> dict:
    """
    Return aggregated WhatsApp delivery analytics for a user.
    """
    # Aggregate from broadcast_history
    agg = (
        db.query(
            func.sum(models.BroadcastHistory.total_customers).label("total_targeted"),
            func.sum(models.BroadcastHistory.success_count).label("total_sent"),
            func.sum(models.BroadcastHistory.failed_count).label("total_failed"),
            func.count(models.BroadcastHistory.id).label("total_campaigns"),
        )
        .filter(models.BroadcastHistory.user_id == user_id)
        .one()
    )

    total_targeted = int(agg.total_targeted or 0)
    total_sent = int(agg.total_sent or 0)
    total_failed = int(agg.total_failed or 0)
    total_campaigns = int(agg.total_campaigns or 0)
    delivery_pct = round((total_sent / total_targeted * 100), 2) if total_targeted > 0 else 0.0

    # Status breakdown from message_status
    status_counts = (
        db.query(models.MessageStatus.status, func.count(models.MessageStatus.id))
        .filter(models.MessageStatus.user_id == user_id)
        .group_by(models.MessageStatus.status)
        .all()
    )
    status_map = {s: c for s, c in status_counts}

    # Recent broadcasts
    recent = (
        db.query(models.BroadcastHistory)
        .filter(models.BroadcastHistory.user_id == user_id)
        .order_by(models.BroadcastHistory.created_at.desc())
        .limit(10)
        .all()
    )

    recent_list = [
        {
            "id": b.id,
            "campaign_name": b.campaign_name,
            "total_customers": b.total_customers,
            "success_count": b.success_count,
            "failed_count": b.failed_count,
            "delivery_percentage": b.delivery_percentage,
            "status": b.status,
            "created_at": b.created_at.isoformat(),
        }
        for b in recent
    ]

    return {
        "total_customers_targeted": total_targeted,
        "messages_sent": total_sent,
        "successful_deliveries": total_sent,
        "failed_deliveries": total_failed,
        "delivery_percentage": delivery_pct,
        "total_campaigns": total_campaigns,
        "status_breakdown": {
            "sent": status_map.get("sent", 0),
            "delivered": status_map.get("delivered", 0),
            "read": status_map.get("read", 0),
            "failed": status_map.get("failed", 0),
            "pending": status_map.get("pending", 0),
        },
        "recent_broadcasts": recent_list,
    }


def get_delivery_status(db: Session, user_id: str, broadcast_id: str = None, limit: int = 100) -> list:
    """
    Return per-customer delivery status rows.
    Optionally filtered by broadcast_id.
    """
    q = (
        db.query(models.MessageStatus)
        .filter(models.MessageStatus.user_id == user_id)
    )
    if broadcast_id:
        q = q.filter(models.MessageStatus.broadcast_id == broadcast_id)

    rows = q.order_by(models.MessageStatus.created_at.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "customer_name": r.customer_name,
            "phone": r.phone,
            "message": r.message[:80] + "..." if len(r.message) > 80 else r.message,
            "status": r.status,
            "meta_message_id": r.meta_message_id,
            "error": r.error_message,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


def get_customer_segments_summary(db: Session, user_id: str) -> list:
    """Return customer counts per segment type."""
    from .broadcast_service import get_segment_count

    segments = [
        {"id": "all", "name": "All Customers", "type": "all", "description": "Every registered customer"},
        {"id": "premium", "name": "Premium Customers", "type": "premium", "description": "Customers with 5+ visits"},
        {"id": "inactive", "name": "Inactive Customers", "type": "inactive", "description": "Customers with 0 visits"},
    ]

    # Add city segments from actual DB data
    cities = (
        db.query(models.Customer.city)
        .filter(models.Customer.user_id == user_id, models.Customer.city.isnot(None))
        .distinct()
        .all()
    )
    for (city,) in cities:
        if city:
            segments.append({
                "id": f"city:{city}",
                "name": f"{city} Customers",
                "type": "city",
                "description": f"Customers from {city}",
            })

    # Enrich with counts
    for seg in segments:
        seg["customer_count"] = get_segment_count(db, user_id, seg["id"])

    return segments
