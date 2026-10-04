"""
realtime_router.py
==================
FastAPI router for real-time voice and chat using OpenAI Realtime API.
Includes a secure WebSocket proxy to avoid exposing API keys to the browser,
and handles function calling (tools) on behalf of the client.
"""

import os
import json
import uuid
import logging
import asyncio
import traceback
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from pydantic import BaseModel
import jwt
import websockets
from sqlalchemy.orm import Session
from sqlalchemy import text

from .. import models, schemas, database, auth
from ..config import OPENAI_TEXT_MODEL, OPENAI_REALTIME_MODEL
from ..services import whatsapp_service, prediction_service
from ..services.gold_rate_service import get_latest_rate, serialize_rate
from ..services.business_query_service import build_business_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/realtime", tags=["realtime"])


class AgentChatRequest(BaseModel):
    message: str


# ─── Safe Display Name Helper ─────────────────────────────────────────────────

def get_display_name(user: models.User) -> str:
    """
    Safely resolve a human-readable display name for the user.
    The User model has owner_name, shop_name, and email — NOT a 'name' field.
    """
    return (
        (user.owner_name or "").strip()
        or (user.shop_name or "").strip()
        or (user.email or "").strip()
        or "Owner"
    )


# ─── OpenAI Tool Definitions ──────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "name": "get_dashboard_summary",
        "description": "Get summary metrics for the business dashboard including today's sales, monthly sales, pending payments, inventory value.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "type": "function",
        "name": "get_sales_report",
        "description": "Get a detailed sales report, optionally filtered by product category and/or month.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Optional category filter (e.g. Gold Necklace, Silver Ring)"
                },
                "month": {
                    "type": "string",
                    "description": "Optional month filter in YYYY-MM format or name (e.g. 2026-07)"
                }
            }
        }
    },
    {
        "type": "function",
        "name": "get_inventory",
        "description": "Get current inventory stock levels, optionally low stock items only.",
        "parameters": {
            "type": "object",
            "properties": {
                "low_stock_only": {
                    "type": "boolean",
                    "description": "If true, only returns items running low (stock quantity <= 3)."
                }
            }
        }
    },
    {
        "type": "function",
        "name": "get_pending_payments",
        "description": "Get a list of customers with outstanding/pending balances and unpaid invoices.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "type": "function",
        "name": "get_customer_details",
        "description": "Search and get customer details (contact, city, total purchase amount, outstanding balance) by customer name.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The customer's name to search for."
                }
            },
            "required": ["name"]
        }
    },
    {
        "type": "function",
        "name": "predict_sales",
        "description": "Predict future product sales using the XGBoost ML model based on current category, gold rate, and festival/wedding season status.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Category of jewelry (e.g., Gold Necklace, Silver Ring)"
                },
                "gold_rate": {
                    "type": "number",
                    "description": "Current gold rate per gram."
                },
                "festival": {
                    "type": "string",
                    "description": "Name of the festival if any (e.g., Akshaya Tritiya, Diwali, or 'No')."
                }
            },
            "required": ["category", "gold_rate"]
        }
    },
    {
        "type": "function",
        "name": "predict_demand",
        "description": "Predict future product demand (units) using the XGBoost ML model based on current category, gold rate, and festival/wedding season status.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Category of jewelry (e.g., Gold Necklace, Silver Ring)"
                },
                "gold_rate": {
                    "type": "number",
                    "description": "Current gold rate per gram."
                },
                "festival": {
                    "type": "string",
                    "description": "Name of the festival if any (e.g., Akshaya Tritiya, Diwali, or 'No')."
                }
            },
            "required": ["category", "gold_rate"]
        }
    },
    {
        "type": "function",
        "name": "analyze_profit",
        "description": "Get total revenue, total expenses, and net profit analysis of the store.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "type": "function",
        "name": "gold_rate",
        "description": "Get today's latest live gold rates for 22K and 24K gold, and silver.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "type": "function",
        "name": "send_whatsapp",
        "description": "Send a WhatsApp marketing or notification message to a specific customer using their customer ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "customer_id": {
                    "type": "string",
                    "description": "Unique ID of the customer in the system."
                },
                "message": {
                    "type": "string",
                    "description": "The message body/text to send."
                }
            },
            "required": ["customer_id", "message"]
        }
    }
]


# ─── System Instructions & Persona ────────────────────────────────────────────

