from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    shop_name: Optional[str] = "My Jewellery Shop"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class WhatsAppSettingsBase(BaseModel):
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    festival_campaigns: bool = False
    invoice_notifications: bool = False
    payment_reminders: bool = False
    new_collection_announcements: bool = False
    birthday_wishes: bool = False
    order_status_updates: bool = False

class WhatsAppSettingsResponse(BaseModel):
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    is_connected: bool = False
    webhook_url: str
    festival_campaigns: bool = False
    invoice_notifications: bool = False
    payment_reminders: bool = False
    new_collection_announcements: bool = False
    birthday_wishes: bool = False
    order_status_updates: bool = False

class WhatsAppTestConnectionRequest(BaseModel):
    phone_number_id: str
    business_account_id: str
    access_token: str
    verify_token: str

class ProfileUpdate(BaseModel):
    ownerName: str
    shopName: str
    gstin: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class OwnerProfile(BaseModel):
    ownerName: str
    shopName: str
    gstin: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    createdAt: str
    email: Optional[str] = None
    class Config:
        from_attributes = True

class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    dob: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    total_purchase_amount: Optional[float] = 0.0
    paid_amount: Optional[float] = 0.0
    balance_amount: Optional[float] = 0.0
    payment_status: Optional[str] = "Pending"

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(CustomerBase):
    name: Optional[str] = None

class CustomerOut(CustomerBase):
    id: str
    customer_id: Optional[str] = None
    customerSince: Optional[str] = None
    visits: Optional[int] = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True


class ProductBase(BaseModel):
    sku: Optional[str] = None
    name: str = Field(min_length=1)
    category: Optional[str] = None
    purity: Optional[str] = None
    weight: Optional[float] = None
    stockQuantity: Optional[int] = Field(default=None, ge=0)
    purchasePrice: Optional[float] = None
    sellingPrice: Optional[float] = None
    ratePerGram: Optional[float] = None

class ProductCreate(ProductBase):
    category: str = Field(min_length=1)
    purity: str = Field(min_length=1)
    weight: float = Field(ge=0)
    stockQuantity: int = Field(ge=0)
    purchasePrice: float = Field(ge=0)
    sellingPrice: float = Field(ge=0)
    ratePerGram: float = Field(ge=0)

class ProductOut(ProductBase):
    id: str
    stockQuantity: int = 0
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    class Config:
        from_attributes = True

class BillItemBase(BaseModel):
    productName: str
    productId: Optional[str] = None
    category: Optional[str] = None
    purity: Optional[str] = None
    quantity: int
    rate: Optional[float] = None
    price: Optional[float] = None
    weight: float = 0.0
    makingCharge: float = 0.0
    goldRate: Optional[float] = None
    goldValue: Optional[float] = None
    stoneCharge: float = 0.0
    wastagePercent: float = 0.0
    wastageAmount: Optional[float] = None
    discount: float = 0.0
    gstPercent: float = 3.0
    gstAmount: Optional[float] = None
    subtotal: Optional[float] = None
    total: Optional[float] = None

class BillItemCreate(BillItemBase):
    pass

class BillItemOut(BillItemBase):
    id: str
    class Config:
        from_attributes = True

class BillBase(BaseModel):
    customerName: str
    phoneNumber: Optional[str] = None
    customerEmail: Optional[str] = None
    customerAddress: Optional[str] = None
    date: str
    invoiceNumber: str
    gst: float
    totalAmount: float
    paymentMethod: Optional[str] = None
    status: Optional[str] = None
    subtotalAmount: Optional[float] = None
    goldValueTotal: Optional[float] = None
    makingChargeTotal: Optional[float] = None
    stoneChargeTotal: Optional[float] = None
    wastageAmountTotal: Optional[float] = None
    discountTotal: Optional[float] = None
    gstRate: Optional[float] = None
    goldRateUsed: Optional[float] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    # Legacy fields mapping
    customerId: Optional[str] = None
    billNumber: Optional[str] = None
    productName: Optional[str] = None
    category: Optional[str] = None
    weight: Optional[float] = None
    purity: Optional[str] = None
    amount: Optional[float] = None
    paidAmount: Optional[float] = None
    balanceAmount: Optional[float] = None
    paymentStatus: Optional[str] = None
    dueDate: Optional[str] = None

class BillCreate(BaseModel):
    customerName: str
    phoneNumber: Optional[str] = None
    customerEmail: Optional[str] = None
    customerAddress: Optional[str] = None
    # date is optional — backend uses current server datetime if not provided
    date: Optional[str] = None
    # invoiceNumber auto-generated if not provided; also accept billNumber alias
    invoiceNumber: Optional[str] = None
    billNumber: Optional[str] = None
    gst: Optional[float] = None
    totalAmount: Optional[float] = None
    # paymentMethod defaults to Cash if not provided
    paymentMethod: Optional[str] = "Cash"
    # accept both "status" (Paid/Partial/Pending) and "paymentStatus" alias
    status: Optional[str] = None
    paymentStatus: Optional[str] = None
    paidAmount: Optional[float] = None
    balanceAmount: Optional[float] = None

    # Optional legacy fields
    customerId: Optional[str] = None
    category: Optional[str] = None
    purity: Optional[str] = None
    dueDate: Optional[str] = None

    items: List[BillItemCreate]

    def resolved_status(self) -> str:
        """Return normalized payment status: Paid / Partial / Pending."""
        raw = self.status or self.paymentStatus or "Paid"
        if raw in {"Full", "Paid"}:
            return "Paid"
        if raw == "Partial":
            return "Partial"
        return "Pending"

    def resolved_invoice_number(self) -> Optional[str]:
        return self.invoiceNumber or self.billNumber or None

class BillOut(BillBase):
    id: str
    items: List[BillItemOut] = []
    class Config:
        from_attributes = True

