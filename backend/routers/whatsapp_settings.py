import logging
import uuid
import requests
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from .. import models, auth, database, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/whatsapp/settings", tags=["whatsapp-settings"])

def mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 8:
        return "****"
    return token[:4] + "*" * (min(len(token), 35) - 4)

def validate_meta_credentials(access_token: str, phone_number_id: str) -> bool:
    url = f"https://graph.facebook.com/v23.0/{phone_number_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        logger.warning(f"Meta Graph API credentials validation failed: {e}")
        return False

@router.get("", response_model=schemas.WhatsAppSettingsResponse)
def get_whatsapp_settings(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    settings = db.query(models.WhatsAppSettings).filter(models.WhatsAppSettings.owner_id == current_user.id).first()
    
    webhook_url = f"{request.base_url}api/whatsapp/webhook"
    
    if not settings:
        return schemas.WhatsAppSettingsResponse(
            phone_number_id=None,
            business_account_id=None,
            access_token=None,
            verify_token=None,
            is_connected=False,
            webhook_url=webhook_url,
            festival_campaigns=False,
            invoice_notifications=False,
            payment_reminders=False,
            new_collection_announcements=False,
            birthday_wishes=False,
            order_status_updates=False,
        )
        
    decrypted_token = auth.decrypt_token(settings.access_token) if settings.access_token else ""
    decrypted_verify_token = auth.decrypt_token(settings.verify_token) if settings.verify_token else ""
    masked = mask_token(decrypted_token)
    
    return schemas.WhatsAppSettingsResponse(
        phone_number_id=settings.phone_number_id,
        business_account_id=settings.business_account_id,
        access_token=masked,
        verify_token=mask_token(decrypted_verify_token),
        is_connected=settings.is_connected,
        webhook_url=webhook_url,
        festival_campaigns=settings.festival_campaigns,
        invoice_notifications=settings.invoice_notifications,
        payment_reminders=settings.payment_reminders,
        new_collection_announcements=settings.new_collection_announcements,
        birthday_wishes=settings.birthday_wishes,
        order_status_updates=settings.order_status_updates,
    )

@router.post("", response_model=schemas.WhatsAppSettingsResponse)
def create_whatsapp_settings(
    req: schemas.WhatsAppSettingsBase,
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    settings = db.query(models.WhatsAppSettings).filter(models.WhatsAppSettings.owner_id == current_user.id).first()
    if not settings:
        settings = models.WhatsAppSettings(
            id=str(uuid.uuid4()),
            owner_id=current_user.id,
            is_connected=False
        )
        db.add(settings)
        
    # Update configuration fields
    if req.phone_number_id is not None:
        settings.phone_number_id = req.phone_number_id.strip() if req.phone_number_id else None
    if req.business_account_id is not None:
        settings.business_account_id = req.business_account_id.strip() if req.business_account_id else None
    if req.verify_token is not None and "*" not in req.verify_token:
        verify_token = req.verify_token.strip()
        settings.verify_token = auth.encrypt_token(verify_token) if verify_token else None
        
    # Access token logic: if masked, keep existing. If new, encrypt and save
    if req.access_token and "*" not in req.access_token:
        settings.access_token = auth.encrypt_token(req.access_token.strip())

    if settings.access_token and not settings.access_token.startswith("gAAAA"):
        settings.access_token = auth.encrypt_token(auth.decrypt_token(settings.access_token))
    if settings.verify_token and not settings.verify_token.startswith("gAAAA"):
        settings.verify_token = auth.encrypt_token(auth.decrypt_token(settings.verify_token))
        
    settings.festival_campaigns = req.festival_campaigns
    settings.invoice_notifications = req.invoice_notifications
    settings.payment_reminders = req.payment_reminders
    settings.new_collection_announcements = req.new_collection_announcements
    settings.birthday_wishes = req.birthday_wishes
    settings.order_status_updates = req.order_status_updates
    
    # Auto-validate if details are provided
    decrypted_token = auth.decrypt_token(settings.access_token) if settings.access_token else ""
    decrypted_verify_token = auth.decrypt_token(settings.verify_token) if settings.verify_token else ""
    if decrypted_token and settings.phone_number_id:
        is_valid = validate_meta_credentials(decrypted_token, settings.phone_number_id)
        settings.is_connected = is_valid
    else:
        settings.is_connected = False
        
    db.commit()
    db.refresh(settings)
    
    webhook_url = f"{request.base_url}api/whatsapp/webhook"
    return schemas.WhatsAppSettingsResponse(
        phone_number_id=settings.phone_number_id,
        business_account_id=settings.business_account_id,
        access_token=mask_token(decrypted_token),
        verify_token=mask_token(decrypted_verify_token),
        is_connected=settings.is_connected,
        webhook_url=webhook_url,
        festival_campaigns=settings.festival_campaigns,
        invoice_notifications=settings.invoice_notifications,
        payment_reminders=settings.payment_reminders,
        new_collection_announcements=settings.new_collection_announcements,
        birthday_wishes=settings.birthday_wishes,
        order_status_updates=settings.order_status_updates,
    )

@router.put("", response_model=schemas.WhatsAppSettingsResponse)
def update_whatsapp_settings(
    req: schemas.WhatsAppSettingsBase,
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return create_whatsapp_settings(req, request, db, current_user)

@router.delete("", response_model=schemas.WhatsAppSettingsResponse)
def delete_whatsapp_settings(
    request: Request,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    settings = db.query(models.WhatsAppSettings).filter(models.WhatsAppSettings.owner_id == current_user.id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="No WhatsApp settings found")
        
    db.delete(settings)
    db.commit()
    
    webhook_url = f"{request.base_url}api/whatsapp/webhook"
    return schemas.WhatsAppSettingsResponse(
        phone_number_id=None,
        business_account_id=None,
        access_token=None,
        verify_token=None,
        is_connected=False,
        webhook_url=webhook_url,
        festival_campaigns=False,
        invoice_notifications=False,
        payment_reminders=False,
        new_collection_announcements=False,
        birthday_wishes=False,
        order_status_updates=False,
    )

@router.post("/test-connection")
def test_connection(
    req: schemas.WhatsAppTestConnectionRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    access_token = req.access_token
    settings = db.query(models.WhatsAppSettings).filter(models.WhatsAppSettings.owner_id == current_user.id).first()
    if "*" in access_token:
        if settings and settings.access_token:
            access_token = auth.decrypt_token(settings.access_token)
        else:
            raise HTTPException(status_code=400, detail="Stored access token not found for testing")

    verify_token = req.verify_token
    if "*" in verify_token:
        if settings and settings.verify_token:
            verify_token = auth.decrypt_token(settings.verify_token)
        else:
            raise HTTPException(status_code=400, detail="Stored verify token not found for testing")
            
    is_valid = validate_meta_credentials(access_token, req.phone_number_id)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid token or configuration.")
        
    recipient_phone = current_user.phone
    if not recipient_phone:
        raise HTTPException(
            status_code=400,
            detail="Store owner has no registered phone number to send a test message to. Please update your profile with a phone number first."
        )
        
    # Set momentarily in DB so send_text_message utilizes these settings
    if not settings:
        settings = models.WhatsAppSettings(
            id=str(uuid.uuid4()),
            owner_id=current_user.id
        )
        db.add(settings)
        
    settings.phone_number_id = req.phone_number_id
    settings.business_account_id = req.business_account_id
    settings.access_token = auth.encrypt_token(access_token)
    settings.verify_token = auth.encrypt_token(verify_token.strip()) if verify_token.strip() else None
    settings.is_connected = True
    db.commit()
    
    from ..services import whatsapp_service
    send_result = whatsapp_service.send_text_message(
        phone=recipient_phone,
        message="Hello from JewelMind AI! This is a test message to verify your WhatsApp Business integration. Connection is successful.",
        db=db,
        user_id=current_user.id
    )
    
    if send_result.get("status") == "sent":
        return {"message": "WhatsApp connected successfully."}
    else:
        template_result = whatsapp_service.send_template_message(
            phone=recipient_phone,
            template_name="hello_world",
            db=db,
            user_id=current_user.id
        )
        if template_result.get("status") == "sent":
            return {"message": "WhatsApp connected successfully."}
        else:
            error_msg = send_result.get("error") or template_result.get("error") or "Failed to send test message."
            raise HTTPException(status_code=400, detail=f"Meta API error: {error_msg}")
