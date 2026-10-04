"""
predictor.py
============
Singleton model loader for pre-trained .joblib models from Google Colab.
All 4 models are loaded ONCE at FastAPI startup and cached in memory.
No training code exists here — models are pre-trained externally.
"""

import logging
import numpy as np
from pathlib import Path
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

# predictor.py lives at  backend/ml/predictor.py
# .parent        → backend/ml/
# / "models"     → backend/ml/models/   ← where the .joblib files actually live
_MODEL_DIR = Path(__file__).resolve().parent / "models"

# ─── Singleton references ─────────────────────────────────────────────────────
_DEMAND_MODEL = None
_SALES_MODEL = None
_CATEGORY_ENCODER = None
_MODELS_LOADED = False


def load_models() -> dict:
    """
    Load all 4 .joblib files from backend/models/.
    Called from FastAPI startup_tasks() in main.py.
    Returns a status dict for each model file.
    """
    global _DEMAND_MODEL, _SALES_MODEL, _CATEGORY_ENCODER, _MODELS_LOADED

    try:
        import joblib
    except ImportError:
        logger.error("[ML] joblib not installed. Run: pip install joblib")
        return {"error": "joblib not installed"}

    # ── Debug info printed to stdout so it's always visible in startup logs ──
    import sys
    print(f"[ML] Current working directory : {Path.cwd()}", file=sys.stderr)
    print(f"[ML] Model directory           : {_MODEL_DIR}", file=sys.stderr)
    print(f"[ML] Model directory exists    : {_MODEL_DIR.exists()}", file=sys.stderr)
    if _MODEL_DIR.exists():
        files = [f.name for f in _MODEL_DIR.glob("*")]
        print(f"[ML] Files in model directory  : {files}", file=sys.stderr)
    else:
        print(f"[ML] ⚠️  Model directory does not exist — create it and place .joblib files inside.", file=sys.stderr)

    status = {}

    def _load(filename: str) -> object:
        path = _MODEL_DIR / filename
        if path.exists():
            try:
                obj = joblib.load(path)
                size_kb = path.stat().st_size // 1024
                status[filename] = "loaded"
                logger.info("[ML] ✅ Loaded %s (%d KB)", filename, size_kb)
                print(f"[ML] ✅ {filename} loaded ({size_kb} KB)", file=sys.stderr)
                return obj
            except Exception as e:
                status[filename] = f"error: {e}"
                logger.error("[ML] ❌ Failed to load %s: %s", filename, e)
                print(f"[ML] ❌ {filename} failed: {e}", file=sys.stderr)
                return None
        else:
            status[filename] = "not_found"
            logger.warning("[ML] ⚠️  %s not found at %s", filename, path)
            print(f"[ML] ⚠️  {filename} not found at {path}", file=sys.stderr)
            return None

    _DEMAND_MODEL = _load("demand_model.pkl")
    _SALES_MODEL = _load("sales_model.pkl")
    _CATEGORY_ENCODER = _load("category_encoder.pkl")
    _MODELS_LOADED = True

    return status


def get_model_status() -> dict:
    """Return status of each model (loaded / not_found)."""
    return {
        "demand_model": "ready" if _DEMAND_MODEL is not None else "not_found",
        "sales_model": "ready" if _SALES_MODEL is not None else "not_found",
        "category_encoder": "ready" if _CATEGORY_ENCODER is not None else "not_found",
        # festival encoder is not required by current models
    }


def get_known_categories() -> list:
    """Return category labels from the encoder (for frontend dropdowns)."""
    if _CATEGORY_ENCODER is None:
        return ["Gold Ring", "Gold Necklace", "Gold Bangle", "Gold Earring", "Silver", "Diamond"]
    return list(_CATEGORY_ENCODER.classes_)


def get_known_festivals():
    return [
        "No",
        "Yes"
    ]


def _encode_label(encoder, value: str) -> int:
    """
    Safely encode a label. Falls back to index 0 for unseen labels
    to avoid ValueError crashing the prediction.
    """
    try:
        return int(encoder.transform([value])[0])
    except (ValueError, AttributeError):
        logger.warning("[ML] Unknown label '%s' — falling back to '%s'", value, encoder.classes_[0])
        try:
            return int(encoder.transform([encoder.classes_[0]])[0])
        except Exception:
            return 0


