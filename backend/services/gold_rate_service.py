import asyncio
import logging
import os
import time
import uuid
from datetime import datetime
from typing import Optional

import requests
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal

logger = logging.getLogger(__name__)

TROY_OUNCE_GRAMS = 31.1034768
DEFAULT_GOLD_API_URL = "https://api.metalpriceapi.com/v1/latest"


class GoldRateFetchError(RuntimeError):
    pass


def _api_key() -> str:
    return (
        os.getenv("GOLD_RATE_API_KEY")
        or os.getenv("GOLD_API_KEY")
        or os.getenv("METALS_API_KEY")
        or ""
    ).strip()


def _parse_rate_payload(payload: dict) -> tuple[float, float, float]:
    """Parse GoldAPI.io or MetalpriceAPI payload into (rate22k, rate24k, silver)."""
    if isinstance(payload, dict) and (payload.get("success") is False or "error" in payload):
        err_msg = payload.get("error")
        if isinstance(err_msg, dict):
            err_msg = err_msg.get("message") or err_msg.get("info") or str(err_msg)
        raise GoldRateFetchError(f"API provider error: {err_msg}")

    # 1. Check MetalpriceAPI format (rates.INRXAU, rates.INRXAG)
    rates = payload.get("rates", {})
    if "INRXAU" in rates:
        ounce_gold = float(rates["INRXAU"])
        rate24 = round(ounce_gold / TROY_OUNCE_GRAMS, 2)
        rate22 = round(rate24 * 22 / 24, 2)
        silver = 0.0
        if "INRXAG" in rates:
            silver = round(float(rates["INRXAG"]) / TROY_OUNCE_GRAMS, 2)
        return rate22, rate24, silver

    # 2. Check legacy GoldAPI.io format
    rate24 = payload.get("price_gram_24k") or payload.get("priceGram24k") or payload.get("price_gram_24K")
    rate22 = payload.get("price_gram_22k") or payload.get("priceGram22k") or payload.get("price_gram_22K")
    if rate24 is None:
        ounce_price = payload.get("price") or payload.get("ask") or payload.get("bid")
        if ounce_price is not None:
            rate24 = float(ounce_price) / TROY_OUNCE_GRAMS

    if rate24 is None:
        raise GoldRateFetchError("API response did not include a usable 24K rate.")

    rate24 = round(float(rate24), 2)
    rate22 = round(float(rate22), 2) if rate22 is not None else round(rate24 * 22 / 24, 2)
    return rate22, rate24, 0.0


def fetch_gold_rates_from_api() -> tuple[float, float, float]:
    key = _api_key()
    if not key:
        raise GoldRateFetchError("Gold Rate API key is not configured.")

    url = os.getenv("GOLD_RATE_API_URL", DEFAULT_GOLD_API_URL)
    
    # Auto-detect if key is goldapi.io format but URL is still pointing to metalpriceapi
    if "goldapi-" in key and "metalpriceapi" in url:
        url = "https://www.goldapi.io/api/XAU/INR"

    # If URL is metalpriceapi, format params appropriately
    if "metalpriceapi" in url:
        params = {"api_key": key, "base": "INR", "currencies": "XAU,XAG"}
        response = requests.get(url, params=params, timeout=20)
        if response.status_code >= 400:
            raise GoldRateFetchError(f"Gold API returned HTTP {response.status_code}: {response.text[:100]}")
        payload = response.json()
        return _parse_rate_payload(payload)
    else:
        headers = {
            "x-access-token": key,
            "Content-Type": "application/json",
            "User-Agent": "JewelMindAI/2.0",
        }
        # Fetch gold rate
        response = requests.get(url, headers=headers, timeout=20)
        if response.status_code >= 400:
            raise GoldRateFetchError(f"Gold API returned HTTP {response.status_code}: {response.text[:100]}")
        payload = response.json()
        rate22, rate24, _ = _parse_rate_payload(payload)

        # Fetch silver rate if URL is goldapi.io format (XAU in url)
        silver = 0.0
        if "XAU" in url:
            try:
                silver_url = url.replace("XAU", "XAG")
                silver_response = requests.get(silver_url, headers=headers, timeout=20)
                if silver_response.status_code < 400:
                    silver_payload = silver_response.json()
                    silver_price = silver_payload.get("price_gram_24k") or silver_payload.get("price") or silver_payload.get("priceGram24k")
                    if silver_price is None:
                        ounce_price = silver_payload.get("price") or silver_payload.get("ask") or silver_payload.get("bid")
                        if ounce_price is not None:
                            silver_price = float(ounce_price) / TROY_OUNCE_GRAMS
                    if silver_price is not None:
                        silver = round(float(silver_price), 2)
            except Exception as exc:
                logger.warning("Failed to fetch silver rate from GoldAPI: %s", exc)

        return rate22, rate24, silver


def get_latest_rate(db: Session, user_id: str) -> Optional[models.GoldRate]:
    return (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == user_id)
        .order_by(models.GoldRate.date.desc(), models.GoldRate.last_updated.desc())
        .first()
    )


