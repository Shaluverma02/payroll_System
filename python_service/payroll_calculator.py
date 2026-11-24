"""Reusable payroll calculations for one monthly employee payroll."""
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")

def money(value):
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)

def calculate_payroll(salary, attendance=None):
    """Compute earnings/deductions. Unpaid leave uses 1/26 of fixed monthly pay per day."""
    attendance = attendance or {}
    basic = money(salary.get("basicSalary", salary.get("basic_salary", 0)))
    hra = money(salary.get("hra", 0))
    allowances = money(salary.get("allowances", 0))
    bonus = money(salary.get("bonus", 0))
    overtime_hours = Decimal(str(attendance.get("overtimeHours", attendance.get("overtime_hours", 0)) or 0))
    overtime_rate = money(salary.get("overtimeRate", salary.get("overtime_rate", 0)))
    overtime = money(overtime_hours * overtime_rate)
    fixed_monthly = basic + hra + allowances
    unpaid_days = Decimal(str(attendance.get("unpaidLeaveDays", attendance.get("unpaid_leave_days", 0)) or 0))
    unpaid_deduction = money((fixed_monthly / Decimal(26)) * unpaid_days)
    earnings = {"basic": basic, "hra": hra, "allowances": allowances, "bonus": bonus, "overtime": overtime}
    deductions = {
        "provident_fund": money(salary.get("providentFund", salary.get("provident_fund", 0))),
        "professional_tax": money(salary.get("professionalTax", salary.get("professional_tax", 0))),
        "income_tax": money(salary.get("incomeTax", salary.get("income_tax", 0))),
        "other": money(salary.get("otherDeductions", salary.get("other_deductions", 0))),
        "unpaid_leave": unpaid_deduction,
    }
    gross = money(sum(earnings.values()))
    total_deductions = money(sum(deductions.values()))
    return {
        "earnings": {k: float(v) for k, v in earnings.items()},
        "deductions": {k: float(v) for k, v in deductions.items()},
        "gross_salary": float(gross),
        "total_deductions": float(total_deductions),
        "net_salary": float(money(gross - total_deductions)),
        "overtime_amount": float(overtime),
        "unpaid_leave_deduction": float(unpaid_deduction),
    }
