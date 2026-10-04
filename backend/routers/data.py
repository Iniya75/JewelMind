from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
import uuid
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


from .. import schemas, models, auth, database
from ..pdf_generator import generate_invoice_pdf
from ..services import conversation_service, customer_service
from ..services.business_query_service import answer_business_query

from ..services.gold_rate_service import (
    get_latest_rate,
    serialize_rate,
    update_gold_rates_for_user,
)

router = APIRouter(tags=["data"])


def _round_money(value: float) -> float:
    return round(float(value or 0), 2)


def _rate_for_purity(purity: str, latest_rate: models.GoldRate) -> float:
    normalized = (purity or "22K").strip().lower()
    if normalized.startswith("24"):
        return float(latest_rate.rate24k or 0)
    if normalized.startswith("22"):
        return float(latest_rate.rate22k or 0)
    if normalized.startswith("18"):
        return _round_money(float(latest_rate.rate24k or 0) * 18 / 24)
    if normalized.startswith("14"):
        return _round_money(float(latest_rate.rate24k or 0) * 14 / 24)
    if "silver" in normalized or "925" in normalized:
        return float(latest_rate.rate_silver or 0)
    return float(latest_rate.rate22k or 0)


def _generate_invoice_number(db: Session, user_id: str) -> str:
    from datetime import datetime as dt
    today = dt.utcnow()
    prefix = f"JM-{today.strftime('%Y%m%d')}-"
    
    # Find the latest invoice for today
    latest_bill = (
        db.query(models.Bill)
        .filter(models.Bill.user_id == user_id)
        .filter(models.Bill.invoice_number.like(f"{prefix}%"))
        .order_by(models.Bill.invoice_number.desc())
        .first()
    )
    
    if latest_bill and latest_bill.invoice_number:
        try:
            seq = int(latest_bill.invoice_number.split("-")[-1])
            next_seq = seq + 1
        except ValueError:
            next_seq = 1
    else:
        next_seq = 1
        
    return f"{prefix}{next_seq:04d}"


def _serialize_product(product: models.Product) -> dict:
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "purity": product.purity,
        "weight": product.weight,
        "stockQuantity": product.stock_quantity or 0,
        "purchasePrice": product.purchase_price,
        "sellingPrice": product.selling_price,
        "ratePerGram": product.rate_per_gram,
        "createdAt": product.created_at.isoformat() if product.created_at else None,
        "updatedAt": product.updated_at.isoformat() if product.updated_at else None,
    }


def _serialize_bill_item(item: models.BillItem) -> dict:
    return {
        "id": item.id,
        "productName": item.product_name,
        "productId": item.product_id,
        "category": item.category,
        "purity": item.purity,
        "quantity": item.quantity,
        "rate": item.gold_rate or item.rate or 0.0,
        "price": item.total or item.price or 0.0,
        "weight": item.weight,
        "makingCharge": item.making_charge,
        "goldRate": item.gold_rate or item.rate or 0.0,
        "goldValue": item.gold_value or 0.0,
        "stoneCharge": item.stone_charge or 0.0,
        "wastagePercent": item.wastage_percent or 0.0,
        "wastageAmount": item.wastage_amount or 0.0,
        "discount": item.discount or 0.0,
        "gstPercent": item.gst_percent or 0.0,
        "gstAmount": item.gst_amount or 0.0,
        "subtotal": item.subtotal or 0.0,
        "total": item.total or item.price or 0.0,
    }


def _serialize_bill(bill: models.Bill) -> dict:
    items = [_serialize_bill_item(item) for item in bill.items]
    first = items[0] if items else {}
    total = _round_money(bill.total_amount if bill.total_amount is not None else bill.amount or 0)
    subtotal = _round_money(bill.subtotal_amount or bill.amount or total)
    paid = _round_money(bill.paid_amount or 0)
    balance = _round_money(bill.balance_amount or max(total - paid, 0))
    return {
        "id": bill.id,
        "customerId": bill.customer_id,
        "customerName": bill.customer_name,
        "phoneNumber": bill.phone_number,
        "customerEmail": bill.customer_email,
        "customerAddress": bill.customer_address,
        "billNumber": bill.bill_number or bill.invoice_number,
        "invoiceNumber": bill.invoice_number or bill.bill_number or f"INV-{bill.id[:8]}",
        "productName": bill.product_name or first.get("productName", ""),
        "category": bill.category or first.get("category", ""),
        "weight": bill.weight or sum(float(item.get("weight") or 0) for item in items),
        "purity": bill.purity or first.get("purity", "22K"),
        "amount": total,
        "paidAmount": paid,
        "balanceAmount": balance,
        "paymentStatus": bill.payment_status or ("Full" if balance <= 0 else "Pending"),
        "dueDate": bill.due_date,
        "date": bill.date,
        "gst": _round_money(bill.gst or 0),
        "totalAmount": total,
        "paymentMethod": bill.payment_method,
        "status": bill.status,
        "subtotalAmount": subtotal,
        "goldValueTotal": _round_money(bill.gold_value_total or 0),
        "makingChargeTotal": _round_money(bill.making_charge_total or 0),
        "stoneChargeTotal": _round_money(bill.stone_charge_total or 0),
        "wastageAmountTotal": _round_money(bill.wastage_amount_total or 0),
        "discountTotal": _round_money(bill.discount_total or 0),
        "gstRate": bill.gst_rate,
        "goldRateUsed": bill.gold_rate_used,
        "createdAt": bill.created_at.isoformat() if bill.created_at else None,
        "updatedAt": bill.updated_at.isoformat() if bill.updated_at else None,
        "items": items,
    }