def get_previous_rate(db: Session, user_id: str, latest_date: str) -> Optional[models.GoldRate]:
    return (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == user_id, models.GoldRate.date < latest_date)
        .order_by(models.GoldRate.date.desc(), models.GoldRate.last_updated.desc())
        .first()
    )


def upsert_today_rate(
    db: Session,
    user_id: str,
    rate22k: float,
    rate24k: float,
    rate_silver: Optional[float] = None,
    source: str = "metalpriceapi.com",
    status: str = "fresh",
    warning: Optional[str] = None,
) -> models.GoldRate:
    today = datetime.now().strftime("%Y-%m-%d")
    existing = (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == user_id, models.GoldRate.date == today)
        .first()
    )
    latest = get_latest_rate(db, user_id)
    silver = rate_silver if rate_silver is not None and rate_silver > 0 else (latest.rate_silver if latest else 0.0)

    if existing:
        existing.rate22k = rate22k
        existing.rate24k = rate24k
        existing.rate_silver = silver
        existing.last_updated = datetime.utcnow()
        existing.source = source
        existing.status = status
        existing.warning = warning
        rate = existing
    else:
        rate = models.GoldRate(
            id=str(uuid.uuid4()),
            user_id=user_id,
            rate22k=rate22k,
            rate24k=rate24k,
            rate_silver=silver,
            date=today,
            last_updated=datetime.utcnow(),
            source=source,
            status=status,
            warning=warning,
        )
        db.add(rate)

    db.commit()
    db.refresh(rate)
    return rate


def mark_latest_warning(db: Session, user_id: str, warning: str) -> Optional[models.GoldRate]:
    latest = get_latest_rate(db, user_id)
    if latest:
        latest.status = "stale"
        latest.warning = warning
        db.commit()
        db.refresh(latest)
    return latest


def update_gold_rates_for_user(db: Session, user_id: str, retries: int = 3) -> models.GoldRate:
    # If no API key configured, try to create today's entry from latest available rate
    if not _api_key():
        today = datetime.now().strftime("%Y-%m-%d")
        existing_today = (
            db.query(models.GoldRate)
            .filter(models.GoldRate.user_id == user_id, models.GoldRate.date == today)
            .first()
        )
        if existing_today:
            return existing_today
        latest = get_latest_rate(db, user_id)
        if latest:
            warning_msg = "Gold Rate API key not configured. Using last available rate as reference."
            return upsert_today_rate(
                db, user_id,
                latest.rate22k, latest.rate24k,
                rate_silver=latest.rate_silver,
                source="fallback", status="stale", warning=warning_msg,
            )
        raise GoldRateFetchError(
            "No gold rate available. Please enter a gold rate manually in the Gold Rates page."
        )

    last_error = ""
    for attempt in range(retries):
        try:
            rate22k, rate24k, silver = fetch_gold_rates_from_api()
            source_name = "goldapi.io" if "goldapi-" in _api_key() else "metalpriceapi.com"
            return upsert_today_rate(db, user_id, rate22k, rate24k, rate_silver=silver, source=source_name)
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Gold rate fetch failed on attempt %s: %s", attempt + 1, last_error)
            time.sleep(min(2 ** attempt, 8))

    warning = "Using last available gold rate (live fetch failed)."
    latest = mark_latest_warning(db, user_id, warning)
    if not latest:
        raise GoldRateFetchError(f"{warning} API error: {last_error}")
    return latest


def update_gold_rates_for_all_users(db: Session, retries: int = 3) -> dict:
    users = db.query(models.User).all()
    updated = 0
    errors = []

    for user in users:
        try:
            update_gold_rates_for_user(db, user.id, retries=retries)
            updated += 1
        except Exception as exc:
            errors.append({"user_id": user.id, "error": str(exc)})

    return {"updated": updated, "errors": errors}


def serialize_rate(db: Session, rate: Optional[models.GoldRate], user_id: str) -> Optional[dict]:
    if not rate:
        return None

    previous = get_previous_rate(db, user_id, rate.date)
    today = datetime.now().strftime("%Y-%m-%d")
    warning = rate.warning
    if rate.date != today:
        warning = warning or "Using last available gold rate."

    return {
        "id": rate.id,
        "rate22k": rate.rate22k,
        "rate24k": rate.rate24k,
        "rateSilver": rate.rate_silver,
        "date": rate.date,
        "lastUpdated": rate.last_updated.isoformat() if rate.last_updated else None,
        "source": rate.source,
        "status": rate.status,
        "warning": warning,
        "priceDifference22k": round(rate.rate22k - previous.rate22k, 2) if previous else None,
        "priceDifference24k": round(rate.rate24k - previous.rate24k, 2) if previous else None,
    }


async def run_daily_gold_rate_scheduler() -> None:
    last_run_date: Optional[str] = None
    while True:
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        if now.hour == 6 and last_run_date != today:
            db = SessionLocal()
            try:
                update_gold_rates_for_all_users(db)
                last_run_date = today
            except Exception as exc:
                logger.warning("Daily gold rate update failed: %s", exc)
            finally:
                db.close()

        await asyncio.sleep(60 * 15)
