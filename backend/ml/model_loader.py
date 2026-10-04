import os
import joblib

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODEL_DIR, exist_ok=True)

def get_demand_model_path(user_id: str) -> str:
    return os.path.join(MODEL_DIR, f"demand_model_{user_id}.joblib")

def save_demand_model(model, user_id: str):
    path = get_demand_model_path(user_id)
    joblib.dump(model, path)

def load_demand_model(user_id: str):
    path = get_demand_model_path(user_id)
    if os.path.exists(path):
        return joblib.load(path)
    return None
