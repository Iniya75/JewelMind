import os
import logging
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

logger = logging.getLogger(__name__)

# ── Model Configuration ─────────────────────────────────────────────────────
# Text chat model (REST /chat endpoint) — gpt-4o-mini is stable and cost-effective
OPENAI_TEXT_MODEL = os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini")

# Realtime WebSocket model — must be a model that supports the Realtime API
# Supported: gpt-realtime, gpt-realtime-mini (based on available models for this key)
OPENAI_REALTIME_MODEL = os.getenv(
    "OPENAI_REALTIME_MODEL",
    "gpt-realtime-mini"
)

# Legacy alias used by older code — points to realtime model
SELECTED_OPENAI_MODEL = OPENAI_REALTIME_MODEL


def validate_openai_config() -> str:
    """Validate that the OpenAI API key is present and log selected models."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        error_msg = (
            "CRITICAL: OPENAI_API_KEY is not set in the environment variables.\n"
            "Please add OPENAI_API_KEY to your .env file or environment configuration."
        )
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info("OpenAI configuration validated successfully.")
    logger.info("  [OpenAI] Text chat model    : %s", OPENAI_TEXT_MODEL)
    logger.info("  [OpenAI] Realtime WS model  : %s", OPENAI_REALTIME_MODEL)
    return OPENAI_REALTIME_MODEL


# Validate on import to ensure early failure if configuration is invalid
try:
    validate_openai_config()
except ValueError as e:
    # We raise it on startup in main.py, but log it here too
    logger.critical("OpenAI Initialization Error: %s", e)
