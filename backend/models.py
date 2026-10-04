from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(String(255), primary_key=True, index=True) # Will use UUID strings
    email = Column(String(255), unique=True, index=True)
    hashed_password = Column(String(255))
    reset_token = Column(String(255), nullable=True)
    
    # Profile details
    owner_name = Column(String(255), nullable=True)
    shop_name = Column(String(255), nullable=True)
    gstin = Column(String(50), nullable=True)
    city = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    customers = relationship("Customer", back_populates="user")
    bills = relationship("Bill", back_populates="user")
    expenses = relationship("Expense", back_populates="user")
    gold_rates = relationship("GoldRate", back_populates="user")
    products = relationship("Product", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    sales = relationship("Sale", back_populates="user")
    whatsapp_config = relationship("WhatsAppConfig", back_populates="user", uselist=False, cascade="all, delete-orphan")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String(255), primary_key=True, index=True)
    customer_id = Column(String(255), index=True, nullable=True)
    user_id = Column(String(255), ForeignKey("users.id"))
    name = Column(String(255), index=True)
    phone = Column(String(255), nullable=True)
    phone_number = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    dob = Column(String(255), nullable=True)
    address = Column(String(512), nullable=True)
    city = Column(String(255), nullable=True)
    customer_since = Column(String(255), nullable=True)
    visits = Column(Integer, default=0)
    total_purchase_amount = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    balance_amount = Column(Float, default=0.0)
    payment_status = Column(String(50), default="Pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="customers")


class Product(Base):
    __tablename__ = "products"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"))
    sku = Column(String(255), nullable=True, index=True)
    name = Column(String(255), index=True)
    category = Column(String(255), nullable=True)
    purity = Column(String(255), nullable=True)
    weight = Column(Float, nullable=True)
    stock_quantity = Column(Integer, default=0)
    purchase_price = Column(Float, nullable=True)
    selling_price = Column(Float, nullable=True)
    rate_per_gram = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="products")
    bill_items = relationship("BillItem", back_populates="product")
    inventory_analysis = relationship("InventoryAnalysis", back_populates="product")
    demand_predictions = relationship("DemandPrediction", back_populates="product")
    inventory_transactions = relationship("InventoryTransaction", back_populates="product")

class Bill(Base):
    __tablename__ = "bills"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"))
    customer_id = Column(String(255), nullable=True)
    customer_name = Column(String(255))
    phone_number = Column(String(255), nullable=True)
    customer_email = Column(String(255), nullable=True)
    customer_address = Column(String(512), nullable=True)
    date = Column(String(255))
    invoice_number = Column(String(255), unique=True, index=True)
    gst = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    payment_method = Column(String(255), nullable=True)
    status = Column(String(255), nullable=True)
    subtotal_amount = Column(Float, default=0.0)
    gold_value_total = Column(Float, default=0.0)
    making_charge_total = Column(Float, default=0.0)
    stone_charge_total = Column(Float, default=0.0)
    wastage_amount_total = Column(Float, default=0.0)
    discount_total = Column(Float, default=0.0)
    gst_rate = Column(Float, default=3.0)
    gold_rate_used = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Legacy fields compatibility
    bill_number = Column(String(255), index=True, nullable=True)
    product_name = Column(String(255), nullable=True)
    category = Column(String(255), nullable=True)
    weight = Column(Float, nullable=True)
    purity = Column(String(255), nullable=True)
    amount = Column(Float, nullable=True)
    paid_amount = Column(Float, nullable=True)
    balance_amount = Column(Float, nullable=True)
    payment_status = Column(String(255), nullable=True)
    due_date = Column(String(255), nullable=True)

    user = relationship("User", back_populates="bills")
    items = relationship("BillItem", back_populates="bill", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="bill", cascade="all, delete-orphan")
    sales = relationship("Sale", back_populates="bill", cascade="all, delete-orphan")

