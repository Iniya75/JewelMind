"""
model_service.py
================
Singleton model loader — loads .pkl files from disk once and caches in memory.
Handles missing model files gracefully with actionable error messages.
"""

import joblib
from pathlib import Path
from typing import Any
from sklearn.pipeline import Pipeline

MODELS_DIR = Path(__file__).parent / "models"

_MODEL_CACHE: dict[str, Pipeline] = {}

MODEL_FILES = {
    "sales": ["sales_model.pkl"],
    "churn": ["category_encoder.pkl"],
    "demand": ["demand_model.pkl"],
}


class ModelNotTrainedError(Exception):
    """Raised when a model file has not been loaded/trained yet."""
    pass


def get_model(name: str) -> Any:
    """
    Load and cache a trained model by name ('sales', 'churn', 'demand').
    Raises ModelNotTrainedError if none of the candidate files exist.
    """
    if name in _MODEL_CACHE:
        return _MODEL_CACHE[name]

    candidates = MODEL_FILES.get(name)
    if not candidates:
        raise ValueError(f"Unknown model name '{name}'. Must be one of: {list(MODEL_FILES.keys())}")

    path = None
    for c in candidates:
        p = MODELS_DIR / c
        if p.exists():
            path = p
            break

    if not path:
        if name == "sales":
            raise ModelNotTrainedError("Sales model file not found. Please train or upload the model.")
        raise ModelNotTrainedError(f"{name.capitalize()} model file not found. Please train or upload the model.")

    pipeline = joblib.load(path)
    _MODEL_CACHE[name] = pipeline
    return pipeline


def get_demand_meta() -> dict:
    """Load demand model feature metadata."""
    path = MODELS_DIR / "demand_model_meta.pkl"
    if not path.exists():
        raise ModelNotTrainedError(
            "Demand model metadata not found. Please train the demand model first."
        )
    return joblib.load(path)


def invalidate_cache(name: str | None = None) -> None:
    """
    Invalidate the in-memory cache so the next call reloads from disk.
    Pass None to invalidate all models.
    """
    global _MODEL_CACHE
    if name is None:
        _MODEL_CACHE = {}
    else:
        _MODEL_CACHE.pop(name, None)


def model_exists(name: str) -> bool:
    filename = MODEL_FILES.get(name)
    if not filename:
        return False
    return (MODELS_DIR / filename).exists()


def list_model_status() -> dict:
    """Return a dict of model names → training status."""
    return {
        name: {
            "trained": model_exists(name),
            "path": str(MODELS_DIR / filename)
        }
        for name, filename in MODEL_FILES.items()
    }
