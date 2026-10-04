import json
import logging
import os
from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from .gold_rate_service import get_latest_rate, serialize_rate

logger = logging.getLogger(__name__)

BUSINESS_KEYWORDS = {
    "inventory",
    "stock",
    "customer",
    "customers",
    "revenue",
    "orders",
    "order",
    "gold",
    "rate",
    "profit",
    "pending",
    "payment",
    "payments",
    "sales",
    "sale",
    "sold",
    "analytics",
    "purchase",
    "history",
    "dashboard",
}


def is_business_query(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in BUSINESS_KEYWORDS)


def _money(value: float) -> str:
    return f"Rs. {value:,.0f}"


def build_business_context(db: Session, user_id: str, message: str) -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    month = today[:7]

    bills = db.query(models.Bill).filter(models.Bill.user_id == user_id).all()
    expenses = db.query(models.Expense).filter(models.Expense.user_id == user_id).all()
    products = db.query(models.Product).filter(models.Product.user_id == user_id).all()
    customers = db.query(models.Customer).filter(models.Customer.user_id == user_id).all()
    latest_rate = serialize_rate(db, get_latest_rate(db, user_id), user_id)

    def bill_value(bill: models.Bill) -> float:
        return float(bill.total_amount or bill.amount or 0)

    today_sales = sum(bill_value(b) for b in bills if (b.date or "").startswith(today))
    monthly_revenue = sum(bill_value(b) for b in bills if (b.date or "").startswith(month))
    total_revenue = sum(bill_value(b) for b in bills)
    total_expenses = sum(float(e.amount or 0) for e in expenses)
    pending_payments = sum(float(b.balance_amount or 0) for b in bills)
    inventory_value = sum(float(p.selling_price or 0) * int(p.stock_quantity or 0) for p in products)

    product_revenue: dict[str, float] = {}
    for bill in bills:
        for item in bill.items:
            name = item.product_name or "Unknown product"
            product_revenue[name] = product_revenue.get(name, 0.0) + float(item.total or item.price or 0)

    top_product = None
    if product_revenue:
        name, value = max(product_revenue.items(), key=lambda row: row[1])
        top_product = {"name": name, "revenue": round(value, 2)}

    low_stock = [
        {"name": p.name, "stock": p.stock_quantity or 0, "sku": p.sku}
        for p in products
        if (p.stock_quantity or 0) <= 3
    ][:10]

    purchase_history = []
    lower = message.lower()
    if "history" in lower or "purchase" in lower or "customer" in lower:
        matched_customers = [
            c for c in customers
            if c.name and c.name.lower() in lower
        ]
        if matched_customers:
            ids = {c.id for c in matched_customers}
            purchase_history = [
                {
                    "customer": b.customer_name,
                    "invoice": b.invoice_number,
                    "date": b.date,
                    "total": bill_value(b),
                    "status": b.payment_status or b.status,
                }
                for b in bills
                if b.customer_id in ids
            ][:20]

    return {
        "date": today,
        "today_sales": round(today_sales, 2),
        "monthly_revenue": round(monthly_revenue, 2),
        "total_revenue": round(total_revenue, 2),
        "total_expenses": round(total_expenses, 2),
        "profit": round(total_revenue - total_expenses, 2),
        "pending_payments": round(pending_payments, 2),
        "orders": len(bills),
        "customers": len(customers),
        "inventory_items": len(products),
        "inventory_units": sum(int(p.stock_quantity or 0) for p in products),
        "inventory_value": round(inventory_value, 2),
        "latest_gold_rate": latest_rate,
        "top_product": top_product,
        "low_stock": low_stock,
        "purchase_history": purchase_history,
    }


