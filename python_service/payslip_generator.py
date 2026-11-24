"""Generate a print-ready PDF payslip in memory using ReportLab."""
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

SYMBOLS = {"USD": "$", "CAD": "CA$", "AUD": "A$", "GBP": "£", "EUR": "€", "INR": "₹", "NZD": "NZ$", "SGD": "S$", "AED": "AED "}

def format_amount(value, currency):
    return f"{SYMBOLS.get(currency, currency + ' ')}{float(value):,.2f}"

def generate_pdf(company, payroll):
    employee = payroll.get("Employee") or {}
    department = employee.get("Department") or {}
    earnings = payroll.get("earnings") or {}
    deductions = payroll.get("deductions") or {}
    currency = company.get("currency", "USD")
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=0.65*inch, leftMargin=0.65*inch, topMargin=0.65*inch)
    styles = getSampleStyleSheet()
    story = [Paragraph(company.get("name", "Company"), styles["Title"]), Paragraph(company.get("address", ""), styles["Normal"]), Spacer(1, 18)]
    story.append(Paragraph("PAYSLIP", styles["Heading1"]))
    story.append(Paragraph(f"{int(payroll.get('month', 1)):02d}/{payroll.get('year', '')} &nbsp;&nbsp; | &nbsp;&nbsp; Status: {payroll.get('status', 'Pending')}", styles["Normal"]))
    story.append(Spacer(1, 12))
    info = [["Employee", employee.get("fullName", "—"), "Employee ID", employee.get("employeeId", "—")], ["Department", department.get("departmentName", "—"), "Designation", employee.get("designation", "—")]]
    story.append(Table(info, colWidths=[1.0*inch, 2.5*inch, 1.0*inch, 2.1*inch], style=TableStyle([("BACKGROUND",(0,0),(0,-1),colors.HexColor("#edf2f7")),("BACKGROUND",(2,0),(2,-1),colors.HexColor("#edf2f7")),("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#d9e2ec")),("PADDING",(0,0),(-1,-1),8)])))
    story.append(Spacer(1, 18))
    rows = [["Earnings", "Amount"], *[[key.replace("_", " ").title(), format_amount(value, currency)] for key, value in earnings.items()], ["Gross salary", format_amount(payroll.get("grossSalary", 0), currency)], ["", ""], ["Deductions", "Amount"], *[[key.replace("_", " ").title(), format_amount(value, currency)] for key, value in deductions.items()], ["Total deductions", format_amount(payroll.get("totalDeductions", 0), currency)], ["Net salary", format_amount(payroll.get("netSalary", 0), currency)]]
    table = Table(rows, colWidths=[5.3*inch, 1.3*inch], repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#17324d")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("GRID",(0,0),(-1,-1),0.35,colors.HexColor("#d9e2ec")),("ALIGN",(1,0),(1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),8),("BACKGROUND",(0,-1),(-1,-1),colors.HexColor("#e5f6ef")),("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold")]))
    story.extend([table, Spacer(1, 22), Paragraph("This is a computer-generated payslip.", styles["Italic"])])
    doc.build(story)
    return buffer.getvalue()
