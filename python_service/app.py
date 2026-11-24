"""Small JSON-over-stdin service invoked by the Node API."""
import base64
import json
import sys
import traceback
from payroll_calculator import calculate_payroll
from report_generator import payroll_csv, payroll_pdf, summarize
from payslip_generator import generate_pdf

def main():
    try:
        request = json.load(sys.stdin)
        action = request.get("action")
        if action == "calculate":
            result = calculate_payroll(request.get("salary", {}), request.get("attendance", {}))
        elif action == "report":
            rows = request.get("rows", [])
            result = {"summary": summarize(rows), "csv": payroll_csv(rows)}
        elif action == "report_pdf":
            pdf = payroll_pdf(request.get("company", {}), request.get("rows", []))
            result = {"pdf_base64": base64.b64encode(pdf).decode("ascii")}
        elif action == "payslip":
            pdf = generate_pdf(request.get("company", {}), request.get("payroll", {}))
            result = {"pdf_base64": base64.b64encode(pdf).decode("ascii")}
        else:
            raise ValueError("Unknown Python service action.")
        print(json.dumps(result))
    except Exception as exc:  # Return a structured error; diagnostics go to stderr only.
        print(json.dumps({"error": str(exc)}))
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