def get_realtime_system_instructions(display_name: str, shop_name: str) -> str:
    today = datetime.now().strftime("%A, %d %B %Y")
    return f"""You are JewelMind AI — the personal business voice assistant for {display_name}, owner of {shop_name or "their jewelry shop"}. Today is {today}.

Your Personality:
- You sound exactly like a warm, intelligent, human business consultant — NOT a robot.
- Your voice is natural, friendly, confident, calm and expressive. You speak in a professional yet conversational tone.
- You are already familiar with the shop and the owner. Greet warmly once at session start. After that, skip greetings — go straight to the answer.
- Keep every response SHORT and SPOKEN-FRIENDLY — ideally 2 to 3 sentences. Your output is read aloud by a text-to-speech voice engine, so write exactly as you would naturally speak.
- NEVER use markdown, bullets, numbers, asterisks, hash marks, dashes, or any symbols in your responses. Write complete natural sentences only.
- Say numbers and currency naturally: say "one point eight two lakh rupees" not "1.82 lakh", say "twelve percent" not "12%", say "three customers with dues" not a table.
- Do NOT say "How can I help you?" or "Is there anything else?" repeatedly. Keep the conversation natural, like a real colleague.
- If a user says hello, good morning, or thanks — respond naturally and warmly in one sentence.

Core Behavior:
- For ALL business questions, call the appropriate tool FIRST. Never guess or hallucinate data.
- Always use live data from the database tools to answer sales, inventory, customer, profit, or gold rate questions.
- Maintain full conversation context. Understand follow-up questions like "What about last month?", "Compare with April", or "Who has the highest dues?" without asking the user to repeat.
- If a tool returns no data, say naturally: "There are no records for that query right now."
- If you don't know something, say honestly: "I don't have that information yet. You may want to check manually."
- After giving business data, offer one natural follow-up suggestion if relevant (like "Would you like me to send a reminder to that customer?").
"""


# ─── Tool Executions ──────────────────────────────────────────────────────────

