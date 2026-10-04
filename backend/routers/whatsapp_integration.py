import logging
import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, auth, database

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp-config", tags=["whatsapp-config"])

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ConnectRequest(BaseModel):
    business_name: str
    business_number: str
    business_account_id: Optional[str] = None
    phone_number_id: Optional[str] = None
    access_token: Optional[str] = None

class WhatsAppConfigResponse(BaseModel):
    business_name: str
    business_number: str
    business_account_id: Optional[str] = None
    phone_number_id: Optional[str] = None
    status: str
    updated_at: str

# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status", response_model=WhatsAppConfigResponse)
def get_whatsapp_status(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Fetch connection status and credentials for current shop."""
    config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.user_id == current_user.id).first()
    
    if not config:
        return {
            "business_name": "",
            "business_number": "",
            "business_account_id": None,
            "phone_number_id": None,
            "status": "Disconnected",
            "updated_at": datetime.utcnow().isoformat()
        }
        
    return {
        "business_name": config.business_name,
        "business_number": config.business_number,
        "business_account_id": config.business_account_id,
        "phone_number_id": config.phone_number_id,
        "status": config.status,
        "updated_at": config.updated_at.isoformat()
    }


@router.post("/connect", response_model=WhatsAppConfigResponse)
def connect_whatsapp(
    req: ConnectRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Connect a Meta WhatsApp account.
    Simulates the Meta OAuth popup redirect, code exchange, and token acquisition.
    """
    if not req.business_name.strip() or not req.business_number.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Business name and number are required."
        )

    # Clean the business number: strip non-digits
    clean_number = "".join(filter(str.isdigit, req.business_number))
    if not clean_number.startswith("91") and len(clean_number) == 10:
        clean_number = "91" + clean_number
    elif len(clean_number) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid 10-digit phone number."
        )

    # Look up existing config or create a new one
    config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.user_id == current_user.id).first()
    
    if not config:
        config = models.WhatsAppConfig(
            id=str(uuid.uuid4()),
            user_id=current_user.id
        )
        db.add(config)

    access_token = (req.access_token or os.getenv("WHATSAPP_ACCESS_TOKEN", "")).strip()
    phone_number_id = (req.phone_number_id or os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")).strip()
    business_account_id = (req.business_account_id or os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", "")).strip()

    if (
        not access_token
        or not phone_number_id
        or access_token.lower().startswith("your_")
        or phone_number_id.lower().startswith("your_")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Meta WhatsApp ACCESS_TOKEN and PHONE_NUMBER_ID are required.",
        )

    config.business_name = req.business_name
    config.business_number = f"+{clean_number}"
    config.business_account_id = business_account_id or None
    config.phone_number_id = phone_number_id
    config.access_token = auth.encrypt_token(access_token)
    config.status = "Connected"
    config.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(config)
        logger.info(
            f"Shop {current_user.id} successfully connected Meta WhatsApp (+{clean_number})"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving WhatsApp configuration: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save connection details."
        )

    return {
        "business_name": config.business_name,
        "business_number": config.business_number,
        "business_account_id": config.business_account_id,
        "phone_number_id": config.phone_number_id,
        "status": config.status,
        "updated_at": config.updated_at.isoformat()
    }


@router.post("/disconnect", response_model=WhatsAppConfigResponse)
def disconnect_whatsapp(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Disconnects and removes Meta WhatsApp credentials for current shop."""
    config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.user_id == current_user.id).first()
    
    if not config:
         raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No connected WhatsApp Business account found."
         )

    # Keep business name/number but clear credentials and set to Disconnected
    config.business_account_id = None
    config.phone_number_id = None
    config.access_token = None
    config.status = "Disconnected"
    config.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(config)
        logger.info(f"Shop {current_user.id} disconnected Meta WhatsApp")
    except Exception as e:
        db.rollback()
        logger.error(f"Error disconnecting WhatsApp config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not disconnect account."
        )

    return {
        "business_name": config.business_name,
        "business_number": config.business_number,
        "business_account_id": None,
        "phone_number_id": None,
        "status": config.status,
        "updated_at": config.updated_at.isoformat()
    }