def _fallback_answer(context: dict, message: str) -> str:
    lower = message.lower()
    latest_gold = context.get("latest_gold_rate") or {}

    if "gold" in lower or "rate" in lower:
        if latest_gold:
            warning = f" {latest_gold['warning']}" if latest_gold.get("warning") else ""
            return (
                f"Today's stored gold rate is Rs. {latest_gold['rate22k']:,.2f}/g for 22K "
                f"and Rs. {latest_gold['rate24k']:,.2f}/g for 24K.{warning}"
            )
        return "No gold rate has been stored yet. Please update it in your settings."

    if "today" in lower and ("sale" in lower or "sales" in lower or "invoice" in lower):
        count = context.get("today_invoice_count", context.get("orders", 0))
        amt = context.get("today_sales", 0)
        return (
            f"Today's sales are {_money(amt)} from {count} invoice{'s' if count != 1 else ''}."
            if amt > 0
            else "No sales have been recorded for today yet."
        )

    if "month" in lower and ("revenue" in lower or "sale" in lower or "sales" in lower):
        return f"This month's revenue is {_money(context.get('monthly_revenue', 0))}."

    if "pending" in lower or "payment" in lower or "balance" in lower or "owes" in lower or "owe" in lower:
        bills = context.get("pending_bills", [])
        if not bills:
            return f"Pending payments total {_money(context.get('pending_payments', 0))}."
        names = ", ".join(b["customer"] for b in bills[:3])
        total = _money(context.get("pending_total", context.get("pending_payments", 0)))
        more = f" and {len(bills) - 3} more" if len(bills) > 3 else ""
        return f"Pending payments total {total}. Customers with outstanding balances: {names}{more}."

    if "top" in lower or "best" in lower or "most" in lower or "selling" in lower or "sold" in lower:
        tops = context.get("top_products", [])
        if tops:
            names = ", ".join(t["name"] for t in tops[:3])
            return f"Your top-selling products are {names}."
        top = context.get("top_product")
        if top:
            return f"{top['name']} generated the highest revenue at {_money(top['revenue'])}."
        return "No product sales have been recorded yet."

    if "category" in lower or "categories" in lower:
        cats = context.get("top_categories", [])
        if cats:
            names = ", ".join(c["category"] for c in cats[:3])
            return f"Your best-performing categories are {names}."
        return "No category sales data is available yet."

    if "stock" in lower or "inventory" in lower or "low" in lower:
        low = context.get("low_stock", [])
        if low:
            names = ", ".join(item["name"] for item in low[:3])
            more = f" and {len(low) - 3} more" if len(low) > 3 else ""
            return f"The following products are running low on stock: {names}{more}."
        return (
            f"All products are adequately stocked. You have {context.get('inventory_items', 0)} "
            f"items totalling {context.get('inventory_units', 0)} units."
        )

    if "customer" in lower:
        return f"You have {context.get('customers_total', context.get('customers', 0))} customers registered in the system."

    if "profit" in lower:
        return (
            f"Your estimated profit is {_money(context.get('profit', 0))}, "
            f"based on total revenue of {_money(context.get('total_revenue', 0))} minus expenses of {_money(context.get('total_expenses', 0))}."
        )

    if "expense" in lower or "expenses" in lower:
        return f"Total recorded expenses are {_money(context.get('total_expenses', 0))}."

    if "order" in lower or "invoice" in lower:
        return f"You have {context.get('orders_total', context.get('orders', 0))} recorded orders in total."

    if "growth" in lower or "compare" in lower or "last month" in lower:
        g = context.get("month_on_month_growth_pct")
        if g is not None:
            direction = "up" if g >= 0 else "down"
            return f"Revenue is {direction} by {abs(g):.1f}% compared to last month."
        return f"This month's revenue is {_money(context.get('monthly_revenue', 0))}."

    # Generic dashboard summary
    return (
        f"Here's a quick overview: Today's sales are {_money(context.get('today_sales', 0))}. "
        f"This month's revenue is {_money(context.get('monthly_revenue', 0))}. "
        f"Pending payments total {_money(context.get('pending_total', context.get('pending_payments', 0)))}. "
        f"Profit so far is {_money(context.get('profit', 0))}."
    )