def _date_features(pred_date: date) -> tuple:
    """
    Extract (month, day, day_of_week, week) from a date object.
    Matches Colab training:
        df["month"]       = df["date"].dt.month
        df["day"]         = df["date"].dt.day
        df["day_of_week"] = df["date"].dt.dayofweek   # Monday=0
        df["week"]        = df["date"].dt.isocalendar().week.astype(int)
    """
    iso_week = pred_date.isocalendar()[1]  # week number
    return (
        pred_date.month,
        pred_date.day,
        pred_date.weekday(),   # 0=Monday, 6=Sunday — matches dt.dayofweek
        int(iso_week),
    )


def _product_id_to_int(product_id: str) -> int:
    """Convert UUID/string product_id to a stable integer for the model."""
    try:
        return int(product_id)
    except (ValueError, TypeError):
        # stable hash mod 10^6 keeps it within feature range
        return abs(hash(str(product_id))) % (10 ** 6)


def predict_demand(
    pred_date: date,
    product_id: str,
    category: str,
    gold_rate: float,
    festival: str,
    wedding_season: int,
    current_stock: int,
    previous_sales: float,
    month: Optional[int] = None,
    week: Optional[int] = None,
) -> float:
    """
    Run the demand prediction model.
    Feature order (exact Colab 8 features):
        month, week, category, gold_rate,
        festival, wedding_season, current_stock, previous_sales
    """
    if not _MODELS_LOADED:
        load_models()
    if _DEMAND_MODEL is None:
        raise RuntimeError("Demand model file not found. Please train or upload the model.")
    if _CATEGORY_ENCODER is None:
        raise RuntimeError("Category encoder file not found. Please train or upload the model.")

    m, d, dow, w = _date_features(pred_date if pred_date else date.today())
    month_val = int(month) if month is not None else m
    week_val = int(week) if week is not None else w

    cat_enc = _encode_label(_CATEGORY_ENCODER, category)

    festival_val = 1 if str(festival).lower() in [
        "yes",
        "true",
        "1"
    ] else 0

    features = np.array([
        [
            m,
            d,
            dow,
            w,
            cat_enc,
            float(gold_rate),
            festival_val,
            int(wedding_season),
            int(current_stock),
            float(previous_sales)
        ]], dtype=float)

    print("Features sent:", len(features[0]))
    print("Model expects:", getattr(_DEMAND_MODEL, "n_features_in_", len(features[0])))
    if hasattr(_DEMAND_MODEL, "n_features_in_") and len(features[0]) != _DEMAND_MODEL.n_features_in_:
        raise ValueError(
            f"Model expects {_DEMAND_MODEL.n_features_in_} features but received {len(features[0])}"
        )

    result = float(_DEMAND_MODEL.predict(features)[0])
    return max(0.0, round(result, 2))


def predict_sales(
    pred_date: date,
    product_id: str,
    category: str,
    gold_rate: float,
    festival: str,
    wedding_season: int,
    current_stock: int,
    previous_sales: float,
    month: Optional[int] = None,
    week: Optional[int] = None,
) -> float:
    """
    Run the sales prediction model.
    Uses year, month, quarter features from the prediction date.
    """
    if not _MODELS_LOADED:
        load_models()
    if _SALES_MODEL is None:
        raise RuntimeError("Sales model file not found.")

    pred_date = pred_date or date.today()
    year = pred_date.year
    month_number = pred_date.month
    quarter = (month_number - 1) // 3 + 1

    features = np.array([
        [
            year,
            month_number,
            quarter
        ]], dtype=float)

    result = float(_SALES_MODEL.predict(features)[0])
    return max(0.0, round(result, 2))

def predict_all(
    pred_date: date,
    product_id: str,
    category: str,
    gold_rate: float,
    festival: str,
    wedding_season: int,
    current_stock: int,
    previous_sales: float,
    month: Optional[int] = None,
    week: Optional[int] = None,
) -> dict:
    """
    Run both demand and sales models and return combined results.
    """
    predicted_demand = predict_demand(
        pred_date, product_id, category, gold_rate,
        festival, wedding_season, current_stock, previous_sales,
        month=month, week=week,
    )
    predicted_sales = predict_sales(
        pred_date, product_id, category, gold_rate,
        festival, wedding_season, current_stock, previous_sales,
        month=month, week=week,
    )

    return {
        "predicted_demand": predicted_demand,
        "predicted_sales": predicted_sales,
        "category": category,
        "festival": festival,
        "prediction_timestamp": datetime.utcnow().isoformat(),
    }