class BillItem(Base):
    __tablename__ = "bill_items"
    id = Column(String(255), primary_key=True, index=True)
    bill_id = Column(String(255), ForeignKey("bills.id"))
    product_id = Column(String(255), ForeignKey("products.id"), nullable=True)
    product_name = Column(String(255))
    category = Column(String(255), nullable=True)
    purity = Column(String(255), nullable=True)
    quantity = Column(Integer, default=1)
    rate = Column(Float)
    price = Column(Float, nullable=True)
    weight = Column(Float, default=0.0)
    gold_rate = Column(Float, default=0.0)
    gold_value = Column(Float, default=0.0)
    making_charge = Column(Float, default=0.0)
    stone_charge = Column(Float, default=0.0)
    wastage_percent = Column(Float, default=0.0)
    wastage_amount = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    gst_percent = Column(Float, default=3.0)
    gst_amount = Column(Float, default=0.0)
    subtotal = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    bill = relationship("Bill", back_populates="items")
    product = relationship("Product", back_populates="bill_items")

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"))
    expense_type = Column(String(255))
    amount = Column(Float)
    date = Column(String(255))
    notes = Column(String(255), nullable=True)

    user = relationship("User", back_populates="expenses")

class GoldRate(Base):
    __tablename__ = "gold_rates"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"))
    rate22k = Column(Float)
    rate24k = Column(Float)
    rate_silver = Column(Float)
    date = Column(String(255))
    last_updated = Column(DateTime, default=datetime.utcnow)
    source = Column(String(255), nullable=True)
    status = Column(String(50), default="manual")
    warning = Column(String(512), nullable=True)

    user = relationship("User", back_populates="gold_rates")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    bill_id = Column(String(255), ForeignKey("bills.id"), nullable=True, index=True)
    amount = Column(Float, default=0.0)
    method = Column(String(255), nullable=True)
    status = Column(String(50), default="Paid")
    paid_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(String(512), nullable=True)

    user = relationship("User", back_populates="payments")
    bill = relationship("Bill", back_populates="payments")


class Sale(Base):
    __tablename__ = "sales"
    id = Column(String(255), primary_key=True, index=True)
    sale_id = Column(String(255), index=True, nullable=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    bill_id = Column(String(255), ForeignKey("bills.id"), nullable=True, index=True)
    customer_id = Column(String(255), nullable=True, index=True)
    invoice_number = Column(String(255), index=True, nullable=True)
    bill_date = Column(String(255), index=True, nullable=True)
    total_amount = Column(Float, default=0.0)
    amount_paid = Column(Float, default=0.0)
    balance_amount = Column(Float, default=0.0)
    payment_method = Column(String(255), nullable=True)
    profit_amount = Column(Float, default=0.0)
    payment_status = Column(String(50), nullable=True)
    sale_date = Column(String(255), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sales")
    bill = relationship("Bill", back_populates="sales")



class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    product_id = Column(String(255), ForeignKey("products.id"), nullable=True, index=True)
    bill_id = Column(String(255), ForeignKey("bills.id"), nullable=True, index=True)
    movement_type = Column(String(50), default="sale")
    quantity = Column(Integer, default=0)
    notes = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="inventory_transactions")


# ─── ML Prediction History Tables ─────────────────────────────────────────────

class SalesPrediction(Base):
    """Stores historical sales forecast results per user."""
    __tablename__ = "sales_predictions"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    predicted_month = Column(String(50))          # e.g. "July 2026"
    predicted_month_num = Column(Integer)
    predicted_year = Column(Integer)
    predicted_revenue = Column(Float)
    confidence = Column(String(50), nullable=True) # low / medium / high
    model_version = Column(String(50), default="xgboost_v1")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ChurnPrediction(Base):
    """Stores per-customer churn predictions per run."""
    __tablename__ = "churn_predictions"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    customer_id = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=True)
    churn_probability = Column(Float)
    risk_level = Column(String(50))                # High / Medium / Low
    days_since_last_purchase = Column(Integer, nullable=True)
    total_purchases = Column(Integer, nullable=True)
    total_spend = Column(Float, nullable=True)
    model_version = Column(String(50), default="xgboost_v1")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class InventoryAnalysis(Base):
    __tablename__ = "inventory_analysis"
    id = Column(String(255), primary_key=True, index=True)
    product_id = Column(String(255), ForeignKey("products.id"))
    sales_last_30_days = Column(Integer, default=0)
    sales_last_90_days = Column(Integer, default=0)
    last_sold_date = Column(DateTime, nullable=True)
    stock_status = Column(String(50)) # Fast Moving / Slow Moving / Dead Stock
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="inventory_analysis")


class DemandPrediction(Base):
    """Stores product- or category-level demand predictions."""
    __tablename__ = "demand_predictions"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    product_id = Column(String(255), ForeignKey("products.id"), nullable=True)
    category = Column(String(255), nullable=True, index=True)
    predicted_quantity = Column(Float)
    confidence_score = Column(Float, nullable=True)
    recommended_action = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product", back_populates="demand_predictions")


