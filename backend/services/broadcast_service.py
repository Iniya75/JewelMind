"""
broadcast_service.py
====================
Resolves customer segments from MySQL, sends WhatsApp messages via
whatsapp_service, and persists broadcast history + per-customer statuses.
"""

import uuid
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models
from . import whatsapp_service

logger = logging.getLogger(__name__)


# ─── Customer Segment Resolver ─────────────────────────────────────────────────

def resolve_segment(db: Session, user_id: str, target_group: str) -> list[dict]:
    """
    Resolve a target_group string into a list of customer dicts.

    Supported target_group values:
    - "all"                        → all customers
    - "premium"                    → customers with visits >= 5
    - "inactive"                   → customers with visits == 0
    - "city:<CityName>"            → customers from a specific city
    - "spend_above:<amount>"       → customers whose total bill amount exceeds threshold
    """
    base_q = db.query(models.Customer).filter(models.Customer.user_id == user_id)

    tg = target_group.strip().lower()

    if tg == "all":
        customers = base_q.all()

    elif tg == "premium":
        customers = base_q.filter(models.Customer.visits >= 5).all()

    elif tg == "inactive":
        customers = base_q.filter(models.Customer.visits == 0).all()

    elif tg.startswith("city:"):
        city = target_group.split(":", 1)[1].strip()
        customers = base_q.filter(
            models.Customer.city.ilike(f"%{city}%")
        ).all()

    elif tg.startswith("spend_above:"):
        try:
            threshold = float(target_group.split(":", 1)[1].strip())
        except ValueError:
            threshold = 0.0

        # Aggregate total spend per customer from bills
        spend_subq = (
            db.query(models.Bill.customer_id, func.sum(models.Bill.total_amount).label("total_spend"))
            .filter(models.Bill.user_id == user_id, models.Bill.customer_id.isnot(None))
            .group_by(models.Bill.customer_id)
            .subquery()
        )
        high_spenders = (
            db.query(models.Customer)
            .join(spend_subq, models.Customer.id == spend_subq.c.customer_id)
            .filter(models.Customer.user_id == user_id, spend_subq.c.total_spend >= threshold)
            .all()
        )
        customers = high_spenders

    else:
        logger.warning("Unknown target_group: %s — defaulting to all", target_group)
        customers = base_q.all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone_number or c.phone,
            "city": c.city,
            "visits": c.visits,
        }
        for c in customers
        if c.phone_number or c.phone  # skip customers without a phone number
    ]


def get_segment_count(db: Session, user_id: str, target_group: str) -> int:
    """Return estimated customer count for a segment without sending."""
    return len(resolve_segment(db, user_id, target_group))


# ─── Broadcast Execution ───────────────────────────────────────────────────────

def execute_broadcast(
    db: Session,
    user_id: str,
    campaign_name: str,
    message: str,
    target_group: str,
    campaign_id: Optional[str] = None,
) -> dict:
    """
    Resolve customers for the segment, send WhatsApp messages,
    and persist BroadcastHistory + MessageStatus rows.

    Returns a summary dict.
    """
    customers = resolve_segment(db, user_id, target_group)
    total = len(customers)

    if total == 0:
        logger.warning("Broadcast '%s': no customers in segment '%s'", campaign_name, target_group)
        return {
            "status": "completed",
            "total_customers": 0,
            "success_count": 0,
            "failed_count": 0,
            "delivery_percentage": 0.0,
            "message": "No customers found in the selected segment.",
        }

    # Create broadcast history record
    broadcast = models.BroadcastHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        campaign_name=campaign_name,
        message=message,
        total_customers=total,
        success_count=0,
        failed_count=0,
        delivery_percentage=0.0,
        status="running",
    )
    db.add(broadcast)
    db.commit()

    success_count = 0
    failed_count = 0
    status_rows = []

    for customer in customers:
        # Personalize message with customer name
        personalized = message.replace("{Name}", customer["name"]).replace("{name}", customer["name"])

        result = whatsapp_service.send_text_message(customer["phone"], personalized, db=db, user_id=user_id)
        send_status = result.get("status", "failed")

        if send_status == "sent":
            success_count += 1
        else:
            failed_count += 1

        status_rows.append(
            models.MessageStatus(
                id=str(uuid.uuid4()),
                user_id=user_id,
                broadcast_id=broadcast.id,
                customer_id=customer["id"],
                customer_name=customer["name"],
                phone=result.get("phone") or whatsapp_service.normalize_phone_number(customer["phone"]),
                message=personalized,
                status=send_status,
                meta_message_id=result.get("meta_message_id"),
                error_message=result.get("error"),
            )
        )

    db.bulk_save_objects(status_rows)

    delivery_pct = round((success_count / total) * 100, 2) if total > 0 else 0.0

    # Update broadcast history
    broadcast.success_count = success_count
    broadcast.failed_count = failed_count
    broadcast.delivery_percentage = delivery_pct
    broadcast.status = "completed"
    db.commit()

    # Update campaign record if provided
    if campaign_id:
        campaign = db.query(models.WhatsAppCampaign).filter(
            models.WhatsAppCampaign.id == campaign_id
        ).first()
        if campaign:
            campaign.status = "completed"
            campaign.customers_reached = success_count
            db.commit()

    logger.info(
        "Broadcast '%s' completed: %d/%d sent (%.1f%%)",
        campaign_name, success_count, total, delivery_pct,
    )

    return {
        "status": "completed",
        "broadcast_id": broadcast.id,
        "total_customers": total,
        "success_count": success_count,
        "failed_count": failed_count,
        "delivery_percentage": delivery_pct,
        "message": f"Broadcast completed: {success_count}/{total} messages delivered ({delivery_pct}%)",
    }
