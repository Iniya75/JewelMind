import pandas as pd
from sqlalchemy.orm import Session
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from .model_loader import load_demand_model
from ..models import Bill, BillItem, Product

def predict_demand(db: Session, user_id: str):
    """
    Predicts next month's demand for each product.
    """
    model = load_demand_model(user_id)
    if not model:
        return {"status": "error", "message": "Demand model not trained. Please train the model first."}
        
    bills = db.query(Bill).filter(Bill.user_id == user_id).all()
    if not bills:
        return {"status": "error", "message": "No billing data available"}
        
    products = db.query(Product).filter(Product.user_id == user_id).all()
    if not products:
        return {"status": "error", "message": "No products available"}
        
    bill_ids = [b.id for b in bills]
    bill_items = db.query(BillItem).filter(BillItem.bill_id.in_(bill_ids)).all()
    
    # Process history
    data = []
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
    
    # Calculate current lag_1 and lag_2 for each product
    product_features = []
    current_date = date.today()
    next_month_date = current_date + relativedelta(months=1)
    next_month = next_month_date.month
    
    for prod in products:
        pid = prod.id
        if df.empty:
            lag_1 = 0
            lag_2 = 0
        else:
            prod_df = df[df['product_id'] == pid]
            if prod_df.empty:
                lag_1 = 0
                lag_2 = 0
            else:
                # Group by year, month to get monthly totals
                monthly = prod_df.groupby(['year', 'month'])['quantity'].sum().reset_index()
                monthly = monthly.sort_values(by=['year', 'month'])
                
                # The last two months are lag_1 and lag_2
                quantities = monthly['quantity'].values
                lag_1 = quantities[-1] if len(quantities) >= 1 else 0
                lag_2 = quantities[-2] if len(quantities) >= 2 else 0
                
        product_features.append({
            "product_id": pid,
            "product_name": prod.name,
            "current_stock": prod.stock_quantity,
            "month": next_month,
            "lag_1": lag_1,
            "lag_2": lag_2
        })
        
    features_df = pd.DataFrame(product_features)
    
    # Predict
    X_pred = features_df[['month', 'lag_1', 'lag_2']]
    predictions = model.predict(X_pred)
    
    results = []
    for i, prod_feat in enumerate(product_features):
        pred_qty = max(0, float(predictions[i]))
        current_stock = prod_feat['current_stock']
        
        # Confidence score based on lag_1 (more history = higher confidence roughly)
        # We can simulate confidence
        confidence = min(95.0, 50.0 + (prod_feat['lag_1'] * 2))
        
        if pred_qty > current_stock * 1.5:
            action = "Restock Immediately"
        elif pred_qty > current_stock:
            action = "Consider Restocking"
        else:
            action = "Stock Sufficient"
            
        if pred_qty == 0 and current_stock > 0:
            action = "Avoid New Purchase"
            
        results.append({
            "product_id": prod_feat["product_id"],
            "product_name": prod_feat["product_name"],
            "predicted_quantity": round(pred_qty, 1),
            "confidence_score": round(confidence, 1),
            "recommended_action": action
        })
        
    return {
        "status": "success",
        "predictions": results
    }
