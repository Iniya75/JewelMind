import uuid
import logging
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from .. import models, schemas

logger = logging.getLogger(__name__)

def _round_money(val: float) -> float:
    return round(float(val or 0.0), 2)

def get_customers(db: Session, user_id: str) -> List[models.Customer]:
    return db.query(models.Customer).filter(models.Customer.user_id == user_id).all()

def get_customer_by_id(db: Session, user_id: str, customer_id: str) -> Optional[models.Customer]:
    return (
        db.query(models.Customer)
        .filter(
            models.Customer.user_id == user_id,
            (models.Customer.id == customer_id) | (models.Customer.customer_id == customer_id)
        )
        .first()
    )

def create_customer(db: Session, user_id: str, data: schemas.CustomerCreate) -> models.Customer:
    try:
        cid = str(uuid.uuid4())
        phone_val = data.phone_number or data.phone or ""
        db_cust = models.Customer(
            id=cid,
            customer_id=cid,
            user_id=user_id,
            name=data.name,
            phone=phone_val,
            phone_number=phone_val,
            email=data.email,
            dob=data.dob,
            address=data.address,
            city=data.city,
            customer_since=datetime.utcnow().isoformat(),
            visits=0,
            total_purchase_amount=_round_money(data.total_purchase_amount or 0.0),
            paid_amount=_round_money(data.paid_amount or 0.0),
            balance_amount=_round_money(data.balance_amount or 0.0),
            payment_status=data.payment_status or "Pending",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(db_cust)
        db.commit()
        db.refresh(db_cust)
        return db_cust
    except Exception as exc:
        db.rollback()
        logger.exception("Error creating customer for user %s", user_id)
        raise

def update_customer(db: Session, user_id: str, customer_id: str, data: schemas.CustomerUpdate) -> Optional[models.Customer]:
    try:
        cust = get_customer_by_id(db, user_id, customer_id)
        if not cust:
            return None
        if data.name is not None:
            cust.name = data.name
        phone_val = data.phone_number or data.phone
        if phone_val is not None:
            cust.phone = phone_val
            cust.phone_number = phone_val
        if data.email is not None:
            cust.email = data.email
        if data.dob is not None:
            cust.dob = data.dob
        if data.address is not None:
            cust.address = data.address
        if data.city is not None:
            cust.city = data.city
        if data.total_purchase_amount is not None:
            cust.total_purchase_amount = _round_money(data.total_purchase_amount)
        if data.paid_amount is not None:
            cust.paid_amount = _round_money(data.paid_amount)
        if data.balance_amount is not None:
            cust.balance_amount = _round_money(data.balance_amount)
        if data.payment_status is not None:
            cust.payment_status = data.payment_status
        cust.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(cust)
        return cust
    except Exception as exc:
        db.rollback()
        logger.error("Error updating customer: %s", exc)
        raise

def delete_customer(db: Session, user_id: str, customer_id: str) -> bool:
    try:
        cust = get_customer_by_id(db, user_id, customer_id)
        if not cust:
            return False
        db.delete(cust)
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        logger.error("Error deleting customer: %s", exc)
        raise