def _serialize_customer(c: models.Customer) -> dict:
    return {
        "id": c.id,
        "customer_id": c.customer_id or c.id,
        "name": c.name,
        "phone": c.phone or c.phone_number or "",
        "phone_number": c.phone_number or c.phone or "",
        "email": c.email,
        "dob": c.dob,
        "address": c.address,
        "city": c.city,
        "customerSince": c.customer_since,
        "visits": c.visits or 0,
        "total_purchase_amount": _round_money(c.total_purchase_amount or 0.0),
        "paid_amount": _round_money(c.paid_amount or 0.0),
        "balance_amount": _round_money(c.balance_amount or 0.0),
        "payment_status": c.payment_status or "Pending",
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _sync_invoice_customer(
    db: Session,
    current_user: models.User,
    bill: schemas.BillCreate,
) -> models.Customer:
    customer = None
    if bill.customerId:
        customer = (
            db.query(models.Customer)
            .filter(
                models.Customer.user_id == current_user.id,
                (models.Customer.id == bill.customerId) | (models.Customer.customer_id == bill.customerId)
            )
            .first()
        )

    if not customer and bill.phoneNumber:
        customer = (
            db.query(models.Customer)
            .filter(
                models.Customer.user_id == current_user.id,
                (models.Customer.phone == bill.phoneNumber) | (models.Customer.phone_number == bill.phoneNumber)
            )
            .first()
        )

    if not customer and bill.customerEmail:
        customer = (
            db.query(models.Customer)
            .filter(models.Customer.user_id == current_user.id, models.Customer.email == bill.customerEmail)
            .first()
        )

    if customer:
        customer.name = bill.customerName or customer.name
        if bill.phoneNumber:
            customer.phone = bill.phoneNumber
            customer.phone_number = bill.phoneNumber
        if bill.customerEmail:
            customer.email = bill.customerEmail
        if bill.customerAddress:
            customer.address = bill.customerAddress
        if not customer.customer_id:
            customer.customer_id = customer.id
        customer.visits = (customer.visits or 0) + 1
        return customer

    cid = str(uuid.uuid4())
    phone_val = bill.phoneNumber or ""
    customer = models.Customer(
        id=cid,
        customer_id=cid,
        user_id=current_user.id,
        name=bill.customerName or "Walk-in Customer",
        phone=phone_val,
        phone_number=phone_val,
        email=bill.customerEmail,
        address=bill.customerAddress,
        city="",
        customer_since=datetime.utcnow().isoformat(),
        visits=1,
        total_purchase_amount=0.0,
        paid_amount=0.0,
        balance_amount=0.0,
        payment_status="Pending",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(customer)
    return customer


# ─── CUSTOMERS ─────────────────────────────────────────────────────────────

@router.get("/api/customers")
@router.get("/customers")
def get_customers_list(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    customers = customer_service.get_customers(db, current_user.id)
    return [_serialize_customer(c) for c in customers]


@router.post("/api/customers")
@router.post("/customers")
def create_customer_endpoint(customer: schemas.CustomerCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_cust = customer_service.create_customer(db, current_user.id, customer)
    return _serialize_customer(db_cust)


@router.get("/api/customers/{id}")
@router.get("/customers/{id}")
def get_customer_endpoint(id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    c = customer_service.get_customer_by_id(db, current_user.id, id)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _serialize_customer(c)


@router.put("/api/customers/{id}")
@router.put("/customers/{id}")
def update_customer_endpoint(id: str, customer: schemas.CustomerUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    c = customer_service.update_customer(db, current_user.id, id, customer)
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _serialize_customer(c)


@router.delete("/api/customers/{id}")
@router.delete("/customers/{id}")
def delete_customer_endpoint(id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    success = customer_service.delete_customer(db, current_user.id, id)
    if not success:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"status": "success"}


# ─── BILLS ─────────────────────────────────────────────────────────────

@router.get("/api/bills", response_model=List[schemas.BillOut])
def get_bills(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    bills = (
        db.query(models.Bill)
        .filter(models.Bill.user_id == current_user.id)
        .order_by(models.Bill.date.desc(), models.Bill.created_at.desc())
        .all()
    )
    return [_serialize_bill(b) for b in bills]


@router.get("/api/bills/{bill_id}", response_model=schemas.BillOut)
def get_bill(bill_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id, models.Bill.user_id == current_user.id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _serialize_bill(bill)

@router.post("/api/bills", response_model=schemas.BillOut)
@router.post("/api/invoices", response_model=schemas.BillOut)
def create_bill(
    bill: schemas.BillCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    logger.info("[BILLING] Received create_bill request payload: %s", bill.model_dump())

    # ── Validate items ─────────────────────────────────────────────────────
    if not bill.items:
        raise HTTPException(status_code=400, detail="At least one invoice item is required")

    # ── Gold Rate (graceful fallback) ──────────────────────────────────────
    # We try to get a stored rate. If unavailable we try auto-fetching.
    # If that also fails, we continue — each item will use its own provided goldRate/rate.
    latest_rate = get_latest_rate(db, current_user.id)
    if not latest_rate:
        logger.warning("[BILLING] No stored gold rate. Attempting auto-fetch…")
        try:
            latest_rate = update_gold_rates_for_user(db, current_user.id)
            logger.info("[BILLING] Auto-fetched gold rate successfully.")
        except Exception as exc:
            logger.warning("[BILLING] Gold rate auto-fetch failed: %s — will use item-provided rates.", exc)
            latest_rate = None  # handled per-item below

    bill_id = str(uuid.uuid4())
    customer = _sync_invoice_customer(db, current_user, bill)

    if not customer and not bill.customerName.strip():
        raise HTTPException(status_code=400, detail="Customer name is required")

    # ── Per-item calculation ───────────────────────────────────────────────
    calculated_items = []
    totals = {
        "gold": 0.0, "making": 0.0, "stone": 0.0, "wastage": 0.0,
        "discount": 0.0, "gst": 0.0, "subtotal": 0.0, "grand": 0.0, "weight": 0.0,
    }

    try:
        for item in bill.items:
            purity = item.purity or bill.purity or "22K"

            # Determine gold rate: system rate → item-provided rate → 0
            if latest_rate:
                gold_rate = _rate_for_purity(purity, latest_rate)
                if gold_rate <= 0:
                    gold_rate = float(item.goldRate or item.rate or 0)
            else:
                gold_rate = float(item.goldRate or item.rate or 0)

            quantity = max(int(item.quantity or 1), 1)
            weight = float(item.weight or 0)
            making_total = float(item.makingCharge or 0) * quantity
            stone_total = float(item.stoneCharge or 0) * quantity
            gold_value = weight * quantity * gold_rate
            wastage_amount = gold_value * float(item.wastagePercent or 0) / 100
            discount = float(item.discount or 0)
            subtotal = max(gold_value + making_total + stone_total + wastage_amount - discount, 0)

            # If subtotal is 0 and a direct price/total was provided, use that
            if subtotal <= 0 and (item.price or item.total):
                subtotal = float(item.price or item.total or 0)

            gst_percent = float(item.gstPercent if item.gstPercent is not None else 3.0)
            gst_amount = subtotal * gst_percent / 100
            line_total = subtotal + gst_amount

            logger.info(
                "[BILLING] Item '%s': qty=%s wt=%.3f rate=%.2f gold=%.2f making=%.2f stone=%.2f sub=%.2f gst=%.2f total=%.2f",
                item.productName, quantity, weight, gold_rate, gold_value,
                making_total, stone_total, subtotal, gst_amount, line_total,
            )

            # Product inventory check
            product_obj = None
            if item.productId:
                product_obj = (
                    db.query(models.Product)
                    .filter(
                        models.Product.id == item.productId,
                        models.Product.user_id == current_user.id,
                    )
                    .first()
                )
                if not product_obj:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Product '{item.productName}' (ID: {item.productId}) not found in inventory",
                    )
                if (product_obj.stock_quantity or 0) < quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Insufficient stock for '{item.productName}'. "
                            f"Available: {product_obj.stock_quantity}, Requested: {quantity}"
                        ),
                    )

            calculated_items.append({
                "source": item,
                "purity": purity,
                "quantity": quantity,
                "weight": weight,
                "gold_rate": _round_money(gold_rate),
                "gold_value": _round_money(gold_value),
                "making_total": _round_money(making_total),
                "stone_total": _round_money(stone_total),
                "wastage_amount": _round_money(wastage_amount),
                "discount": _round_money(discount),
                "gst_percent": gst_percent,
                "gst_amount": _round_money(gst_amount),
                "subtotal": _round_money(subtotal),
                "total": _round_money(line_total),
                "product": product_obj,
            })

            totals["gold"] += gold_value
            totals["making"] += making_total
            totals["stone"] += stone_total
            totals["wastage"] += wastage_amount
            totals["discount"] += discount
            totals["gst"] += gst_amount
            totals["subtotal"] += subtotal
            totals["grand"] += line_total
            totals["weight"] += weight * quantity

        # ── Totals & payment resolution ────────────────────────────────────
        grand_total = _round_money(totals["grand"])
        resolved_status = bill.resolved_status()  # "Paid" / "Partial" / "Pending"
        if bill.paidAmount is not None:
            paid_amount = _round_money(bill.paidAmount)
        elif resolved_status == "Paid":
            paid_amount = grand_total
        else:
            paid_amount = 0.0
        balance_amount = _round_money(max(grand_total - paid_amount, 0))
        payment_status = "Full" if balance_amount <= 0 else ("Partial" if paid_amount > 0 else "Pending")

        # ── Invoice number ─────────────────────────────────────────────────
        invoice_number = bill.resolved_invoice_number() or _generate_invoice_number(db, current_user.id)
        existing_invoice = (
            db.query(models.Bill)
            .filter(models.Bill.invoice_number == invoice_number, models.Bill.user_id == current_user.id)
            .first()
        )
        if existing_invoice:
            raise HTTPException(status_code=400, detail=f"Invoice number {invoice_number} already exists")

        # ── Date resolution ────────────────────────────────────────────────
        bill_date = bill.date or datetime.utcnow().isoformat()
        gold_rate_used = _round_money(latest_rate.rate22k if latest_rate else 0)

        logger.info(
            "[BILLING] Creating invoice %s | customer=%s | total=%.2f | status=%s",
            invoice_number, bill.customerName, grand_total, payment_status,
        )

        # ── Persist bill ───────────────────────────────────────────────────
        db_bill = models.Bill(
            id=bill_id,
            user_id=current_user.id,
            customer_id=customer.id if customer else bill.customerId,
            customer_name=bill.customerName,
            phone_number=bill.phoneNumber,
            customer_email=bill.customerEmail,
            customer_address=bill.customerAddress,
            bill_number=invoice_number,
            invoice_number=invoice_number,
            product_name=bill.items[0].productName if bill.items else "",
            category=bill.category or (bill.items[0].category if bill.items else "General"),
            weight=_round_money(totals["weight"]),
            purity=bill.purity or (bill.items[0].purity if bill.items else "22K"),
            amount=grand_total,
            paid_amount=paid_amount,
            balance_amount=balance_amount,
            payment_status=payment_status,
            due_date=bill.dueDate,
            date=bill_date,
            gst=_round_money(totals["gst"]),
            total_amount=grand_total,
            payment_method=bill.paymentMethod or "Cash",
            status=resolved_status,
            subtotal_amount=_round_money(totals["subtotal"]),
            gold_value_total=_round_money(totals["gold"]),
            making_charge_total=_round_money(totals["making"]),
            stone_charge_total=_round_money(totals["stone"]),
            wastage_amount_total=_round_money(totals["wastage"]),
            discount_total=_round_money(totals["discount"]),
            gst_rate=3.0,
            gold_rate_used=gold_rate_used,
        )
        db.add(db_bill)

        # ── Persist bill items ─────────────────────────────────────────────
        for calculated in calculated_items:
            item = calculated["source"]
            db_item = models.BillItem(
                id=str(uuid.uuid4()),
                bill_id=bill_id,
                product_id=item.productId,
                product_name=item.productName,
                category=item.category,
                purity=calculated["purity"],
                quantity=calculated["quantity"],
                rate=calculated["gold_rate"],
                price=calculated["total"],
                weight=calculated["weight"],
                gold_rate=calculated["gold_rate"],
                gold_value=calculated["gold_value"],
                making_charge=float(item.makingCharge or 0),
                stone_charge=float(item.stoneCharge or 0),
                wastage_percent=float(item.wastagePercent or 0),
                wastage_amount=calculated["wastage_amount"],
                discount=calculated["discount"],
                gst_percent=calculated["gst_percent"],
                gst_amount=calculated["gst_amount"],
                subtotal=calculated["subtotal"],
                total=calculated["total"],
            )
            db.add(db_item)

            # Update inventory if product linked
            if calculated["product"]:
                p = calculated["product"]
                p.stock_quantity = max(int(p.stock_quantity or 0) - calculated["quantity"], 0)
                logger.info("[BILLING] Inventory update: product=%s new_stock=%s", p.id, p.stock_quantity)
                db.add(models.InventoryTransaction(
                    id=str(uuid.uuid4()),
                    user_id=current_user.id,
                    product_id=p.id,
                    bill_id=bill_id,
                    movement_type="sale",
                    quantity=-calculated["quantity"],
                    notes=f"Invoice {invoice_number}",
                ))

        # ── Payment record ────────────────────────────────────────────────
        if paid_amount > 0:
            db.add(models.Payment(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                bill_id=bill_id,
                amount=paid_amount,
                method=bill.paymentMethod or "Cash",
                status="Paid",
            ))

        # ── Customer billing update ───────────────────────────────────────
        if customer:
            customer.total_purchase_amount = _round_money(float(customer.total_purchase_amount or 0.0) + grand_total)
            customer.paid_amount = _round_money(float(customer.paid_amount or 0.0) + paid_amount)
            customer.balance_amount = _round_money(float(customer.balance_amount or 0.0) + balance_amount)
            if customer.balance_amount <= 0:
                customer.payment_status = "Paid"
            elif customer.paid_amount > 0:
                customer.payment_status = "Partial"
            else:
                customer.payment_status = "Pending"
            customer.updated_at = datetime.utcnow()

        # ── Sale record ───────────────────────────────────────────────────
        sid = str(uuid.uuid4())
        db.add(models.Sale(
            id=sid,
            sale_id=sid,
            user_id=current_user.id,
            bill_id=bill_id,
            customer_id=customer.id if customer else bill.customerId,
            invoice_number=invoice_number,
            bill_date=bill_date,
            total_amount=grand_total,
            amount_paid=paid_amount,
            balance_amount=balance_amount,
            payment_method=bill.paymentMethod or "Cash",
            profit_amount=grand_total,
            payment_status=payment_status,
            sale_date=bill_date,
            created_at=datetime.utcnow(),
        ))

        db.commit()

        db.refresh(db_bill)
        logger.info("[BILLING] ✅ Invoice %s created successfully (id=%s)", invoice_number, bill_id)
        return _serialize_bill(db_bill)

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("[BILLING] Failed to create invoice for user %s", current_user.id)
        raise HTTPException(
            status_code=500,
            detail="Database error while creating invoice.",
        )


@router.get("/api/bills/{bill_id}/pdf")
@router.get("/api/invoices/{bill_id}/pdf")
def download_bill_pdf(
    bill_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    logger.info("Generating PDF for invoice: %s", bill_id)
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id, models.Bill.user_id == current_user.id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Invoice not found")
    filepath = generate_invoice_pdf(bill, shop_name=current_user.shop_name or "JewelMind AI")
    filename = f"invoice_{bill.invoice_number or bill.id}.pdf"
    logger.info("Successfully generated PDF: %s", filename)
    return FileResponse(filepath, media_type="application/pdf", filename=filename)


# NOTE: /api/bills GET is already defined above (line 244). Only alias /api/invoices here.
@router.get("/api/invoices", response_model=List[schemas.BillOut])
def get_invoices_alias(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return get_bills(db, current_user)

@router.delete("/api/bills/{bill_id}")
@router.delete("/api/invoices/{bill_id}")
def delete_invoice(bill_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id, models.Bill.user_id == current_user.id).first()
    if not bill:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        db.delete(bill)
        db.commit()
        return {"status": "success", "message": "Invoice deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete invoice")


@router.get("/api/invoices/{bill_id}", response_model=schemas.BillOut)
def get_invoice(bill_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return get_bill(bill_id, db, current_user)


# ─── EXPENSES ─────────────────────────────────────────────────────────────

@router.get("/api/expenses", response_model=List[schemas.ExpenseOut])
def get_expenses(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    expenses = db.query(models.Expense).filter(models.Expense.user_id == current_user.id).all()
    return [{"id": e.id, "expenseType": e.expense_type, "amount": e.amount, "date": e.date, "notes": e.notes} for e in expenses]

@router.post("/api/expenses", response_model=schemas.ExpenseOut)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_exp = models.Expense(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        expense_type=expense.expenseType,
        amount=expense.amount,
        date=expense.date,
        notes=expense.notes
    )
    try:
        db.add(db_exp)
        db.commit()
        db.refresh(db_exp)
    except Exception:
        db.rollback()
        logger.exception("[EXPENSE] Failed to create expense for user %s", current_user.id)
        raise
    return {"id": db_exp.id, "expenseType": db_exp.expense_type, "amount": db_exp.amount, "date": db_exp.date, "notes": db_exp.notes}


@router.delete("/api/expenses/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.user_id == current_user.id,
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    try:
        db.delete(expense)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[EXPENSE] Failed to delete expense %s for user %s", expense_id, current_user.id)
        raise
    return {"status": "success", "id": expense_id}


@router.get("/api/products", response_model=List[schemas.ProductOut])
def get_products(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    products = (
        db.query(models.Product)
        .filter(models.Product.user_id == current_user.id)
        .order_by(models.Product.created_at.desc())
        .all()
    )
    return [_serialize_product(product) for product in products]


@router.post("/api/products", response_model=schemas.ProductOut)
def create_product(product: schemas.ProductCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    product_id = str(uuid.uuid4())
    sku = product.sku or f"SKU-{product_id[:8].upper()}"
    db_product = models.Product(
        id=product_id,
        user_id=current_user.id,
        sku=sku,
        name=product.name,
        category=product.category,
        purity=product.purity,
        weight=product.weight,
        stock_quantity=product.stockQuantity,
        purchase_price=product.purchasePrice,
        selling_price=product.sellingPrice,
        rate_per_gram=product.ratePerGram,
    )
    try:
        db.add(db_product)
        if product.stockQuantity > 0:
            db.add(models.InventoryTransaction(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                product=db_product,
                movement_type="stock_in",
                quantity=product.stockQuantity,
                notes="Initial product stock",
            ))
        db.commit()
        db.refresh(db_product)
    except Exception:
        db.rollback()
        logger.exception("[PRODUCT] Failed to create product for user %s", current_user.id)
        raise
    return _serialize_product(db_product)


@router.put("/api/products/{product_id}", response_model=schemas.ProductOut)
def update_product(
    product_id: str,
    product: schemas.ProductBase,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Update an existing product — stock quantity, price, etc."""
    db_product = db.query(models.Product).filter(
        models.Product.id == product_id,
        models.Product.user_id == current_user.id,
    ).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    previous_stock = int(db_product.stock_quantity or 0)
    if product.name:
        db_product.name = product.name
    if product.category is not None:
        db_product.category = product.category
    if product.purity is not None:
        db_product.purity = product.purity
    if product.weight is not None:
        db_product.weight = product.weight
    if product.stockQuantity is not None:
        db_product.stock_quantity = product.stockQuantity
    if product.purchasePrice is not None:
        db_product.purchase_price = product.purchasePrice
    if product.sellingPrice is not None:
        db_product.selling_price = product.sellingPrice
    if product.ratePerGram is not None:
        db_product.rate_per_gram = product.ratePerGram
    if product.sku is not None:
        db_product.sku = product.sku
    db_product.updated_at = datetime.utcnow()

    stock_delta = int(db_product.stock_quantity or 0) - previous_stock
    try:
        if stock_delta:
            db.add(models.InventoryTransaction(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                product=db_product,
                movement_type="adjustment",
                quantity=stock_delta,
                notes="Manual stock adjustment",
            ))
        db.commit()
        db.refresh(db_product)
    except Exception:
        db.rollback()
        logger.exception("[PRODUCT] Failed to update product %s for user %s", product_id, current_user.id)
        raise
    return _serialize_product(db_product)


@router.delete("/api/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    product = db.query(models.Product).filter(models.Product.id == product_id, models.Product.user_id == current_user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        for transaction in product.inventory_transactions:
            note = f"Product removed: {product.sku or product.id} {product.name}"
            transaction.notes = f"{transaction.notes}; {note}"[:512] if transaction.notes else note[:512]
        db.delete(product)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[PRODUCT] Failed to delete product %s for user %s", product_id, current_user.id)
        raise
    return {"status": "success", "message": "Product deleted"}


@router.get("/api/inventory")
def get_inventory(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    products = get_products(db, current_user)
    total_units = sum(int(product.get("stockQuantity") or 0) for product in products)
    inventory_value = sum(
        float(product.get("sellingPrice") or 0) * int(product.get("stockQuantity") or 0)
        for product in products
    )
    return {
        "items": products,
        "totalItems": len(products),
        "totalUnits": total_units,
        "inventoryValue": _round_money(inventory_value),
        "lowStock": [p for p in products if int(p.get("stockQuantity") or 0) <= 3],
    }

# ─── GOLD RATES ─────────────────────────────────────────────────────────────

@router.get("/api/gold_rates", response_model=List[schemas.GoldRateOut])
def get_gold_rates(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    from datetime import datetime as _dt
    today = _dt.now().strftime("%Y-%m-%d")
    # Auto-populate today's rate if not already present
    has_today = (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == current_user.id, models.GoldRate.date == today)
        .first()
    )
    if not has_today:
        try:
            update_gold_rates_for_user(db, current_user.id)
        except Exception as exc:
            logger.warning("Auto-fetch gold rate failed on GET /api/gold_rates: %s", exc)

    rates = (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == current_user.id)
        .order_by(models.GoldRate.date.desc(), models.GoldRate.last_updated.desc())
        .all()
    )
    return [serialize_rate(db, rate, current_user.id) for rate in rates]



@router.get("/api/gold_rates/today", response_model=schemas.GoldRateOut)
def get_today_gold_rate(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    latest = get_latest_rate(db, current_user.id)
    if not latest:
        try:
            latest = update_gold_rates_for_user(db, current_user.id)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=f"No gold rate available. {exc}")
    return serialize_rate(db, latest, current_user.id)


@router.post("/api/gold_rates/update", response_model=schemas.GoldRateOut)
def update_gold_rate_from_api(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    try:
        latest = update_gold_rates_for_user(db, current_user.id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return serialize_rate(db, latest, current_user.id)

@router.post("/api/gold_rates", response_model=schemas.GoldRateOut)
def create_gold_rate(rate: schemas.GoldRateCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    existing = (
        db.query(models.GoldRate)
        .filter(models.GoldRate.user_id == current_user.id, models.GoldRate.date == rate.date)
        .first()
    )
    if existing:
        existing.rate22k = rate.rate22k
        existing.rate24k = rate.rate24k
        existing.rate_silver = rate.rateSilver
        existing.last_updated = datetime.utcnow()
        existing.source = "manual"
        existing.status = "manual"
        existing.warning = None
        db_rate = existing
    else:
        db_rate = models.GoldRate(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            rate22k=rate.rate22k,
            rate24k=rate.rate24k,
            rate_silver=rate.rateSilver,
            date=rate.date,
            last_updated=datetime.utcnow(),
            source="manual",
            status="manual",
        )
        db.add(db_rate)
    db.commit()
    db.refresh(db_rate)
    return serialize_rate(db, db_rate, current_user.id)


def _compute_dashboard_data(db: Session, user_id: str) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    month_str = today[:7]
    bills = db.query(models.Bill).filter(models.Bill.user_id == user_id).all()
    sales = db.query(models.Sale).filter(models.Sale.user_id == user_id).all()
    expenses = db.query(models.Expense).filter(models.Expense.user_id == user_id).all()
    customers_list = db.query(models.Customer).filter(models.Customer.user_id == user_id).all()
    products = db.query(models.Product).filter(models.Product.user_id == user_id).all()

    def get_date(b):
        return getattr(b, 'sale_date', None) or getattr(b, 'bill_date', None) or getattr(b, 'date', '') or ''
    def get_amt(b):
        return float(getattr(b, 'total_amount', None) or getattr(b, 'amount', None) or 0.0)
    
    records = sales if sales else bills
    total_revenue = sum(get_amt(r) for r in records)
    today_sales = sum(get_amt(r) for r in records if get_date(r).startswith(today))
    monthly_revenue = sum(get_amt(r) for r in records if get_date(r).startswith(month_str))
    total_expenses = sum(float(e.amount or 0) for e in expenses)
    profit = total_revenue - total_expenses

    pending_payments = sum(float(b.balance_amount or 0) for b in bills)
    if pending_payments == 0:
        pending_payments = sum(float(c.balance_amount or 0) for c in customers_list)

    now = datetime.utcnow()
    chart_data = []
    months_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for i in range(6, -1, -1):
        y = now.year
        m = now.month - i
        while m <= 0:
            m += 12
            y -= 1
        m_prefix = f"{y:04d}-{m:02d}"
        m_rev = sum(get_amt(r) for r in records if get_date(r).startswith(m_prefix))
        m_exp = sum(float(e.amount or 0) for e in expenses if (e.date or "").startswith(m_prefix))
        chart_data.append({
            "month": months_names[m - 1],
            "revenue": _round_money(m_rev),
            "profit": _round_money(m_rev - m_exp)
        })

    return {
        "todaySales": _round_money(today_sales),
        "monthlyRevenue": _round_money(monthly_revenue),
        "totalRevenue": _round_money(total_revenue),
        "totalExpenses": _round_money(total_expenses),
        "profit": _round_money(profit),
        "pendingPayments": _round_money(pending_payments),
        "orders": len(bills),
        "customers": len(customers_list),
        "inventory": sum(int(p.stock_quantity or 0) for p in products),
        "inventoryValue": _round_money(sum(float(p.selling_price or 0) * int(p.stock_quantity or 0) for p in products)),
        "chartData": chart_data
    }


@router.get("/api/dashboard", response_model=schemas.DashboardMetricsOut)
@router.get("/dashboard", response_model=schemas.DashboardMetricsOut)
def get_dashboard_metrics(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    latest_gold = serialize_rate(db, get_latest_rate(db, current_user.id), current_user.id)
    return {
        "todaySales": data["todaySales"],
        "monthlyRevenue": data["monthlyRevenue"],
        "totalRevenue": data["totalRevenue"],
        "totalExpenses": data["totalExpenses"],
        "profit": data["profit"],
        "pendingPayments": data["pendingPayments"],
        "orders": data["orders"],
        "customers": data["customers"],
        "inventory": data["inventory"],
        "inventoryValue": data["inventoryValue"],
        "latestGold": latest_gold,
        "warning": latest_gold.get("warning") if latest_gold else None,
    }


@router.get("/api/dashboard/revenue")
@router.get("/dashboard/revenue")
def get_dashboard_revenue(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"revenue": data["totalRevenue"]}


@router.get("/api/dashboard/profit")
@router.get("/dashboard/profit")
def get_dashboard_profit(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"profit": data["profit"]}


@router.get("/api/dashboard/daily-sales")
@router.get("/dashboard/daily-sales")
def get_dashboard_daily_sales(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"todaySales": data["todaySales"], "dailySales": data["todaySales"]}


@router.get("/api/dashboard/monthly-sales")
@router.get("/dashboard/monthly-sales")
def get_dashboard_monthly_sales(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"monthlySales": data["monthlyRevenue"], "chartData": data["chartData"]}


@router.get("/api/dashboard/customer-count")
@router.get("/dashboard/customer-count")
def get_dashboard_customer_count(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"customerCount": data["customers"]}


@router.get("/api/dashboard/pending-payments")
@router.get("/dashboard/pending-payments")
def get_dashboard_pending_payments(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    data = _compute_dashboard_data(db, current_user.id)
    return {"pendingPayments": data["pendingPayments"]}



@router.post("/api/voice-query")
def voice_query(req: schemas.VoiceQueryRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    result = answer_business_query(db, current_user.id, req.message)
    if not result:
        result = {
            "agent_response": "Ask me about sales, inventory, customers, revenue, gold rate, profit, pending payments, or purchase history.",
            "executed_tool": None,
        }

    conversation_service.save_conversation(
        db=db,
        user_id=current_user.id,
        user_message=req.message,
        agent_response=result["agent_response"],
        executed_tool=result.get("executed_tool"),
    )

    return {
        "user_message": req.message,
        "agent_response": result["agent_response"],
        "executed_tool": result.get("executed_tool"),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── RESET (Fresh Start) ──────────────────────────────────────────────────────

@router.delete("/api/reset")
def reset_user_data(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Delete all bills, bill items, customers, expenses, and gold rates for the current user.
    Useful for new users who want a clean workspace."""
    # Delete bill items first (FK constraint)
    bill_ids = [b.id for b in db.query(models.Bill.id).filter(models.Bill.user_id == current_user.id).all()]
    if bill_ids:
        db.query(models.BillItem).filter(models.BillItem.bill_id.in_(bill_ids)).delete(synchronize_session=False)
        db.query(models.Payment).filter(models.Payment.bill_id.in_(bill_ids)).delete(synchronize_session=False)
        db.query(models.Sale).filter(models.Sale.bill_id.in_(bill_ids)).delete(synchronize_session=False)
        db.query(models.InventoryTransaction).filter(models.InventoryTransaction.bill_id.in_(bill_ids)).delete(synchronize_session=False)
    db.query(models.Payment).filter(models.Payment.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.Sale).filter(models.Sale.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.InventoryTransaction).filter(models.InventoryTransaction.user_id == current_user.id).delete(synchronize_session=False)
    
    db.query(models.Bill).filter(models.Bill.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.Product).filter(models.Product.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.Customer).filter(models.Customer.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.Expense).filter(models.Expense.user_id == current_user.id).delete(synchronize_session=False)
    db.query(models.GoldRate).filter(models.GoldRate.user_id == current_user.id).delete(synchronize_session=False)
    db.commit()
    
    return {"message": "All data cleared successfully. Your workspace is now fresh!", "status": "success"}