def execute_agent_tool(tool_name: str, args: Dict[str, Any], db: Session, user_id: str) -> Dict[str, Any]:
    """Execute the database/service query corresponding to the tool name."""
    logger.info(f"Executing tool {tool_name} for user {user_id}")
    try:
        if tool_name == "get_dashboard_summary":
            context = build_business_context(db, user_id, "")
            return {
                "status": "success",
                "today_sales": context.get("today_sales", 0),
                "monthly_revenue": context.get("monthly_revenue", 0),
                "total_revenue": context.get("total_revenue", 0),
                "pending_payments": context.get("pending_payments", 0),
                "total_expenses": context.get("total_expenses", 0),
                "net_profit": context.get("profit", 0),
                "customer_count": context.get("customers", 0),
                "inventory_value": context.get("inventory_value", 0),
                "low_stock_count": len(context.get("low_stock", []))
            }

        elif tool_name == "get_sales_report":
            category = args.get("category")
            month = args.get("month")

            if category and month:
                stmt = """
                    SELECT p.category, COALESCE(SUM(oi.total), 0) AS revenue, COALESCE(SUM(oi.quantity), 0) AS units_sold
                    FROM bill_items oi
                    JOIN products p ON p.id = oi.product_id
                    JOIN bills o ON o.id = oi.bill_id
                    WHERE o.user_id = :user_id AND p.category LIKE :category AND o.date LIKE :month
                    GROUP BY p.category
                """
                params = {"user_id": user_id, "category": f"%{category}%", "month": f"{month}%"}
            elif category:
                stmt = """
                    SELECT p.category, COALESCE(SUM(oi.total), 0) AS revenue, COALESCE(SUM(oi.quantity), 0) AS units_sold
                    FROM bill_items oi
                    JOIN products p ON p.id = oi.product_id
                    JOIN bills o ON o.id = oi.bill_id
                    WHERE o.user_id = :user_id AND p.category LIKE :category
                    GROUP BY p.category
                """
                params = {"user_id": user_id, "category": f"%{category}%"}
            elif month:
                stmt = """
                    SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS order_count
                    FROM bills
                    WHERE user_id = :user_id AND date LIKE :month
                """
                params = {"user_id": user_id, "month": f"{month}%"}
            else:
                today_str = date.today().isoformat()
                stmt = """
                    SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*) AS order_count
                    FROM bills
                    WHERE user_id = :user_id AND (date LIKE :today OR DATE(created_at) = CURDATE())
                """
                params = {"user_id": user_id, "today": f"{today_str}%"}

            rows = db.execute(text(stmt), params).fetchall()
            data_list = [dict(row._mapping) for row in rows]
            return {"status": "success", "report_data": data_list}

        elif tool_name == "get_inventory":
            low_stock_only = args.get("low_stock_only", False)
            if low_stock_only:
                stmt = """
                    SELECT name, category, stock_quantity, selling_price, sku
                    FROM products
                    WHERE user_id = :user_id AND stock_quantity <= 3
                    ORDER BY stock_quantity ASC
                    LIMIT 20
                """
            else:
                stmt = """
                    SELECT name, category, stock_quantity, selling_price, sku
                    FROM products
                    WHERE user_id = :user_id
                    ORDER BY stock_quantity ASC
                    LIMIT 30
                """
            rows = db.execute(text(stmt), {"user_id": user_id}).fetchall()
            return {"status": "success", "inventory": [dict(row._mapping) for row in rows]}

        elif tool_name == "get_pending_payments":
            stmt = """
                SELECT c.name AS customer_name, c.phone, COALESCE(SUM(b.balance_amount), 0) AS balance_due, COUNT(b.id) AS unpaid_invoices
                FROM customers c
                JOIN bills b ON b.customer_id = c.id
                WHERE b.user_id = :user_id AND b.balance_amount > 0
                GROUP BY c.id, c.name, c.phone
                ORDER BY balance_due DESC
                LIMIT 15
            """
            rows = db.execute(text(stmt), {"user_id": user_id}).fetchall()
            return {"status": "success", "pending_payments": [dict(row._mapping) for row in rows]}

        elif tool_name == "get_customer_details":
            name = args.get("name", "")
            stmt = """
                SELECT id, name, phone, email, city, total_purchase_amount, paid_amount, balance_amount, payment_status
                FROM customers
                WHERE user_id = :user_id AND name LIKE :name
                LIMIT 5
            """
            rows = db.execute(text(stmt), {"user_id": user_id, "name": f"%{name}%"}).fetchall()
            return {"status": "success", "customers": [dict(row._mapping) for row in rows]}

        elif tool_name in ("predict_sales", "predict_demand"):
            cat = args.get("category", "")
            rate_val = args.get("gold_rate", 7000.0)
            fest = args.get("festival", "No")

            today_dt = date.today()
            inp = schemas.PredictionInput(
                category=cat,
                gold_rate=float(rate_val),
                festival=fest,
                date=today_dt.isoformat(),
                month=today_dt.month,
                week=today_dt.isocalendar()[1]
            )

            res = prediction_service.run_prediction(db, user_id, inp)
            return {
                "status": "success",
                "predicted_sales": res.get("predicted_sales", 0),
                "predicted_demand": res.get("predicted_demand", 0),
                "category": res.get("category"),
                "festival": res.get("festival")
            }

        elif tool_name == "analyze_profit":
            context = build_business_context(db, user_id, "")
            return {
                "status": "success",
                "total_revenue": context.get("total_revenue", 0),
                "total_expenses": context.get("total_expenses", 0),
                "net_profit": context.get("profit", 0)
            }

        elif tool_name == "gold_rate":
            latest_rate = serialize_rate(db, get_latest_rate(db, user_id), user_id)
            return {"status": "success", "gold_rate": latest_rate}

        elif tool_name == "send_whatsapp":
            customer_id = args.get("customer_id")
            message = args.get("message")
            if not customer_id or not message:
                return {"status": "error", "message": "Missing customer_id or message."}

            customer = db.query(models.Customer).filter(
                models.Customer.id == customer_id, models.Customer.user_id == user_id
            ).first()
            if not customer:
                return {"status": "error", "message": "Customer not found."}

            raw_phone = customer.phone_number or customer.phone or ""
            normalized_phone = whatsapp_service.normalize_phone_number(raw_phone)
            if not normalized_phone:
                return {"status": "error", "message": "Customer does not have a valid phone number."}

            result = whatsapp_service.send_text_message(normalized_phone, message, db=db, user_id=user_id)
            return {"status": "success", "whatsapp_api_result": result}

        else:
            return {"status": "error", "message": f"Unknown tool: {tool_name}"}

    except Exception as exc:
        logger.exception(f"Error executing agent tool {tool_name}")
        return {"status": "error", "message": str(exc)}


# ─── REST Chat Endpoint ───────────────────────────────────────────────────────

