function round2(val) { 
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100; 
}

function calculatePayroll(salary = {}, attendance = {}) {
  const basic = round2(salary.basicSalary || salary.basic_salary || 0);
  const hra = round2(salary.hra || 0);
  const allowances = round2(salary.allowances || 0);
  const bonus = round2(salary.bonus || 0);
  const overtimeHours = Number(attendance.overtimeHours || attendance.overtime_hours || 0);
  const overtimeRate = round2(salary.overtimeRate || salary.overtime_rate || 0);
  const overtime = round2(overtimeHours * overtimeRate);

  const fixedMonthly = basic + hra + allowances;
  const unpaidDays = Number(attendance.unpaidLeaveDays || attendance.unpaid_leave_days || 0);
  const unpaidDeduction = round2((fixedMonthly / 26) * unpaidDays);

  const earnings = { basic, hra, allowances, bonus, overtime };
  const deductions = {
    provident_fund: round2(salary.providentFund || salary.provident_fund || 0),
    professional_tax: round2(salary.professionalTax || salary.professional_tax || 0),
    income_tax: round2(salary.incomeTax || salary.income_tax || 0),
    other: round2(salary.otherDeductions || salary.other_deductions || 0),
    unpaid_leave: unpaidDeduction
  };

  const grossSalary = round2(Object.values(earnings).reduce((a, b) => a + b, 0));
  const totalDeductions = round2(Object.values(deductions).reduce((a, b) => a + b, 0));
  const netSalary = round2(grossSalary - totalDeductions);

  return {
    earnings,
    deductions,
    gross_salary: grossSalary,
    total_deductions: totalDeductions,
    net_salary: netSalary,
    overtime_amount: overtime,
    unpaid_leave_deduction: unpaidDeduction
  };
}

module.exports = { calculatePayroll, round2 };