class ExpenseBase(BaseModel):
    expenseType: str
    amount: float
    date: str
    notes: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseOut(ExpenseBase):
    id: str
    class Config:
        from_attributes = True

class GoldRateBase(BaseModel):
    rate22k: float
    rate24k: float
    rateSilver: float
    date: str

class GoldRateCreate(GoldRateBase):
    pass

class GoldRateOut(GoldRateBase):
    id: str
    lastUpdated: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    warning: Optional[str] = None
    priceDifference22k: Optional[float] = None
    priceDifference24k: Optional[float] = None
    class Config:
        from_attributes = True


class PaymentOut(BaseModel):
    id: str
    billId: Optional[str] = None
    amount: float
    method: Optional[str] = None
    status: str
    paidAt: str
    class Config:
        from_attributes = True


class DashboardMetricsOut(BaseModel):
    todaySales: float
    monthlyRevenue: float
    totalRevenue: float
    totalExpenses: float
    profit: float
    pendingPayments: float
    orders: int
    customers: int
    inventory: int
    inventoryValue: float
    latestGold: Optional[Dict[str, Any]] = None
    warning: Optional[str] = None


class VoiceQueryRequest(BaseModel):
    message: str


# ─── ML Request / Response Schemas ────────────────────────────────────────────

class TrainModelResponse(BaseModel):
    status: str
    model: Optional[str] = None
    rows_trained: Optional[int] = None
    rows_tested: Optional[int] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    accuracy: Optional[float] = None
    trained_at: Optional[str] = None
    reason: Optional[str] = None
    message: Optional[str] = None


class PredictSalesRequest(BaseModel):
    months_ahead: int = 3


class SalesPredictionItem(BaseModel):
    month: str
    year: int
    month_num: int
    predicted_revenue: float
    confidence: str


class PredictSalesResponse(BaseModel):
    status: str
    months_ahead: Optional[int] = None
    predictions: Optional[List[SalesPredictionItem]] = None
    total_predicted_revenue: Optional[float] = None
    currency: Optional[str] = "INR"
    historical_months_used: Optional[int] = None
    generated_at: Optional[str] = None
    message: Optional[str] = None


class ChurnCustomerItem(BaseModel):
    customer_id: str
    customer_name: str
    phone: str
    churn_probability: float
    risk_level: str
    days_since_last_purchase: int
    total_purchases: int
    total_spend: float


class PredictChurnResponse(BaseModel):
    status: str
    total_customers_analyzed: Optional[int] = None
    at_risk_count: Optional[int] = None
    high_risk_count: Optional[int] = None
    threshold_used: Optional[float] = None
    customers: Optional[List[ChurnCustomerItem]] = None
    generated_at: Optional[str] = None
    message: Optional[str] = None


class DemandCategoryItem(BaseModel):
    category: str
    predicted_units_next_month: float
    restock_urgency: str
    urgency_score: float
    recent_avg_units: float
    is_festival_month: bool


class PredictDemandResponse(BaseModel):
    status: str
    prediction_month: Optional[str] = None
    categories_analyzed: Optional[int] = None
    high_urgency_count: Optional[int] = None
    predictions: Optional[List[DemandCategoryItem]] = None
    generated_at: Optional[str] = None
    message: Optional[str] = None


class InventoryAnalysisOut(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    sales_last_30_days: int
    sales_last_90_days: int
    last_sold_date: Optional[str] = None
    stock_status: str
    stock_quantity: int = 0
    class Config:
        from_attributes = True


class DemandPredictionOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    product_id: Optional[str] = None
    category: Optional[str] = None
    product_name: Optional[str] = None
    predicted_quantity: float
    confidence_score: Optional[float] = None
    recommended_action: Optional[str] = None
    class Config:
        from_attributes = True


class SaleOut(BaseModel):
    sale_id: str
    customer_id: Optional[str] = None
    invoice_number: Optional[str] = None
    bill_date: Optional[str] = None
    total_amount: float = 0.0
    amount_paid: float = 0.0
    balance_amount: float = 0.0
    payment_method: Optional[str] = None
    class Config:
        from_attributes = True


class RevenueOut(BaseModel):
    revenue: float


class ProfitOut(BaseModel):
    profit: float


class DailySalesOut(BaseModel):
    todaySales: float
    dailySales: float


class MonthlyChartItem(BaseModel):
    month: str
    revenue: float
    profit: float


class MonthlySalesOut(BaseModel):
    monthlySales: float
    chartData: List[MonthlyChartItem]


class CustomerCountOut(BaseModel):
    customerCount: int


class PendingPaymentsOut(BaseModel):
    pendingPayments: float


# ─── AI Prediction Schemas ────────────────────────────────────────────────────

class PredictionInput(BaseModel):
    month: Optional[int] = None
    week: Optional[int] = None
    date: Optional[str] = None           # YYYY-MM-DD
    product_id: Optional[str] = "0"
    category: str
    gold_rate: float
    festival: str = "No"
    wedding_season: int = 0             # 0 or 1
    current_stock: int = 0
    previous_sales: float = 0.0



class PredictionOutput(BaseModel):
    predicted_demand: float
    predicted_sales: Optional[float] = None
    category: str
    festival: str
    prediction_timestamp: str


class PredictionHistoryItem(BaseModel):
    id: str
    product_id: Optional[str] = None
    category: str
    festival: Optional[str] = None
    gold_rate: Optional[float] = None
    predicted_demand: Optional[float] = None
    predicted_sales: Optional[float] = None
    prediction_date: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class ModelStatusOut(BaseModel):
    demand_model: str
    sales_model: str
    category_encoder: str
    festival_encoder: str


class EncoderLabelsOut(BaseModel):
    categories: List[str]
    festivals: List[str]
