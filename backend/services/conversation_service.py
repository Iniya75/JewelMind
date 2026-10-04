"""
conversation_service.py
========================
Service to persist and retrieve AI agent conversation history.
"""

import uuid
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from .. import models

logger = logging.getLogger(__name__)


def save_conversation(
    db: Session,
    user_id: str,
    user_message: str,
    agent_response: str,
    executed_tool: str = None,
    tool_result: str = None,
) -> models.AgentConversation:
    """Persist a conversation turn to MySQL."""
    conv = models.AgentConversation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        user_message=user_message[:4096],
        agent_response=agent_response[:8192],
        executed_tool=executed_tool,
        tool_result=(tool_result[:4096] if tool_result else None),
        timestamp=datetime.utcnow(),
    )
    try:
        db.add(conv)
        db.commit()
        db.refresh(conv)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to persist conversation for user %s (%s)", user_id, type(exc).__name__)
        raise
    logger.info("Saved conversation %s for user %s", conv.id, user_id)
    return conv


def get_conversations(db: Session, user_id: str, limit: int = 30) -> list:
    """Retrieve recent conversation history for a user, newest first."""
    rows = (
        db.query(models.AgentConversation)
        .filter(models.AgentConversation.user_id == user_id)
        .order_by(models.AgentConversation.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "user_message": r.user_message,
            "agent_response": r.agent_response,
            "executed_tool": r.executed_tool,
            "tool_result": r.tool_result,
            "timestamp": r.timestamp.isoformat(),
        }
        for r in rows
    ]