class PredictionHistory(Base):
    """Stores every prediction made by the pre-trained Colab .joblib models."""
    __tablename__ = "prediction_history"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    product_id = Column(String(255), nullable=True)
    category = Column(String(255), index=True)
    festival = Column(String(255), nullable=True)
    gold_rate = Column(Float, nullable=True)
    wedding_season = Column(Integer, default=0)
    current_stock = Column(Integer, default=0)
    previous_sales = Column(Float, default=0.0)
    predicted_demand = Column(Float, nullable=True)
    predicted_sales = Column(Float, nullable=True)
    prediction_date = Column(String(50), nullable=True)   # date string used as input
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

# ─── WhatsApp Automation Tables ───────────────────────────────────────────────

class WhatsAppCampaign(Base):
    """Stores WhatsApp broadcast campaigns."""
    __tablename__ = "whatsapp_campaigns"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    campaign_name = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    target_group = Column(String(255), nullable=False)   # all / premium / inactive / city:<name> / spend_above:<amount>
    customers_reached = Column(Integer, default=0)
    status = Column(String(50), default="pending")       # pending / running / completed / failed / scheduled
    scheduled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class BroadcastHistory(Base):
    """Stores aggregated broadcast send results."""
    __tablename__ = "broadcast_history"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    campaign_name = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    total_customers = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    delivery_percentage = Column(Float, default=0.0)
    status = Column(String(50), default="completed")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    message_statuses = relationship("MessageStatus", back_populates="broadcast", cascade="all, delete-orphan")


class MessageStatus(Base):
    """Per-customer delivery status for each broadcast."""
    __tablename__ = "message_status"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    broadcast_id = Column(String(255), ForeignKey("broadcast_history.id"), nullable=True, index=True)
    customer_id = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(50), default="pending")  # pending / sent / delivered / read / failed
    meta_message_id = Column(String(255), nullable=True)
    error_message = Column(String(512), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    broadcast = relationship("BroadcastHistory", back_populates="message_statuses")


class WhatsAppMessage(Base):
    """Stores direct WhatsApp messages sent to a single customer."""
    __tablename__ = "whatsapp_messages"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    customer_id = Column(String(255), nullable=False, index=True)
    phone_number = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    wamid = Column(String(255), nullable=True)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class CustomerSegment(Base):
    """Customer segment definitions."""
    __tablename__ = "customer_segments"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    segment_name = Column(String(255), nullable=False)
    description = Column(String(1024), nullable=True)
    filter_type = Column(String(50), nullable=False)    # all / premium / inactive / city / spend_above
    filter_value = Column(String(255), nullable=True)   # e.g. city name or threshold amount
    created_at = Column(DateTime, default=datetime.utcnow)


class AgentConversation(Base):
    """Stores AI agent conversation history."""
    __tablename__ = "agent_conversations"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), index=True)
    user_message = Column(Text, nullable=False)
    agent_response = Column(Text, nullable=False)
    executed_tool = Column(String(255), nullable=True)
    tool_result = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class WhatsAppConfig(Base):
    """Stores tenant WhatsApp Business configuration and credentials."""
    __tablename__ = "whatsapp_configs"
    id = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), ForeignKey("users.id"), unique=True, index=True)
    business_name = Column(String(255), nullable=False)
    business_number = Column(String(255), nullable=False)
    business_account_id = Column(String(255), nullable=True)
    phone_number_id = Column(String(255), nullable=True)
    access_token = Column(String(512), nullable=True)
    status = Column(String(50), default="Disconnected")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="whatsapp_config")


class WhatsAppSettings(Base):
    """Stores tenant WhatsApp Business settings and automation preferences."""
    __tablename__ = "whatsapp_settings"
    id = Column(String(36), primary_key=True, index=True)
    owner_id = Column(String(255), ForeignKey("users.id"), unique=True, index=True)
    phone_number_id = Column(String(255), nullable=True)
    business_account_id = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=True)
    verify_token = Column(String(255), nullable=True)
    is_connected = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Preferences
    festival_campaigns = Column(Boolean, default=False)
    invoice_notifications = Column(Boolean, default=False)
    payment_reminders = Column(Boolean, default=False)
    new_collection_announcements = Column(Boolean, default=False)
    birthday_wishes = Column(Boolean, default=False)
    order_status_updates = Column(Boolean, default=False)
    
    owner = relationship("User")
