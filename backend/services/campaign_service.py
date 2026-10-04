"""
campaign_service.py
===================
Service for creating and retrieving WhatsApp campaigns from MySQL.
"""

import uuid
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)


def create_campaign(
    db: Session,
    user_id: str,
    campaign_name: str,
    message: str,
    target_group: str,
    scheduled_at: Optional[datetime] = None,
) -> models.WhatsAppCampaign:
    """Create and persist a new WhatsApp campaign."""
    campaign = models.WhatsAppCampaign(
        id=str(uuid.uuid4()),
        user_id=user_id,
        campaign_name=campaign_name,
        message=message,
        target_group=target_group,
        status="scheduled" if scheduled_at else "pending",
        scheduled_at=scheduled_at,
        customers_reached=0,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    logger.info("Campaign created: %s (id=%s)", campaign_name, campaign.id)
    return campaign


def get_campaigns(db: Session, user_id: str, limit: int = 50) -> list:
    """Retrieve campaigns for a user, most recent first."""
    campaigns = (
        db.query(models.WhatsAppCampaign)
        .filter(models.WhatsAppCampaign.user_id == user_id)
        .order_by(models.WhatsAppCampaign.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": c.id,
            "campaign_name": c.campaign_name,
            "message": c.message,
            "target_group": c.target_group,
            "customers_reached": c.customers_reached,
            "status": c.status,
            "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
            "created_at": c.created_at.isoformat(),
        }
        for c in campaigns
    ]


def update_campaign_status(
    db: Session,
    campaign_id: str,
    status: str,
    customers_reached: int = 0,
) -> None:
    """Update campaign status after execution."""
    campaign = db.query(models.WhatsAppCampaign).filter(
        models.WhatsAppCampaign.id == campaign_id
    ).first()
    if campaign:
        campaign.status = status
        campaign.customers_reached = customers_reached
        db.commit()


def get_scheduled_pending(db: Session) -> list:
    """Retrieve campaigns that are scheduled and due for execution."""
    now = datetime.utcnow()
    return (
        db.query(models.WhatsAppCampaign)
        .filter(
            models.WhatsAppCampaign.status == "scheduled",
            models.WhatsAppCampaign.scheduled_at <= now,
        )
        .all()
    )