def _openai_narration(context: dict, message: str) -> Optional[str]:
    """
    Use OpenAI to generate a natural spoken answer from the live MySQL context.
    Returns None on unknown error so the caller can use _fallback_answer instead.
    """
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)

        SYSTEM_PROMPT = (
            "You are JewelMind AI, an intelligent voice-first business assistant for jewelry store owners.\n"
            "\n"
            "## Core Behaviour\n"
            "- Communicate only in a natural, conversational manner.\n"
            "- Behave like a professional female business consultant.\n"
            "- Responses should feel like a real conversation between two people.\n"
            "- Keep responses short, clear, and suitable for speaking aloud — maximum 3-4 sentences.\n"
            "- Never sound robotic. Never use bullet points, markdown, or technical terms.\n"
            "\n"
            "## Voice Personality\n"
            "- Speak with a warm, professional, polite female personality.\n"
            "- Be confident, friendly, and business-oriented.\n"
            "- Use simple language that jewelry store owners can easily understand.\n"
            "- Use Indian currency formatting (₹, lakhs, crores).\n"
            "\n"
            "## Two-Way Conversation\n"
            "- This is a voice conversation, not a text chat.\n"
            "- Do NOT repeat the question back. Just answer it directly.\n"
            "- Remember the context of the current conversation.\n"
            "- Encourage users to continue speaking when appropriate.\n"
            "\n"
            "## CRITICAL DATA RULES\n"
            "1. Answer ONLY the specific question the user asked.\n"
            "2. Use ONLY the numbers in the 'Live Business Data' section below. Never invent figures.\n"
            "3. If a number is 0 or data is missing for the specific question, say so naturally.\n"
            "4. If the answer involves a list (e.g. customers with pending payments), read at most 3 names naturally.\n"
            "\n"
            "## Website Sections You Understand\n"
            "You can answer questions about: Dashboard, Customers, Billing, Sales Analytics, "
            "Inventory, Demand Prediction, Gold Rates, WhatsApp Automation, Settings, Reports, Business Insights.\n"
            "\n"
            "## If Data Is Unavailable\n"
            "NEVER say: API failed, database error, unable to access, rate limit, internal server error.\n"
            "Instead say: 'I'm reconnecting to your business information right now. Please give me a moment.' "
            "or 'I don't currently have access to the latest records, but I can still answer general questions about your business.'\n"
            "\n"
            "## Example Responses\n"
            "User: 'How are today's sales?' → 'Today's sales are ₹1.25 lakh. That's about twelve percent higher than yesterday.'\n"
            "User: 'Who has pending payments?' → 'Three customers have pending payments. Would you like me to read their names and balances?'\n"
            "User: 'Tell me about this website.' → 'JewelMind helps you manage customers, sales, inventory, billing, and business analytics from one dashboard. It also provides AI-powered predictions and recommendations.'\n"
            "\n"
            f"User's question: {message}\n"
            f"\nLive Business Data (from MySQL):\n{json.dumps(context, default=str, indent=2)}"
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message}
            ],
            max_tokens=250,
            temperature=0.7
        )
        answer = response.choices[0].message.content
        if answer:
            answer = answer.strip()
        if not answer or len(answer) < 10:
            return None
        return answer

    except Exception as exc:
        logger.warning("OpenAI narration failed: %s", exc)
        return None


def answer_business_query(db: Session, user_id: str, message: str) -> Optional[dict]:
    """
    Main entry point: build rich MySQL context → narrate with OpenAI → fallback to pure-Python.
    Always returns a specific, question-aware answer.
    """
    context = build_business_context(db, user_id, message)
    answer = _openai_narration(context, message) or _fallback_answer(context, message)
    return {
        "agent_response": answer,
        "executed_tool": "mysql_business_query",
        "context": context,
    }
