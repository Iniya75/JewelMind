import os
import logging
import tempfile
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _value(source, attr: str, default=None):
    if isinstance(source, dict):
        return source.get(attr, default)
    return getattr(source, attr, default)


def _money(value) -> str:
    return f"Rs. {float(value or 0):,.2f}"


def _invoice_items(bill):
    items = _value(bill, "items", []) or []
    return list(items)


logger = logging.getLogger(__name__)


def generate_invoice_pdf(bill, shop_name="JewelMind AI"):
    """Generate a professional A4 invoice PDF and return the local file path."""
    # Try to create invoices dir next to this file; fallback to tempdir
    try:
        invoices_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "invoices")
        os.makedirs(invoices_dir, exist_ok=True)
    except Exception as dir_err:
        logger.warning("[PDF] Could not create invoices dir: %s — using tempdir", dir_err)
        invoices_dir = tempfile.mkdtemp()

    invoice_number = _value(bill, "invoice_number") or _value(bill, "invoiceNumber") or f"INV-{int(datetime.utcnow().timestamp())}"
    filename = f"invoice_{invoice_number}.pdf"
    filepath = os.path.join(invoices_dir, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=28,
        leftMargin=28,
        topMargin=28,
        bottomMargin=28,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#071B3B"),
    )
    small_style = ParagraphStyle(
        "Small",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#4A5568"),
    )
    label_style = ParagraphStyle(
        "Label",
        parent=small_style,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#D4A017"),
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#1F2937"),
    )
    bold_style = ParagraphStyle("Bold", parent=body_style, fontName="Helvetica-Bold")
    header_style = ParagraphStyle(
        "TableHeader",
        parent=body_style,
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9,
        textColor=colors.white,
    )

    story = []

    logo = Table(
        [[Paragraph("JM", ParagraphStyle("Logo", parent=bold_style, alignment=1, fontSize=14, textColor=colors.HexColor("#071B3B")))]],
        colWidths=[38],
        rowHeights=[38],
    )
    logo.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#D4A017")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#B78B13")),
    ]))

    gst_number = os.getenv("STORE_GST_NUMBER", "GSTIN -")
    header = Table(
        [[
            logo,
            [
                Paragraph(shop_name or "JewelMind AI", title_style),
                Paragraph("JewelMind AI", label_style),
                Paragraph(gst_number, small_style),
            ],
            [
                Paragraph("TAX INVOICE", ParagraphStyle("Tax", parent=title_style, alignment=2, fontSize=15)),
                Paragraph(f"Invoice No: <b>{invoice_number}</b>", ParagraphStyle("Right", parent=body_style, alignment=2)),
                Paragraph(f"Date: {_value(bill, 'date', '')}", ParagraphStyle("Right2", parent=body_style, alignment=2)),
            ],
        ]],
        colWidths=[46, 275, doc.width - 321],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header)
    story.append(Spacer(1, 14))

    divider = Table([[""]], colWidths=[doc.width], rowHeights=[2])
    divider.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#D4A017"))]))
    story.append(divider)
    story.append(Spacer(1, 14))

    customer = Table(
        [
            [Paragraph("CUSTOMER DETAILS", label_style), Paragraph("PAYMENT DETAILS", label_style)],
            [
                Paragraph(f"<b>Name:</b> {_value(bill, 'customer_name', _value(bill, 'customerName', 'Walk-in Customer'))}", body_style),
                Paragraph(f"<b>Method:</b> {_value(bill, 'payment_method', _value(bill, 'paymentMethod', '-'))}", body_style),
            ],
            [
                Paragraph(f"<b>Mobile:</b> {_value(bill, 'phone_number', _value(bill, 'phoneNumber', '-')) or '-'}", body_style),
                Paragraph(f"<b>Status:</b> {_value(bill, 'payment_status', _value(bill, 'status', '-')) or '-'}", body_style),
            ],
            [
                Paragraph(f"<b>Email:</b> {_value(bill, 'customer_email', _value(bill, 'customerEmail', '-')) or '-'}", body_style),
                Paragraph(f"<b>Gold Rate Used:</b> {_money(_value(bill, 'gold_rate_used', _value(bill, 'goldRateUsed', 0)))}/g", body_style),
            ],
            [
                Paragraph(f"<b>Address:</b> {_value(bill, 'customer_address', _value(bill, 'customerAddress', '-')) or '-'}", body_style),
                Paragraph(f"<b>Generated:</b> {datetime.utcnow().strftime('%d %b %Y %I:%M %p')} UTC", body_style),
            ],
        ],
        colWidths=[doc.width * 0.56, doc.width * 0.44],
    )
    customer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(customer)
    story.append(Spacer(1, 16))

    table_data = [[
        Paragraph("#", header_style),
        Paragraph("Product", header_style),
        Paragraph("Purity", header_style),
        Paragraph("Qty", header_style),
        Paragraph("Wt(g)", header_style),
        Paragraph("Rate/g", header_style),
        Paragraph("Gold", header_style),
        Paragraph("Making", header_style),
        Paragraph("Stone", header_style),
        Paragraph("GST", header_style),
        Paragraph("Total", header_style),
    ]]

    for index, item in enumerate(_invoice_items(bill), 1):
        product_name = _value(item, "product_name", _value(item, "productName", ""))
        table_data.append([
            Paragraph(str(index), body_style),
            Paragraph(str(product_name), body_style),
            Paragraph(str(_value(item, "purity", "-") or "-"), body_style),
            Paragraph(str(_value(item, "quantity", 1)), body_style),
            Paragraph(f"{float(_value(item, 'weight', 0) or 0):.2f}", body_style),
            Paragraph(_money(_value(item, "gold_rate", _value(item, "goldRate", _value(item, "rate", 0)))), body_style),
            Paragraph(_money(_value(item, "gold_value", _value(item, "goldValue", 0))), body_style),
            Paragraph(_money(_value(item, "making_charge", _value(item, "makingCharge", 0))), body_style),
            Paragraph(_money(_value(item, "stone_charge", _value(item, "stoneCharge", 0))), body_style),
            Paragraph(_money(_value(item, "gst_amount", _value(item, "gstAmount", 0))), body_style),
            Paragraph(_money(_value(item, "total", _value(item, "price", 0))), body_style),
        ])

    items_table = Table(
        table_data,
        colWidths=[20, 104, 36, 24, 38, 52, 56, 54, 48, 46, 58],
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#071B3B")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E7E2D6")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 14))

    summary_rows = [
        ["Gold Value", _money(_value(bill, "gold_value_total", _value(bill, "goldValueTotal", 0)))],
        ["Making Charges", _money(_value(bill, "making_charge_total", _value(bill, "makingChargeTotal", 0)))],
        ["Stone Charges", _money(_value(bill, "stone_charge_total", _value(bill, "stoneChargeTotal", 0)))],
        ["Wastage", _money(_value(bill, "wastage_amount_total", _value(bill, "wastageAmountTotal", 0)))],
        ["Discount", _money(_value(bill, "discount_total", _value(bill, "discountTotal", 0)))],
        ["Subtotal", _money(_value(bill, "subtotal_amount", _value(bill, "subtotalAmount", 0)))],
        ["GST", _money(_value(bill, "gst", 0))],
        ["Grand Total", _money(_value(bill, "total_amount", _value(bill, "totalAmount", 0)))],
    ]
    summary = Table(
        [[Paragraph(label, bold_style), Paragraph(value, ParagraphStyle(f"R{idx}", parent=body_style, alignment=2))]
         for idx, (label, value) in enumerate(summary_rows)],
        colWidths=[115, 100],
    )
    summary.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#E7E2D6")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, colors.HexColor("#071B3B")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF8E1")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    aligned_summary = Table([["", summary]], colWidths=[doc.width - 215, 215])
    aligned_summary.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(aligned_summary)
    story.append(Spacer(1, 22))

    footer = ParagraphStyle(
        "Footer",
        parent=small_style,
        alignment=1,
        fontName="Helvetica-Oblique",
        textColor=colors.HexColor("#555555"),
    )
    story.append(Paragraph(f"Thank you for choosing {shop_name or 'JewelMind AI'}.", footer))

    try:
        doc.build(story)
        logger.info("[PDF] Generated invoice PDF: %s", filepath)
    except Exception as build_err:
        logger.error("[PDF] Failed to build PDF for invoice %s: %s", invoice_number, build_err)
        raise
    return filepath
