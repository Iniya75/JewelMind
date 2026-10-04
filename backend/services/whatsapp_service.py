import os
import logging
import re
import requests
from typing import Optional
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from .. import models

load_dotenv()

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v23.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


def _clean_env_value(value: str) -> str:
    value = (value or "").strip()
    if value.lower().startswith("your_"):
        return ""
    return value


def _looks_usable_access_token(token: str) -> bool:
    return bool(token and len(token.strip()) > 50)


def _looks_usable_phone_number_id(phone_id: str) -> bool:
    phone_id = (phone_id or "").strip()
    return bool(phone_id and phone_id.isdigit())


def _env_credentials() -> tuple[str, str, str]:
    token = _clean_env_value(os.getenv("WHATSAPP_ACCESS_TOKEN", ""))
    phone_id = _clean_env_value(os.getenv("WHATSAPP_PHONE_NUMBER_ID", ""))
    business_id = _clean_env_value(os.getenv("WHATSAPP_BUSINESS_ACCOUNT_ID", ""))
    return token, phone_id, business_id


def _get_credentials(db: Optional[Session] = None, user_id: Optional[str] = None) -> tuple[str, str, str]:
    """
    Get WhatsApp credentials for a given user.
    Falls back to legacy WhatsAppConfig or environment variables if not configured.
    Returns: (access_token, phone_number_id, business_account_id)
    """
    if db is not None and user_id is not None:
        try:
            # 1. Try new WhatsAppSettings first
            settings = db.query(models.WhatsAppSettings).filter(models.WhatsAppSettings.owner_id == user_id).first()
            if settings and settings.is_connected and settings.access_token and settings.phone_number_id:
                from .. import auth
                token = auth.decrypt_token(settings.access_token)
                phone_id = settings.phone_number_id
                if _looks_usable_access_token(token) and _looks_usable_phone_number_id(phone_id):
                    return token, phone_id, settings.business_account_id or ""
            
            # 2. Try legacy WhatsAppConfig next
            config = db.query(models.WhatsAppConfig).filter(models.WhatsAppConfig.user_id == user_id).first()
            if config and config.status == "Connected" and config.access_token and config.phone_number_id:
                from .. import auth
                token = _clean_env_value(auth.decrypt_token(config.access_token))
                phone_id = _clean_env_value(config.phone_number_id)
                if _looks_usable_access_token(token) and _looks_usable_phone_number_id(phone_id):
                    return token, phone_id, config.business_account_id or ""
                logger.warning("Stored credentials are not usable; falling back to .env credentials")
        except Exception as e:
            logger.error("Error reading WhatsApp settings from DB: %s", e)

    # Fallback to .env
    return _env_credentials()


def _get_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _messages_url(phone_id: str) -> str:
    return f"{GRAPH_API_BASE}/{phone_id}/messages"


def normalize_phone_number(phone: str) -> str:
    """Return a Meta Cloud API recipient number such as 919876543210."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not digits.startswith("91") and len(digits) == 10:
        digits = "91" + digits
    return digits


def send_text_message(phone: str, message: str, db: Optional[Session] = None, user_id: Optional[str] = None) -> dict:
    """
    Send a plain text WhatsApp message to a phone number.

    Args:
        phone: Recipient phone number in E.164 format.
        message: Message body text.
        db: Optional database session.
        user_id: Optional owner user ID.
    """
    token, phone_id, _ = _get_credentials(db, user_id)
    if not token or not phone_id:
        return {"status": "error", "error": "WhatsApp credentials not configured"}

    phone = normalize_phone_number(phone)

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"preview_url": False, "body": message},
    }

    try:
        resp = requests.post(
            _messages_url(phone_id),
            headers=_get_headers(token),
            json=payload,
            timeout=15,
        )
        data = resp.json()

        if resp.status_code == 200 and "messages" in data:
            msg_id = data["messages"][0].get("id", "")
            logger.info("WhatsApp message sent to %s — id: %s", phone, msg_id)
            return {"status": "sent", "meta_message_id": msg_id, "phone": phone}
        else:
            error_msg = data.get("error", {}).get("message", str(data))
            logger.warning("WhatsApp send failed for %s: %s", phone, error_msg)
            return {"status": "failed", "error": error_msg, "phone": phone}

    except requests.exceptions.Timeout:
        logger.error("WhatsApp API timeout for %s", phone)
        return {"status": "failed", "error": "Request timed out", "phone": phone}
    except Exception as exc:
        logger.error("WhatsApp send exception for %s: %s", phone, exc)
        return {"status": "failed", "error": str(exc), "phone": phone}


def send_image_message(phone: str, image_url: str, caption: str = "", db: Optional[Session] = None, user_id: Optional[str] = None) -> dict:
    """Send an image message via WhatsApp."""
    token, phone_id, _ = _get_credentials(db, user_id)
    if not token or not phone_id:
        return {"status": "error", "error": "WhatsApp credentials not configured"}

    phone = normalize_phone_number(phone)

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "image",
        "image": {"link": image_url, "caption": caption},
    }

    try:
        resp = requests.post(
            _messages_url(phone_id),
            headers=_get_headers(token),
            json=payload,
            timeout=15
        )
        data = resp.json()
        if resp.status_code == 200 and "messages" in data:
            return {"status": "sent", "meta_message_id": data["messages"][0].get("id", ""), "phone": phone}
        return {"status": "failed", "error": data.get("error", {}).get("message", str(data)), "phone": phone}
    except Exception as exc:
        return {"status": "failed", "error": str(exc), "phone": phone}


def send_document_message(phone: str, doc_url: str, filename: str = "document.pdf", caption: str = "", db: Optional[Session] = None, user_id: Optional[str] = None) -> dict:
    """Send a PDF document message via WhatsApp."""
    token, phone_id, _ = _get_credentials(db, user_id)
    if not token or not phone_id:
        return {"status": "error", "error": "WhatsApp credentials not configured"}

    phone = normalize_phone_number(phone)

    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "document",
        "document": {"link": doc_url, "filename": filename, "caption": caption},
    }

    try:
        resp = requests.post(
            _messages_url(phone_id),
            headers=_get_headers(token),
            json=payload,
            timeout=15
        )
        data = resp.json()
        if resp.status_code == 200 and "messages" in data:
            return {"status": "sent", "meta_message_id": data["messages"][0].get("id", ""), "phone": phone}
        return {"status": "failed", "error": data.get("error", {}).get("message", str(data)), "phone": phone}
    except Exception as exc:
        return {"status": "failed", "error": str(exc), "phone": phone}


def send_template_message(
    phone: str,
    template_name: str,
    language_code: str = "en",
    components: Optional[list] = None,
    db: Optional[Session] = None,
    user_id: Optional[str] = None
) -> dict:
    """Send a pre-approved WhatsApp template message."""
    token, phone_id, _ = _get_credentials(db, user_id)
    if not token or not phone_id:
        return {"status": "error", "error": "WhatsApp credentials not configured"}

    phone = normalize_phone_number(phone)

    template_payload: dict = {"name": template_name, "language": {"code": language_code}}
    if components:
        template_payload["components"] = components

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": template_payload,
    }

    try:
        resp = requests.post(
            _messages_url(phone_id),
            headers=_get_headers(token),
            json=payload,
            timeout=15
        )
        data = resp.json()
        if resp.status_code == 200 and "messages" in data:
            return {"status": "sent", "meta_message_id": data["messages"][0].get("id", ""), "phone": phone}
        return {"status": "failed", "error": data.get("error", {}).get("message", str(data)), "phone": phone}
    except Exception as exc:
        return {"status": "failed", "error": str(exc), "phone": phone}
