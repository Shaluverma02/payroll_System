"""Payroll report helpers; report rows are plain dictionaries from the API layer."""
import csv
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

def payroll_csv(rows):
    output = io.StringIO()
    fields = ["employee_id", "employee", "department", "month", "year", "gross_salary", "total_deductions", "net_salary", "status"]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    safe_rows = []
    for row in rows:
        safe_rows.append({key: ("'" + value if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")) else value) for key, value in row.items()})
    writer.writerows(safe_rows)
    return output.getvalue()

def summarize(rows):
    return {
        "records": len(rows),
        "gross_total": round(sum(float(row.get("gross_salary", 0) or 0) for row in rows), 2),
        "net_total": round(sum(float(row.get("net_salary", 0) or 0) for row in rows), 2),
        "pending_count": sum(row.get("status") == "Pending" for row in rows),
        "paid_count": sum(row.get("status") == "Paid" for row in rows),
    }

def payroll_pdf(company, rows):
    """Build a landscape PDF containing payroll rows and the payroll total."""
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=landscape(letter), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    table_rows = [["Employee ID", "Employee", "Department", "Period", "Gross", "Deductions", "Net pay", "Status"]]
    for row in rows:
        currency = company.get("currency", "USD")
        symbol = {"USD": "$", "CAD": "CA$", "AUD": "A$", "GBP": "£", "EUR": "€", "INR": "₹", "NZD": "NZ$", "SGD": "S$", "AED": "AED "}.get(currency, currency + " ")
        table_rows.append([row.get("employee_id", ""), row.get("employee", ""), row.get("department", ""), f"{row.get('month', '')}/{row.get('year', '')}", f"{symbol}{float(row.get('gross_salary', 0) or 0):,.2f}", f"{symbol}{float(row.get('total_deductions', 0) or 0):,.2f}", f"{symbol}{float(row.get('net_salary', 0) or 0):,.2f}", row.get("status", "")])
    table = Table(table_rows, repeatRows=1, colWidths=[75, 115, 100, 55, 76, 76, 76, 60])
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#17324d")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#d9e2ec")), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f4f7f9")]), ("FONTSIZE", (0,0), (-1,-1), 8), ("PADDING", (0,0), (-1,-1), 7)]))
    document.build([Paragraph(company.get("name", "Company"), styles["Title"]), Paragraph("Payroll report", styles["Heading2"]), Spacer(1, 14), table])
    return buffer.getvalue()
