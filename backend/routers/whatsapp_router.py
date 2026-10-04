"""
whatsapp_router.py
==================
FastAPI router for all WhatsApp Automation and AI Agent endpoints.
"""
import asyncio
import logging
import os
import sys
import subprocess
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, auth, database
from ..services import (
    whatsapp_service,
    campaign_service,
    broadcast_service,
    analytics_service,
    conversation_service,
)
from ..services.business_query_service import answer_business_query
from ..services.voice_service import transcribe_audio

logger = logging.getLogger(__name__)

# Add root and agent paths for importing sub-agents globally
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
agent_dir = os.path.join(root_dir, "my_agent")
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if agent_dir not in sys.path:
    sys.path.insert(0, agent_dir)

# Google ADK/GenAI dependencies removed. Using OpenAI Realtime and Chat completions.


def detect_intent(text: str) -> str:
    lower = text.lower()
    if "pending" in lower or "owe" in lower or "outstanding" in lower or "balance" in lower:
        return "Pending payments"
    elif "customer" in lower or "bought" in lower or "client" in lower or "buyer" in lower or "names" in lower:
        return "Customer information"
    elif "sales" in lower or "sale" in lower or "revenue" in lower or "sold" in lower or "turnover" in lower or "billing" in lower or "lakh" in lower:
        return "Sales information"
    elif "stock" in lower or "inventory" in lower or "product" in lower or "products" in lower or "item" in lower or "items" in lower:
        return "Inventory status"
    elif "predict" in lower or "forecast" in lower or "demand" in lower or "future" in lower or "next month" in lower:
        return "Demand prediction"
    elif "page" in lower or "website" in lower or "do" in lower or "feature" in lower or "purpose" in lower or "jewelmind" in lower:
        return "Website explanation"
    elif "advice" in lower or "improve" in lower or "insights" in lower or "growth" in lower or "strategy" in lower or "business" in lower or "recommend" in lower:
        return "Business advice"
    else:
        return "General conversation"


router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    phone: str
    message: str
    message_type: str = "text"  # text / image / document / template
    media_url: Optional[str] = None
    filename: Optional[str] = None


class CustomerWhatsAppRequest(BaseModel):
    message: str


class BroadcastRequest(BaseModel):
    campaign_name: str
    message: str
    target_group: str  # all / premium / inactive / city:<name> / spend_above:<amount>


class CreateCampaignRequest(BaseModel):
    campaign_name: str
    message: str
    target_group: str
    scheduled_at: Optional[str] = None  # ISO datetime string


class ScheduleRequest(BaseModel):
    campaign_name: str
    message: str
    target_group: str
    scheduled_at: str  # ISO datetime string


class AgentChatRequest(BaseModel):
    message: str


class SegmentCountRequest(BaseModel):
    target_group: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/send-message")
