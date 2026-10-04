import pandas as pd
import numpy as np
import xgboost as xgb
from sqlalchemy.orm import Session
from datetime import datetime
from .model_loader import save_demand_model
from ..models import Bill, BillItem, Product

def train_demand_model(db: Session, user_id: str):
    """
    Trains an XGBoost model on historical bill data to predict next month's product demand.
    """
    bills = db.query(Bill).filter(Bill.user_id == user_id).all()
    if not bills:
        return {"status": "error", "message": "No billing data available"}
    
    bill_ids = [b.id for b in bills]
    bill_items = db.query(BillItem).filter(BillItem.bill_id.in_(bill_ids)).all()
    
    if not bill_items:
        return {"status": "error", "message": "No bill items available"}
        
    data = []
    # Create a lookup for bill date
    bill_dates = {}
    for b in bills:
        try:
            if "T" in b.date:
                dt = datetime.fromisoformat(b.date.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(b.date.split(" ")[0], "%Y-%m-%d")
            bill_dates[b.id] = dt.date()
        except Exception:
            continue
    
    for item in bill_items:
        if not item.product_id:
            continue
            
        b_date = bill_dates.get(item.bill_id)
        if not b_date:
            continue
            
        data.append({
            "product_id": item.product_id,
            "quantity": item.quantity,
            "month": b_date.month,
            "year": b_date.year,
        })
        
    df = pd.DataFrame(data)
    if df.empty:
        return {"status": "error", "message": "Insufficient valid data for training"}
        
    # Group by product, year, month
    monthly_sales = df.groupby(['product_id', 'year', 'month'])['quantity'].sum().reset_index()
    monthly_sales = monthly_sales.sort_values(by=['product_id', 'year', 'month'])
    
    # Feature engineering: lagged sales
    monthly_sales['lag_1'] = monthly_sales.groupby('product_id')['quantity'].shift(1)
    monthly_sales['lag_2'] = monthly_sales.groupby('product_id')['quantity'].shift(2)
    
    # Fill NAs
    monthly_sales.fillna(0, inplace=True)
    
    X = monthly_sales[['month', 'lag_1', 'lag_2']]
    y = monthly_sales['quantity']
    
    if len(X) < 5:
        # Not enough data for a robust split/train, fallback to naive or just train on what we have
        model = xgb.XGBRegressor(n_estimators=10, max_depth=3, learning_rate=0.1, random_state=42)
        model.fit(X, y)
        save_demand_model(model, user_id)
        return {
            "status": "success",
            "message": "Model trained with limited data",
            "rows_trained": len(X),
        }
        
    model = xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42)
    model.fit(X, y)
    
    save_demand_model(model, user_id)
    
    return {
        "status": "success",
        "message": "Model trained successfully",
        "rows_trained": len(X),
    }