@router.post("/chat")
async def realtime_chat(
    req: AgentChatRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Standard REST endpoint for text chat using OpenAI.
    Supports function calling and keeps conversation history in the database.
    """
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key is missing on the server."
        )

    # Build a safe display name — NEVER access user.name (no such attribute)
    display_name = get_display_name(current_user)
    shop_name = (current_user.shop_name or "").strip() or "the jewelry shop"

    try:
        from openai import OpenAI
        client = OpenAI(api_key=openai_key)

        # Retrieve user history (chronologically ascending)
        history_rows = (
            db.query(models.AgentConversation)
            .filter(models.AgentConversation.user_id == current_user.id)
            .order_by(models.AgentConversation.timestamp.desc())
            .limit(10)
            .all()
        )

        messages = [
            {"role": "system", "content": get_realtime_system_instructions(display_name, shop_name)}
        ]

        # Add history in chronological order (oldest first)
        for r in reversed(history_rows):
            if r.user_message and not r.user_message.startswith("[Voice Tool:"):
                messages.append({"role": "user", "content": r.user_message})
                messages.append({"role": "assistant", "content": r.agent_response})

        messages.append({"role": "user", "content": req.message})

        executed_tool = None
        tool_result_str = None

        # Convert Realtime TOOLS schema to chat completions tools schema
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

        # Run chat completion loop (handles function calls)
        for attempt in range(5):
            response = client.chat.completions.create(
                model=OPENAI_TEXT_MODEL,
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

        # Save conversation history to Database
        from ..services.conversation_service import save_conversation
        save_conversation(
            db=db,
            user_id=current_user.id,
            user_message=req.message,
            agent_response=agent_response,
            executed_tool=executed_tool,
            tool_result=tool_result_str
        )

        return {
            "user_message": req.message,
            "agent_response": agent_response,
            "executed_tool": executed_tool,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as exc:
        logger.exception("Error in realtime_chat REST endpoint")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OpenAI chat completion failed: {exc}"
        )


# ─── Conversation History Endpoint ────────────────────────────────────────────

@router.get("/conversations")
def get_realtime_conversations(
    limit: int = 30,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Get conversation history for the current user (text + voice turns)."""
    from ..services.conversation_service import get_conversations
    return get_conversations(db=db, user_id=current_user.id, limit=limit)


# ─── WebSocket Secure Proxy Endpoint ──────────────────────────────────────────

@router.websocket("/voice")
async def websocket_realtime_voice(websocket: WebSocket):
    """
    WebSocket endpoint for two-way voice streaming.
    Proxies browser connection to OpenAI Realtime API securely.
    """
    # 1. Retrieve query token for authentication
    token = websocket.query_params.get("token")
    if not token:
        logger.warning("[WS] Connection rejected: token query param missing.")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # 2. Authenticate token and load current user
    db = database.SessionLocal()
    user = None
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            logger.warning("[WS] Connection rejected: invalid sub in token.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            logger.warning("[WS] Connection rejected: user not found.")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception as e:
        logger.warning(f"[WS] Connection rejected: JWT decode error: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    finally:
        db.close()

    # 3. Check for OpenAI key
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not openai_key:
        logger.critical("[WS] OPENAI_API_KEY is not set.")
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "message": "OpenAI API key is missing on the server. Please configure it in Settings."
        })
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    # 4. Accept browser websocket connection
    await websocket.accept()

    # Build safe display name — NEVER access user.name (no such attribute)
    display_name = get_display_name(user)
    shop_name = (user.shop_name or "").strip() or "the jewelry shop"
    logger.info(f"[WS] Accepted real-time voice connection for user {user.id} ({display_name})")

    # 5. Connect to OpenAI Realtime API
    openai_url = f"wss://api.openai.com/v1/realtime?model={OPENAI_REALTIME_MODEL}"
    ws_headers = {
        "Authorization": f"Bearer {openai_key}",
    }

    logger.info(f"[WS] Connecting to OpenAI Realtime: {openai_url}")

    try:
        async with websockets.connect(
            openai_url,
            additional_headers=ws_headers,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=10,
        ) as openai_ws:
            logger.info("[WS] Connected to OpenAI Realtime websocket.")

            # Send initial session configuration
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": get_realtime_system_instructions(display_name, shop_name),
                    "voice": "shimmer",          # warm, natural female voice
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "whisper-1"     # enables user speech → text transcription
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
                    },
                    "tools": TOOLS,
                    "tool_choice": "auto"
                }
            }
            await openai_ws.send(json.dumps(session_config))

            # Use an asyncio Event to signal both tasks to stop
            stop_event = asyncio.Event()

            # Task: forward events from Browser to OpenAI
            async def browser_to_openai():
                try:
                    while not stop_event.is_set():
                        try:
                            msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                            await openai_ws.send(msg)
                        except asyncio.TimeoutError:
                            # No message received — send keepalive or just continue
                            continue
                except WebSocketDisconnect:
                    logger.info("[WS] Browser disconnected.")
                except asyncio.CancelledError:
                    pass
                except Exception as ex:
                    logger.warning(f"[WS] Exception in browser-to-openai forwarder: {ex}")
                finally:
                    stop_event.set()

            # Task: forward events from OpenAI to Browser
            async def openai_to_browser():
                db_session = database.SessionLocal()
                voice_turn = {
                    "user_message": "",
                    "agent_response": "",
                    "executed_tool": None,
                    "tool_result": None,
                }

                def save_voice_turn():
                    if not any(voice_turn.values()):
                        return
                    from ..services.conversation_service import save_conversation
                    try:
                        save_conversation(
                            db=db_session,
                            user_id=user.id,
                            user_message=voice_turn["user_message"],
                            agent_response=voice_turn["agent_response"],
                            executed_tool=voice_turn["executed_tool"],
                            tool_result=voice_turn["tool_result"],
                        )
                    except Exception:
                        logger.error("[WS] Could not save voice conversation for user %s", user.id)
                    finally:
                        voice_turn.update({
                            "user_message": "",
                            "agent_response": "",
                            "executed_tool": None,
                            "tool_result": None,
                        })

                try:
                    async for raw_msg in openai_ws:
                        if stop_event.is_set():
                            break

                        try:
                            event = json.loads(raw_msg)
                        except Exception:
                            continue

                        event_type = event.get("type")

                        if event_type == "conversation.item.input_audio_transcription.completed":
                            transcript = (event.get("transcript") or "").strip()
                            if transcript:
                                voice_turn["user_message"] = transcript
                        elif event_type == "response.audio_transcript.done":
                            transcript = (event.get("transcript") or "").strip()
                            if transcript:
                                voice_turn["agent_response"] = transcript

                        if event_type == "response.done" and voice_turn["agent_response"]:
                            save_voice_turn()

                        # Intercept OpenAI function calls
                        if event_type == "response.function_call_arguments.done":
                            call_id = event.get("call_id")
                            tool_name = event.get("name")
                            args_str = event.get("arguments", "{}")
                            try:
                                args = json.loads(args_str)
                            except Exception:
                                args = {}

                            # Run database/business service query
                            tool_res = execute_agent_tool(tool_name, args, db_session, user.id)
                            tool_res_str = json.dumps(tool_res)
                            voice_turn["executed_tool"] = tool_name
                            voice_turn["tool_result"] = tool_res_str

                            # Send function output back to OpenAI
                            output_event = {
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": tool_res_str
                                }
                            }
                            await openai_ws.send(json.dumps(output_event))

                            # Trigger response generation
                            trigger_event = {"type": "response.create"}
                            await openai_ws.send(json.dumps(trigger_event))

                            continue

                        # Forward other events directly to browser (audio deltas, transcripts, etc.)
                        try:
                            await websocket.send_text(raw_msg)
                        except Exception:
                            break

                except asyncio.CancelledError:
                    pass
                except Exception as ex:
                    logger.warning(f"[WS] Exception in openai-to-browser forwarder: {ex}")
                finally:
                    save_voice_turn()
                    stop_event.set()
                    db_session.close()

            # Run both loops concurrently; stop both when either exits
            browser_task = asyncio.create_task(browser_to_openai())
            openai_task = asyncio.create_task(openai_to_browser())

            # Wait for stop_event — whichever side closes first triggers it
            await stop_event.wait()

            # Cancel the other task gracefully
            browser_task.cancel()
            openai_task.cancel()
            await asyncio.gather(browser_task, openai_task, return_exceptions=True)

            logger.info(f"[WS] Voice session ended for user {user.id}")

    except Exception as exc:
        logger.error(f"[WS] OpenAI websocket proxy connection failed: {exc}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Could not connect to voice assistant server. {exc}"
            })
            await websocket.close()
        except Exception:
            pass
