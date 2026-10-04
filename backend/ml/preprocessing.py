"""
preprocessing.py
================
Feature engineering from real JewelMind MySQL data via SQLAlchemy.
No dummy data — all features derived from bills, customers, products,
gold_rates tables belonging to a specific user_id.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

# ─── Shared feature column lists (used by train_model.py and predict.py) ─────
SALES_FEATURE_COLS = [
    "month", "quarter", "is_festival", "avg_gold_rate",
    "active_customers", "num_transactions",
    "lag_1_revenue", "lag_2_revenue", "rolling_3_avg"
]

CHURN_FEATURE_COLS = [
    "days_since_last_purchase", "total_purchases", "total_spend",
    "avg_basket_size", "purchase_frequency_days", "visit_count"
]

DEMAND_FEATURE_COLS = [
    "month", "quarter", "is_festival", "avg_gold_rate",
    "lag_1_units", "rolling_3_avg_units"
]


# Approximate windows that consistently drive jewelry sales in India.
FESTIVAL_WINDOWS = [
    (10, 1, 31),   # Navratri / Dussehra / Dhanteras / Diwali — October
    (11, 1, 15),   # Diwali overflow — early November
    (4, 15, 30),   # Akshaya Tritiya — late April / early May
    (5, 1, 10),    # Akshaya Tritiya overflow
    (2, 1, 28),    # Valentine's / Wedding season
    (12, 15, 31),  # Christmas / Year-end wedding season
    (1, 1, 15),    # New Year / Pongal / Makar Sankranti
]


def _is_festival_month(year: int, month: int) -> int:
    """Return 1 if any day in (year, month) falls in a festival window."""
    for fw_month, _, _ in FESTIVAL_WINDOWS:
        if month == fw_month:
            return 1
    return 0


def _get_quarter(month: int) -> int:
    return (month - 1) // 3 + 1


def _parse_date(date_str) -> datetime | None:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(date_str), fmt)
        except ValueError:
            continue
    return None


# ─── Bills DataFrame Helper ───────────────────────────────────────────────────

def _load_bills_df(db: Session, user_id: str) -> pd.DataFrame:
    """Load all bills for a user into a DataFrame with parsed dates."""
    rows = db.execute(
        text("""
            SELECT b.id, b.date, b.total_amount, b.amount, b.category,
                   b.customer_id, b.payment_status
            FROM bills b
            WHERE b.user_id = :uid
        """),
        {"uid": user_id}
    ).fetchall()

    df = pd.DataFrame(rows, columns=[
        "id", "date", "total_amount", "amount", "category",
        "customer_id", "payment_status"
    ])

    if df.empty:
        return df

    df["parsed_date"] = df["date"].apply(_parse_date)
    df = df.dropna(subset=["parsed_date"])
    df["year"] = df["parsed_date"].dt.year
    df["month"] = df["parsed_date"].dt.month
    df["quarter"] = df["month"].apply(_get_quarter)
    df["is_festival"] = df.apply(
        lambda r: _is_festival_month(r["year"], r["month"]), axis=1
    )
    # Use total_amount if available, fall back to amount
    df["sale_value"] = df["total_amount"].fillna(df["amount"]).fillna(0).astype(float)
    return df


def _load_gold_rates_df(db: Session, user_id: str) -> pd.DataFrame:
    """Load gold rates and return monthly average 22k rate."""
    rows = db.execute(
        text("""
            SELECT date, rate22k FROM gold_rates WHERE user_id = :uid
        """),
        {"uid": user_id}
    ).fetchall()

    df = pd.DataFrame(rows, columns=["date", "rate22k"])
    if df.empty:
        return df

    df["parsed_date"] = df["date"].apply(_parse_date)
    df = df.dropna(subset=["parsed_date"])
    df["year"] = df["parsed_date"].dt.year
    df["month"] = df["parsed_date"].dt.month
    df["rate22k"] = pd.to_numeric(df["rate22k"], errors="coerce")
    return df.groupby(["year", "month"], as_index=False)["rate22k"].mean()


# ─── 1. Sales Forecasting Features ───────────────────────────────────────────

def build_sales_features(db: Session, user_id: str) -> pd.DataFrame:
    """
    Build monthly sales feature matrix.
    Returns DataFrame with columns:
        year, month, quarter, is_festival, avg_gold_rate,
        active_customers, num_transactions, target_revenue
    """
    bills = _load_bills_df(db, user_id)
    if bills.empty:
        return pd.DataFrame()

    # Monthly aggregates
    monthly = bills.groupby(["year", "month"]).agg(
        target_revenue=("sale_value", "sum"),
        num_transactions=("id", "count"),
        active_customers=("customer_id", "nunique"),
        is_festival=("is_festival", "max"),
        quarter=("quarter", "first"),
    ).reset_index()

    # Merge gold rates
    gold = _load_gold_rates_df(db, user_id)
    if not gold.empty:
        monthly = monthly.merge(gold, on=["year", "month"], how="left")
        monthly["avg_gold_rate"] = monthly["rate22k"].fillna(
            monthly["rate22k"].mean()
        )
    else:
        monthly["avg_gold_rate"] = 0.0

    monthly = monthly.drop(columns=["rate22k"], errors="ignore")

    # Lag features (previous month revenue)
    monthly = monthly.sort_values(["year", "month"]).reset_index(drop=True)
    monthly["lag_1_revenue"] = monthly["target_revenue"].shift(1).fillna(0)
    monthly["lag_2_revenue"] = monthly["target_revenue"].shift(2).fillna(0)
    monthly["rolling_3_avg"] = (
        monthly["target_revenue"].rolling(3, min_periods=1).mean().shift(1).fillna(0)
    )

    return monthly.dropna(subset=["target_revenue"])


def build_sales_prediction_features(
    year: int, month: int, avg_gold_rate: float,
    lag_1_revenue: float, lag_2_revenue: float, rolling_3_avg: float,
    active_customers: int = 0, num_transactions: int = 0
) -> pd.DataFrame:
    """
    Build a single-row feature vector for future month prediction.
    """
    quarter = _get_quarter(month)
    is_festival = _is_festival_month(year, month)
    df = pd.DataFrame([{
        "month": month,
        "quarter": quarter,
        "is_festival": is_festival,
        "avg_gold_rate": avg_gold_rate,
        "active_customers": active_customers,
        "num_transactions": num_transactions,
        "lag_1_revenue": lag_1_revenue,
        "lag_2_revenue": lag_2_revenue,
        "rolling_3_avg": rolling_3_avg,
    }])
    return df[SALES_FEATURE_COLS]



# ─── 2. Customer Churn Features ───────────────────────────────────────────────

def build_churn_features(db: Session, user_id: str) -> pd.DataFrame:
    """
    Build per-customer churn feature matrix.
    Churn label: customer has NOT purchased in the last 90 days
    (relative to the dataset's latest date).

    Returns DataFrame with columns:
        customer_id, days_since_last_purchase, total_purchases,
        total_spend, avg_basket_size, purchase_frequency_days,
        visit_count, is_churned (target)
    """
    bills = _load_bills_df(db, user_id)
    if bills.empty:
        return pd.DataFrame()

    reference_date = bills["parsed_date"].max()
    churn_threshold_days = 90

    customer_stats = bills.groupby("customer_id").agg(
        last_purchase=("parsed_date", "max"),
        first_purchase=("parsed_date", "min"),
        total_purchases=("id", "count"),
        total_spend=("sale_value", "sum"),
        avg_basket_size=("sale_value", "mean"),
    ).reset_index()

    customer_stats["days_since_last_purchase"] = (
        reference_date - customer_stats["last_purchase"]
    ).dt.days

    customer_stats["customer_lifespan_days"] = (
        customer_stats["last_purchase"] - customer_stats["first_purchase"]
    ).dt.days.clip(lower=1)

    customer_stats["purchase_frequency_days"] = (
        customer_stats["customer_lifespan_days"] / customer_stats["total_purchases"]
    ).fillna(0)

    # Churn label
    customer_stats["is_churned"] = (
        customer_stats["days_since_last_purchase"] > churn_threshold_days
    ).astype(int)

    # Merge visits from customers table
    visit_rows = db.execute(
        text("SELECT id, visits FROM customers WHERE user_id = :uid"),
        {"uid": user_id}
    ).fetchall()
    visits_df = pd.DataFrame(visit_rows, columns=["customer_id", "visit_count"])
    customer_stats = customer_stats.merge(visits_df, on="customer_id", how="left")
    customer_stats["visit_count"] = customer_stats["visit_count"].fillna(0)

    feature_cols = [
        "customer_id", "days_since_last_purchase", "total_purchases",
        "total_spend", "avg_basket_size", "purchase_frequency_days",
        "visit_count", "is_churned"
    ]
    return customer_stats[feature_cols].dropna()


# ─── 3. Demand / Restock Features ─────────────────────────────────────────────

def build_demand_features(db: Session, user_id: str) -> pd.DataFrame:
    """
    Build per-product-category monthly demand feature matrix.
    Target: units_sold (quantity from bill_items, or transaction count per category).

    Returns DataFrame with columns:
        category, year, month, quarter, is_festival,
        avg_gold_rate, units_sold (target), lag_1_units, rolling_3_avg_units
    """
    # Try bill_items first (more granular)
    item_rows = db.execute(
        text("""
            SELECT bi.quantity, bi.weight, b.date, b.category, b.user_id
            FROM bill_items bi
            JOIN bills b ON bi.bill_id = b.id
            WHERE b.user_id = :uid
        """),
        {"uid": user_id}
    ).fetchall()

    item_df = pd.DataFrame(item_rows, columns=[
        "quantity", "weight", "date", "category", "user_id"
    ])

    if not item_df.empty:
        item_df["parsed_date"] = item_df["date"].apply(_parse_date)
        item_df = item_df.dropna(subset=["parsed_date"])
        item_df["year"] = item_df["parsed_date"].dt.year
        item_df["month"] = item_df["parsed_date"].dt.month
        item_df["quantity"] = pd.to_numeric(item_df["quantity"], errors="coerce").fillna(1)
        item_df["category"] = item_df["category"].fillna("Uncategorized")

        monthly_cat = item_df.groupby(["category", "year", "month"]).agg(
            units_sold=("quantity", "sum"),
        ).reset_index()
    else:
        # Fallback: use bills.category and count transactions
        bills = _load_bills_df(db, user_id)
        if bills.empty:
            return pd.DataFrame()
        bills["category"] = bills["category"].fillna("Uncategorized")
        monthly_cat = bills.groupby(["category", "year", "month"]).agg(
            units_sold=("id", "count"),
        ).reset_index()

    # Add time features
    monthly_cat["quarter"] = monthly_cat["month"].apply(_get_quarter)
    monthly_cat["is_festival"] = monthly_cat.apply(
        lambda r: _is_festival_month(int(r["year"]), int(r["month"])), axis=1
    )

    # Add gold rate
    gold = _load_gold_rates_df(db, user_id)
    if not gold.empty:
        monthly_cat = monthly_cat.merge(gold, on=["year", "month"], how="left")
        global_avg = gold["rate22k"].mean()
        monthly_cat["avg_gold_rate"] = monthly_cat["rate22k"].fillna(global_avg)
        monthly_cat = monthly_cat.drop(columns=["rate22k"], errors="ignore")
    else:
        monthly_cat["avg_gold_rate"] = 0.0

    # Lag features per category
    result_frames = []
    for cat, grp in monthly_cat.groupby("category"):
        grp = grp.sort_values(["year", "month"]).reset_index(drop=True)
        grp["lag_1_units"] = grp["units_sold"].shift(1).fillna(0)
        grp["rolling_3_avg_units"] = (
            grp["units_sold"].rolling(3, min_periods=1).mean().shift(1).fillna(0)
        )
        result_frames.append(grp)

    if not result_frames:
        return pd.DataFrame()

    return pd.concat(result_frames, ignore_index=True).dropna(subset=["units_sold"])