def send_message(
    req: SendMessageRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Send a single WhatsApp message to a phone number."""
    if req.message_type == "image" and req.media_url:
        result = whatsapp_service.send_image_message(req.phone, req.media_url, req.message, db=db, user_id=current_user.id)
    elif req.message_type == "document" and req.media_url:
        result = whatsapp_service.send_document_message(
            req.phone, req.media_url, req.filename or "document.pdf", req.message, db=db, user_id=current_user.id
        )
    elif req.message_type == "template":
        result = whatsapp_service.send_template_message(req.phone, req.message, db=db, user_id=current_user.id)
    else:
        result = whatsapp_service.send_text_message(req.phone, req.message, db=db, user_id=current_user.id)

    if result.get("status") == "error":
        raise HTTPException(status_code=503, detail=result.get("error", "WhatsApp service error"))

    return result


@router.post("/send/{customer_id}")
def send_customer_message(
    customer_id: str,
    req: CustomerWhatsAppRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Send a WhatsApp text message to a customer using the stored customer phone number."""
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.user_id == current_user.id,
            (models.Customer.id == customer_id) | (models.Customer.customer_id == customer_id),
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    raw_phone = customer.phone_number or customer.phone or ""
    phone_number = whatsapp_service.normalize_phone_number(raw_phone)
    if not phone_number:
        raise HTTPException(status_code=400, detail="Customer does not have a phone number")

    result = whatsapp_service.send_text_message(
        phone_number,
        message,
        db=db,
        user_id=current_user.id,
    )

    status_value = "sent" if result.get("status") == "sent" else "failed"
    wamid = result.get("meta_message_id") or result.get("wamid")
    record = models.WhatsAppMessage(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        customer_id=customer.id,
        phone_number=phone_number,
        message=message,
        wamid=wamid,
        status=status_value,
        created_at=datetime.utcnow(),
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception as exc:
        db.rollback()
        logger.error("Could not save WhatsApp message for customer %s: %s", customer.id, exc)
        raise HTTPException(status_code=500, detail="Message send result could not be saved")

    if status_value != "sent":
        raise HTTPException(
            status_code=503,
            detail=result.get("error", "Failed to send WhatsApp message"),
        )

    return {
        "status": "sent",
        "customer_id": customer.id,
        "customer_name": customer.name,
        "phone_number": phone_number,
        "wamid": wamid,
        "message_id": record.id,
        "created_at": record.created_at.isoformat(),
    }


@router.post("/broadcast")
def broadcast_message(
    req: BroadcastRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Broadcast a WhatsApp message to a customer segment."""
    # First create the campaign record
    campaign = campaign_service.create_campaign(
        db=db,
        user_id=current_user.id,
        campaign_name=req.campaign_name,
        message=req.message,
        target_group=req.target_group,
    )

    # Execute the broadcast
    result = broadcast_service.execute_broadcast(
        db=db,
        user_id=current_user.id,
        campaign_name=req.campaign_name,
        message=req.message,
        target_group=req.target_group,
        campaign_id=campaign.id,
    )

    return result


@router.post("/create-campaign")
def create_campaign(
    req: CreateCampaignRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Create a WhatsApp campaign (optionally scheduled)."""
    scheduled_at = None
    if req.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scheduled_at format. Use ISO 8601.")

    campaign = campaign_service.create_campaign(
        db=db,
        user_id=current_user.id,
        campaign_name=req.campaign_name,
        message=req.message,
        target_group=req.target_group,
        scheduled_at=scheduled_at,
    )

    return {
        "id": campaign.id,
        "campaign_name": campaign.campaign_name,
        "target_group": campaign.target_group,
        "status": campaign.status,
        "scheduled_at": campaign.scheduled_at.isoformat() if campaign.scheduled_at else None,
        "created_at": campaign.created_at.isoformat(),
    }


@router.post("/schedule")
def schedule_campaign(
    req: ScheduleRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Schedule a WhatsApp campaign for future delivery."""
    try:
        scheduled_at = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scheduled_at format. Use ISO 8601.")

    campaign = campaign_service.create_campaign(
        db=db,
        user_id=current_user.id,
        campaign_name=req.campaign_name,
        message=req.message,
        target_group=req.target_group,
        scheduled_at=scheduled_at,
    )

    return {
        "id": campaign.id,
        "campaign_name": campaign.campaign_name,
        "scheduled_at": campaign.scheduled_at.isoformat(),
        "status": campaign.status,
        "message": f"Campaign '{req.campaign_name}' scheduled for {scheduled_at.strftime('%d %b %Y %I:%M %p')}",
    }


@router.get("/history")
def get_history(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get campaign history for the current user."""
    return campaign_service.get_campaigns(db=db, user_id=current_user.id)


@router.get("/analytics")
def get_analytics(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get aggregated WhatsApp delivery analytics."""
    return analytics_service.get_analytics(db=db, user_id=current_user.id)


@router.get("/delivery-status")
def get_delivery_status(
    broadcast_id: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get per-customer delivery status, optionally filtered by broadcast_id."""
    return analytics_service.get_delivery_status(
        db=db, user_id=current_user.id, broadcast_id=broadcast_id, limit=limit
    )


@router.get("/segments")
def get_segments(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get available customer segments with counts."""
    return analytics_service.get_customer_segments_summary(db=db, user_id=current_user.id)


@router.post("/segment-count")
def get_segment_count(
    req: SegmentCountRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get estimated customer count for a segment (for campaign preview)."""
    count = broadcast_service.get_segment_count(db=db, user_id=current_user.id, target_group=req.target_group)
    return {"target_group": req.target_group, "estimated_count": count}


# ─── AI Agent Endpoints ───────────────────────────────────────────────────────

@router.get("/agent/knowledge")
def get_agent_knowledge(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get complete website & database knowledge summary from MySQL."""
    from ..services.business_query_service import build_business_context
    return build_business_context(db, current_user.id, "")


@router.post("/agent/chat")
async def agent_chat(
    req: AgentChatRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Send a text message to the OpenAI-backed agent.
    Saves conversation to MySQL.
    """
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_key:
        return {
            "user_message": req.message,
            "agent_response": "I couldn't access the business data right now. Please try again.",
            "executed_tool": None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    try:
        from openai import OpenAI
        from .realtime_router import execute_agent_tool, TOOLS, get_realtime_system_instructions, get_display_name
        
        client = OpenAI(api_key=openai_key)

        # Retrieve user history
        history_rows = (
            db.query(models.AgentConversation)
            .filter(models.AgentConversation.user_id == current_user.id)
            .order_by(models.AgentConversation.timestamp.desc())
            .limit(5)
            .all()
        )
        
        messages = [
            {"role": "system", "content": get_realtime_system_instructions(get_display_name(current_user), current_user.shop_name)}
        ]
        
        for r in reversed(history_rows):
            messages.append({"role": "user", "content": r.user_message})
            messages.append({"role": "assistant", "content": r.agent_response})
            
        messages.append({"role": "user", "content": req.message})

        executed_tool = None
        tool_result_str = None

        chat_tools = []
        for t in TOOLS:
            chat_tools.append({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"]
                }
            })

        for attempt in range(5):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=chat_tools,
                tool_choice="auto"
            )
            
            choice = response.choices[0]
            message_obj = choice.message
            
            if message_obj.tool_calls:
                messages.append(message_obj)
                for tool_call in message_obj.tool_calls:
                    func_name = tool_call.function.name
                    func_args_str = tool_call.function.arguments
                    try:
                        func_args = json.loads(func_args_str)
                    except Exception:
                        func_args = {}
                        
                    executed_tool = func_name
                    result = execute_agent_tool(func_name, func_args, db, current_user.id)
                    tool_result_str = json.dumps(result)
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": func_name,
                        "content": tool_result_str
                    })
                continue
            
            agent_response = message_obj.content or "Request completed."
            break
        else:
            agent_response = "I processed your request, but took too many steps."

    except Exception as e:
        logger.exception("Error in agent_chat endpoint")
        agent_response = "I couldn't access the business data right now. Please try again."
        executed_tool = None
        tool_result_str = None

    # Save conversation
    conversation_service.save_conversation(
        db=db,
        user_id=current_user.id,
        user_message=req.message,
        agent_response=agent_response,
        executed_tool=executed_tool,
        tool_result=tool_result_str,
    )

    return {
        "user_message": req.message,
        "agent_response": agent_response,
        "executed_tool": executed_tool,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/agent/voice")
async def agent_voice(
    request: Request,
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Accept audio file from frontend, transcribe via OpenAI Whisper, send to OpenAI agent.
    """
    if file is None:
        return {
            "success": False,
            "message": "No audio received.",
            "agent_response": "I'm reconnecting to your business dashboard. Please give me a moment."
        }

    audio_bytes = await file.read()
    if not audio_bytes:
        return {
            "success": False,
            "message": "No audio received.",
            "agent_response": "I'm reconnecting to your business dashboard. Please give me a moment."
        }

    mime_type = file.content_type or "audio/webm"

    # Transcribe
    transcribed, error_msg = transcribe_audio(audio_bytes, mime_type)
    
    response_log = ""

    if error_msg:
        logger.warning("[VOICE] Audio transcription failed")
        if "rate limit" in error_msg.lower() or "429" in error_msg:
            response_log = "I'm currently handling many requests. Please try again in a minute."
            agent_res = {
                "success": False,
                "message": response_log,
                "agent_response": response_log
            }
        else:
            response_log = "Voice transcription failed. Please try again."
            agent_res = {
                "success": False,
                "message": error_msg,
                "agent_response": error_msg
            }
            agent_res["message"] = response_log
            agent_res["agent_response"] = response_log
        return agent_res

    # Check if speech is empty
    transcribed_clean = transcribed.strip() if transcribed else ""
    if not transcribed_clean:
        response_log = "I couldn't hear you clearly. Please try speaking again."
        return {
            "transcribed_text": "",
            "user_message": "",
            "agent_response": response_log,
            "executed_tool": None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    # Check if speech is unclear/garbage
    if len(transcribed_clean) <= 1 or transcribed_clean.lower() in ["um", "uh", "ah", "oh"]:
        response_log = "I didn't catch that clearly. Could you please repeat?"
        return {
            "transcribed_text": transcribed_clean,
            "user_message": transcribed_clean,
            "agent_response": response_log,
            "executed_tool": None,
            "timestamp": datetime.utcnow().isoformat(),
        }

    req_obj = AgentChatRequest(message=transcribed_clean)
    chat_res = await agent_chat(req_obj, db, current_user)

    return {
        "transcribed_text": transcribed_clean,
        "user_message": transcribed_clean,
        "agent_response": chat_res["agent_response"],
        "executed_tool": chat_res["executed_tool"],
        "timestamp": chat_res["timestamp"],
    }


@router.get("/agent/conversations")
def get_conversations(
    limit: int = 30,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get conversation history for the current user."""
    return conversation_service.get_conversations(db=db, user_id=current_user.id, limit=limit)
