"""
voice_service.py
================
Voice processing service using OpenAI Whisper API.
- Accepts raw audio bytes from the frontend (WebM/OGG from MediaRecorder).
- Uses OpenAI Whisper ("whisper-1") to transcribe speech to text.
- Returns transcribed text.
"""

import os
import io
import logging
import time
from typing import Optional, Tuple
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logger = logging.getLogger(__name__)

def get_openai_client() -> Optional[OpenAI]:
    """Get the OpenAI client using the configured API key."""
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        logger.error("OPENAI_API_KEY is not set.")
        return None
    try:
        return OpenAI(api_key=api_key)
    except Exception as exc:
        logger.error(f"Error creating OpenAI client: {exc}")
        return None

def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> Tuple[Optional[str], Optional[str]]:
    """
    Transcribe audio bytes to text using OpenAI Whisper API.

    Args:
        audio_bytes: Raw audio bytes (WebM/OGG from browser MediaRecorder).
        mime_type: MIME type of the audio.

    Returns:
        A tuple of (transcribed_text, error_message).
    """
    client = get_openai_client()
    if not client:
        return None, "OpenAI API client could not be initialized. Please check OPENAI_API_KEY."

    # Determine file extension based on mime type
    extension = "webm"
    if "ogg" in mime_type:
        extension = "ogg"
    elif "mp3" in mime_type:
        extension = "mp3"
    elif "wav" in mime_type:
        extension = "wav"
    elif "mpeg" in mime_type:
        extension = "mpeg"
    elif "m4a" in mime_type:
        extension = "m4a"

    try:
        # Wrap bytes in BytesIO and name it so OpenAI SDK can detect the format
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"recording.{extension}"

        # Implement simple retry mechanism for rate limits / service issues
        delays = [2, 4, 8]
        for attempt in range(4):
            try:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
                transcribed = response.text.strip() if response.text else ""
                logger.info(f"Whisper Transcription (attempt {attempt + 1}): {transcribed[:100]}")
                return transcribed, None
            except Exception as exc:
                exc_str = str(exc)
                logger.warning(f"Whisper transcription attempt {attempt + 1} failed: {exc_str}")
                
                # Check for rate limit or server errors
                is_retryable = "429" in exc_str or "rate limit" in exc_str.lower() or "500" in exc_str or "503" in exc_str
                if is_retryable and attempt < len(delays):
                    time.sleep(delays[attempt])
                    audio_file.seek(0)  # Reset buffer pointer for retry
                    continue
                else:
                    logger.error(f"Whisper transcription error: {exc_str}")
                    return None, f"OpenAI transcription failed: {exc_str}"

    except Exception as exc:
        exc_str = str(exc)
        logger.error(f"Whisper transcription initialization error: {exc_str}")
        return None, "I couldn't process the audio right now. Please try again."
