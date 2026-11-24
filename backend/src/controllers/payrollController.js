const { Attendance, Employee, LeaveRequest, Payroll, Payslip, Salary, ActivityLog, Department } = require('../models');
const { calculatePayroll } = require('../services/payrollCalculator');
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }

async function generatePayroll({ employeeId, month, year }, adminId) {
  month = Number(month); year = Number(year);
  if (!employeeId || month < 1 || month > 12 || !year) throw httpError(400, 'Select an employee and valid month/year.');

  let employee = null;
  if (employeeId && String(employeeId).match(/^[0-9a-fA-F]{24}$/)) {
    employee = await Employee.findById(employeeId);
  }
  if (!employee) {
    employee = await Employee.findOne({ employeeId: String(employeeId) });
  }
  if (!employee) throw httpError(404, 'Employee not found.');

  const existing = await Payroll.findOne({ employeeId: employee._id, month, year });
  if (existing) throw httpError(409, 'Payroll already exists for this employee and period.');

  const salary = await Salary.findOne({ employeeId: employee._id });
  if (!salary) throw httpError(400, 'Employee and salary structure are required before payroll generation.');

  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

  const attendanceRows = await Attendance.find({
    employeeId: employee._id,
    attendanceDate: { $gte: start, $lt: end }
  });

  const leaveRows = await LeaveRequest.find({
    employeeId: employee._id,
    status: 'Approved',
    leaveType: 'Unpaid',
    startDate: { $lt: end },
    endDate: { $gte: start }
  });

  const unpaidDates = new Set(attendanceRows.filter(row => row.status === 'Unpaid Leave').map(row => row.attendanceDate));
  for (const leave of leaveRows) {
    const first = new Date(`${leave.startDate < start ? start : leave.startDate}T00:00:00Z`);
    const last = new Date(`${leave.endDate >= end ? new Date(Date.parse(end) - 86400000).toISOString().slice(0, 10) : leave.endDate}T00:00:00Z`);
    for (let day = new Date(first); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
      if (day.getUTCDay() !== 0 && day.getUTCDate() !== 6) unpaidDates.add(day.toISOString().slice(0, 10));
    }
  }

  const attendance = {
    presentDays: attendanceRows.filter(record => record.status === 'Present').length,
    unpaidLeaveDays: unpaidDates.size,
    overtimeHours: attendanceRows.reduce((sum, record) => sum + Number(record.overtimeHours || 0), 0)
  };

  const calculated = calculatePayroll(salary.toJSON ? salary.toJSON() : salary, attendance);

  const payroll = await Payroll.create({
    employeeId: employee._id,
    month,
    year,
    ...attendance,
    grossSalary: calculated.gross_salary,
    totalDeductions: calculated.total_deductions,
    netSalary: calculated.net_salary,
    earnings: calculated.earnings,
    deductions: calculated.deductions
  });

  await Payslip.findOneAndUpdate(
    { payrollId: payroll._id },
    { payrollId: payroll._id },
    { upsert: true, new: true }
  );

  const { ActivityLog } = require('../models');
  const { notifyRoles } = require('../services/notifications');
  ActivityLog.create({ adminId, action: 'generated', entityType: 'payroll', entityId: payroll._id.toString(), details: { month, year } }).catch(() => {});
  await notifyRoles(['admin', 'payroll_manager'], { title: 'Payroll ready for approval', message: `${employee.fullName}'s payroll for ${month}/${year} is ready for review.`, category: 'payroll', link: '/approvals' });

  return Payroll.findById(payroll._id).populate({ path: 'Employee', populate: { path: 'Department' } });
}

module.exports = { generatePayroll, httpError };