import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


MYSQL_COLUMN_UPDATES = {
    "users": {
        "gstin": "VARCHAR(50) NULL",
        "city": "VARCHAR(255) NULL",
        "phone": "VARCHAR(50) NULL",
        "address": "VARCHAR(512) NULL",
        "reset_token": "VARCHAR(255) NULL",
    },
    "products": {
        "sku": "VARCHAR(255) NULL",
        "category": "VARCHAR(255) NULL",
        "purity": "VARCHAR(255) NULL",
        "weight": "DOUBLE NULL DEFAULT 0",
        "stock_quantity": "INT NULL DEFAULT 0",
        "purchase_price": "DOUBLE NULL",
        "selling_price": "DOUBLE NULL",
        "rate_per_gram": "DOUBLE NULL",
        "created_at": "DATETIME NULL",
        "updated_at": "DATETIME NULL",
    },
    "bills": {
        "customer_email": "VARCHAR(255) NULL",
        "customer_address": "VARCHAR(512) NULL",
        "subtotal_amount": "DOUBLE NULL DEFAULT 0",
        "gold_value_total": "DOUBLE NULL DEFAULT 0",
        "making_charge_total": "DOUBLE NULL DEFAULT 0",
        "stone_charge_total": "DOUBLE NULL DEFAULT 0",
        "wastage_amount_total": "DOUBLE NULL DEFAULT 0",
        "discount_total": "DOUBLE NULL DEFAULT 0",
        "gst_rate": "DOUBLE NULL DEFAULT 3",
        "gold_rate_used": "DOUBLE NULL DEFAULT 0",
        "created_at": "DATETIME NULL",
        "updated_at": "DATETIME NULL",
    },
    "bill_items": {
        "category": "VARCHAR(255) NULL",
        "purity": "VARCHAR(255) NULL",
        "gold_rate": "DOUBLE NULL DEFAULT 0",
        "gold_value": "DOUBLE NULL DEFAULT 0",
        "stone_charge": "DOUBLE NULL DEFAULT 0",
        "wastage_percent": "DOUBLE NULL DEFAULT 0",
        "wastage_amount": "DOUBLE NULL DEFAULT 0",
        "discount": "DOUBLE NULL DEFAULT 0",
        "gst_percent": "DOUBLE NULL DEFAULT 3",
        "gst_amount": "DOUBLE NULL DEFAULT 0",
        "subtotal": "DOUBLE NULL DEFAULT 0",
        "total": "DOUBLE NULL DEFAULT 0",
    },
    "gold_rates": {
        "last_updated": "DATETIME NULL",
        "source": "VARCHAR(255) NULL",
        "status": "VARCHAR(50) NULL DEFAULT 'manual'",
        "warning": "VARCHAR(512) NULL",
    },
    "customers": {
        "customer_id": "VARCHAR(255) NULL",
        "phone_number": "VARCHAR(255) NULL",
        "total_purchase_amount": "DOUBLE NULL DEFAULT 0",
        "paid_amount": "DOUBLE NULL DEFAULT 0",
        "balance_amount": "DOUBLE NULL DEFAULT 0",
        "payment_status": "VARCHAR(50) NULL DEFAULT 'Pending'",
        "created_at": "DATETIME NULL",
        "updated_at": "DATETIME NULL",
    },
    "sales": {
        "sale_id": "VARCHAR(255) NULL",
        "invoice_number": "VARCHAR(255) NULL",
        "bill_date": "VARCHAR(255) NULL",
        "amount_paid": "DOUBLE NULL DEFAULT 0",
        "balance_amount": "DOUBLE NULL DEFAULT 0",
        "payment_method": "VARCHAR(255) NULL",
    },
    "prediction_history": {
        "product_id": "VARCHAR(255) NULL",
        "category": "VARCHAR(255) NULL",
        "festival": "VARCHAR(255) NULL",
        "gold_rate": "DOUBLE NULL",
        "wedding_season": "INT NULL DEFAULT 0",
        "current_stock": "INT NULL DEFAULT 0",
        "previous_sales": "DOUBLE NULL DEFAULT 0",
        "predicted_demand": "DOUBLE NULL",
        "predicted_sales": "DOUBLE NULL",
        "prediction_date": "VARCHAR(50) NULL",
        "created_at": "DATETIME NULL",
    },
    "demand_predictions": {
        "user_id": "VARCHAR(255) NULL",
        "category": "VARCHAR(255) NULL",
    },
    "whatsapp_settings": {
        "phone_number_id": "VARCHAR(255) NULL",
        "business_account_id": "VARCHAR(255) NULL",
        "access_token": "TEXT NULL",
        "verify_token": "VARCHAR(255) NULL",
        "is_connected": "TINYINT NULL DEFAULT 0",
        "festival_campaigns": "TINYINT NULL DEFAULT 0",
        "invoice_notifications": "TINYINT NULL DEFAULT 0",
        "payment_reminders": "TINYINT NULL DEFAULT 0",
        "new_collection_announcements": "TINYINT NULL DEFAULT 0",
        "birthday_wishes": "TINYINT NULL DEFAULT 0",
        "order_status_updates": "TINYINT NULL DEFAULT 0",
    },
}

MYSQL_FOREIGN_KEY_UPDATES = {
    "demand_predictions": [
        ("fk_demand_predictions_user_id_users", "user_id", "users", "id"),
    ],
}



def ensure_schema(engine: Engine) -> None:
    """Additive compatibility migration for existing MySQL installs."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table_name, columns in MYSQL_COLUMN_UPDATES.items():
            if table_name not in existing_tables:
                continue

            existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
            for column_name, ddl in columns.items():
                if column_name in existing_columns:
                    continue
                try:
                    conn.execute(text(f"ALTER TABLE `{table_name}` ADD COLUMN `{column_name}` {ddl}"))
                    logger.info("Added missing column %s.%s", table_name, column_name)
                except Exception as exc:
                    logger.warning("Could not add column %s.%s: %s", table_name, column_name, exc)

        inspector = inspect(engine)
        for table_name, foreign_keys in MYSQL_FOREIGN_KEY_UPDATES.items():
            if table_name not in existing_tables:
                continue
            existing_foreign_keys = inspector.get_foreign_keys(table_name)
            for name, column, referred_table, referred_column in foreign_keys:
                if any(
                    fk.get("constrained_columns") == [column]
                    and fk.get("referred_table") == referred_table
                    and fk.get("referred_columns") == [referred_column]
                    for fk in existing_foreign_keys
                ):
                    continue
                try:
                    conn.execute(text(
                        f"ALTER TABLE `{table_name}` ADD CONSTRAINT `{name}` "
                        f"FOREIGN KEY (`{column}`) REFERENCES `{referred_table}` (`{referred_column}`)"
                    ))
                except Exception as exc:
                    logger.warning("Could not add foreign key %s on %s: %s", name, table_name, exc)
