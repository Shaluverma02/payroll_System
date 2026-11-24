require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const { connectDB } = require('./config/database');
const { Admin, Department, Employee, Attendance, Salary, Payroll, Payslip, ActivityLog, SalaryRevision, CompanySetting, LeaveRequest } = require('./models');
const { requireAdmin, requireRoles } = require('./middleware/auth');
const payrollRouter = require('./routes/payroll');
const featuresRouter = require('./routes/features');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const logActivity = (req, action, type, id, details = {}) =>
  ActivityLog.create({ adminId: req.admin?.id, action, entityType: type, entityId: String(id || ''), details }).catch(() => {});
const csvCell = value => {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
const currencyAmount = (value, currency, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' })
    .format(Number(value || 0))
    .replace(/\u00a0/g, ' ');
const objectId = value => mongoose.isValidObjectId(String(value || '')) ? new mongoose.Types.ObjectId(String(value)) : null;

async function makePdf(documentTitle, columns, rows) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.fontSize(18).text(documentTitle);
  doc.moveDown();
  columns.forEach((column, index) => doc.fontSize(9).text(column, index * 105 + 40, doc.y, { width: 100, continued: index < columns.length - 1 }));
  doc.moveDown();
  rows.forEach(row => {
    columns.forEach((_, index) => doc.fontSize(8).text(String(row[index] ?? ''), index * 105 + 40, doc.y, { width: 100, continued: index < columns.length - 1 }));
    doc.moveDown(0.5);
  });
  doc.end();
  return completed;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'mongodb' }));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  if (await Admin.countDocuments() > 0) return res.status(403).json({ error: 'Public registration is closed. Ask a workspace administrator to create your account.' });
  const { fullName, email, password } = req.body;
  if (!fullName?.trim() || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, valid email, and a password of at least 8 characters are required.' });
  const existing = await Admin.findOne({ email: String(email).toLowerCase() });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });
  const admin = await Admin.create({ fullName: fullName.trim(), email: String(email).toLowerCase(), passwordHash: await bcrypt.hash(password, 12) });
  const token = jwt.sign({ id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.status(201).json({ token, admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role } });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const admin = await Admin.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!admin || !(await bcrypt.compare(req.body.password || '', admin.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (admin.twoFactorEnabled && !speakeasy.totp.verify({ secret: admin.twoFactorSecret, encoding: 'base32', token: String(req.body.otp || ''), window: 1 })) return res.status(401).json({ error: 'A valid authenticator code is required.' });
  const token = jwt.sign({ id: admin.id, employeeId: admin.employeeId?.toString(), email: admin.email, fullName: admin.fullName, role: admin.role, mfa: Boolean(admin.twoFactorEnabled) }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
  res.json({ token, admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role } });
}));

app.use('/api', requireAdmin);
app.use('/api', featuresRouter);

app.get('/api/auth/2fa/status', asyncRoute(async (req, res) => {
  const user = await Admin.findById(req.admin.id);
  res.json({ enabled: Boolean(user?.twoFactorEnabled) });
}));
app.post('/api/auth/2fa/setup', asyncRoute(async (req, res) => {
  const user = await Admin.findById(req.admin.id);
  const secret = speakeasy.generateSecret({ name: `Northstar Payroll (${user.email})`, length: 20 });
  user.twoFactorSecret = secret.base32;
  user.twoFactorEnabled = false;
  await user.save();
  res.json({ secret: secret.base32, qrDataUrl: await QRCode.toDataURL(secret.otpauth_url) });
}));
app.post('/api/auth/2fa/confirm', asyncRoute(async (req, res) => {
  const user = await Admin.findById(req.admin.id);
  if (!user?.twoFactorSecret || !speakeasy.totp.verify({ secret: user.twoFactorSecret, encoding: 'base32', token: String(req.body.otp || ''), window: 1 })) return res.status(400).json({ error: 'Authenticator code did not validate. Scan the latest QR code and retry.' });
  user.twoFactorEnabled = true;
  await user.save();
  res.json({ enabled: true });
}));
app.post('/api/auth/2fa/disable', asyncRoute(async (req, res) => {
  const user = await Admin.findById(req.admin.id);
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash)) || !speakeasy.totp.verify({ secret: user.twoFactorSecret || '', encoding: 'base32', token: String(req.body.otp || ''), window: 1 })) return res.status(400).json({ error: 'Password and current authenticator code must match.' });
  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  await user.save();
  res.json({ enabled: false });
}));

app.get('/api/me/profile', asyncRoute(async (req, res) => {
  if (!req.admin.employeeId) return res.status(404).json({ error: 'This account is not linked to an employee profile.' });
  const employee = await Employee.findById(req.admin.employeeId).populate('Department').populate('Salary');
  if (!employee) return res.status(404).json({ error: 'Employee profile not found.' });
  res.json(employee);
}));
app.get('/api/me/payslips', asyncRoute(async (req, res) => {
  if (!req.admin.employeeId) return res.status(404).json({ error: 'This account is not linked to an employee profile.' });
  res.json(await Payroll.find({ employeeId: req.admin.employeeId }).sort({ year: -1, month: -1 }));
}));
app.get('/api/me/attendance', asyncRoute(async (req, res) => {
  if (!req.admin.employeeId) return res.status(404).json({ error: 'This account is not linked to an employee profile.' });
  res.json(await Attendance.find({ employeeId: req.admin.employeeId }).sort({ attendanceDate: -1 }).limit(500));
}));
app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const admin = await Admin.findById(req.admin.id).select('id fullName email role employeeId twoFactorEnabled createdAt');
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  res.json(admin);
}));
app.put('/api/auth/me', asyncRoute(async (req, res) => {
  const admin = await Admin.findById(req.admin.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  if (req.body.fullName?.trim()) admin.fullName = req.body.fullName.trim();
  if (req.body.email) admin.email = String(req.body.email).toLowerCase();
  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    admin.passwordHash = await bcrypt.hash(req.body.password, 12);
  }
  await admin.save();
  res.json({ id: admin.id, fullName: admin.fullName, email: admin.email, role: admin.role });
}));

app.get('/api/employees', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const query = {};
  if (req.query.q) {
    const regex = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = ['fullName', 'email', 'employeeId', 'designation'].map(key => ({ [key]: regex }));
  }
  if (req.query.departmentId && objectId(req.query.departmentId)) query.departmentId = objectId(req.query.departmentId);
  if (req.query.status) query.employmentStatus = req.query.status;
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId) return res.status(403).json({ error: 'Link this manager account to an employee in their department.' });
    query.departmentId = manager.departmentId;
  } else if (!['admin', 'hr'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Employee records are restricted to HR and department managers.' });
  }
  const [rows, count] = await Promise.all([
    Employee.find(query).populate('Department').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Employee.countDocuments(query)
  ]);
  res.json({ rows, count, page, pages: Math.ceil(count / limit) });
}));
app.get('/api/employees/:id', asyncRoute(async (req, res) => {
  const item = await Employee.findById(req.params.id).populate('Department').populate('Salary').populate('Payrolls');
  if (!item) return res.status(404).json({ error: 'Employee not found.' });
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId || String(item.departmentId) !== String(manager.departmentId)) return res.status(403).json({ error: 'You can only view employees in your department.' });
  } else if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Employee records are restricted to HR and department managers.' });
  res.json(item);
}));
app.post('/api/employees', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can add employees.' });
  if (!req.body.fullName?.trim() || !req.body.email) return res.status(400).json({ error: 'Full name and email are required.' });
  const employee = await Employee.create({ ...req.body, email: String(req.body.email).toLowerCase(), employeeId: req.body.employeeId || `EMP-${Date.now().toString().slice(-7)}` });
  await logActivity(req, 'created', 'employee', employee.id);
  res.status(201).json(employee);
}));
app.put('/api/employees/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can update employees.' });
  const item = await Employee.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Employee not found.' });
  for (const key of ['fullName','email','phone','gender','dateOfBirth','departmentId','designation','joiningDate','address','bankAccountNumber','ifscCode','panNumber','employmentStatus']) {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  }
  await item.save();
  await logActivity(req, 'updated', 'employee', item.id);
  res.json(item);
}));
app.delete('/api/employees/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can delete employees.' });
  const item = await Employee.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Employee not found.' });
  const payrolls = await Payroll.find({ employeeId: item._id }).select('_id');
  await Promise.all([
    Salary.deleteMany({ employeeId: item._id }),
    Attendance.deleteMany({ employeeId: item._id }),
    Payroll.deleteMany({ employeeId: item._id }),
    Payslip.deleteMany({ payrollId: { $in: payrolls.map(payroll => payroll._id) } }),
    LeaveRequest.deleteMany({ employeeId: item._id }),
    SalaryRevision.deleteMany({ employeeId: item._id })
  ]);
  await logActivity(req, 'deleted', 'employee', item.id);
  res.status(204).end();
}));

app.get('/api/departments', asyncRoute(async (req, res) => {
  const departments = await Department.find().sort({ departmentName: 1 });
  const employees = await Employee.aggregate([{ $match: { departmentId: { $ne: null } } }, { $group: { _id: '$departmentId', employeeCount: { $sum: 1 } } }]);
  const counts = new Map(employees.map(row => [String(row._id), row.employeeCount]));
  res.json(departments.map(department => ({ ...department.toJSON(), employeeCount: counts.get(department.id) || 0 })));
}));
app.post('/api/departments', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can manage departments.' });
  if (!req.body.departmentName?.trim()) return res.status(400).json({ error: 'Department name is required.' });
  const item = await Department.create({ ...req.body, departmentId: req.body.departmentId || `DEP-${Date.now().toString().slice(-7)}` });
  await logActivity(req, 'created', 'department', item.id);
  res.status(201).json(item);
}));
app.put('/api/departments/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can manage departments.' });
  const item = await Department.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Department not found.' });
  for (const key of ['departmentName','description','managerName']) if (req.body[key] !== undefined) item[key] = req.body[key];
  await item.save();
  await logActivity(req, 'updated', 'department', item.id);
  res.json(item);
}));
app.delete('/api/departments/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can manage departments.' });
  const item = await Department.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Department not found.' });
  await Employee.updateMany({ departmentId: item._id }, { departmentId: null });
  await logActivity(req, 'deleted', 'department', item.id);
  res.status(204).end();
}));

app.get('/api/attendance', asyncRoute(async (req, res) => {
  const query = {};
  if (req.admin.role === 'employee') {
    if (!req.admin.employeeId) return res.status(403).json({ error: 'This account is not linked to an employee profile.' });
    query.employeeId = req.admin.employeeId;
  } else if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId) return res.status(403).json({ error: 'Link this manager account to a department employee profile.' });
    const team = await Employee.find({ departmentId: manager.departmentId }).select('_id');
    query.employeeId = { $in: team.map(employee => employee._id) };
  } else if (req.query.employeeId) {
    if (objectId(req.query.employeeId)) query.employeeId = objectId(req.query.employeeId);
  }
  if (!['admin', 'hr', 'department_manager', 'employee'].includes(req.admin.role)) return res.status(403).json({ error: 'Attendance access is restricted.' });
  if (req.query.month && req.query.year) {
    const start = new Date(Date.UTC(Number(req.query.year), Number(req.query.month) - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(Number(req.query.year), Number(req.query.month), 1)).toISOString().slice(0, 10);
    query.attendanceDate = { $gte: start, $lt: end };
  }
  res.json(await Attendance.find(query).populate('Employee', 'id employeeId fullName').sort({ attendanceDate: -1 }).limit(500));
}));
app.post('/api/attendance', asyncRoute(async (req, res) => {
  if (!['admin', 'hr', 'department_manager'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Only HR or a department manager can record attendance.' });
  }
  const { employeeId, attendanceDate, status } = req.body;
  if (!employeeId || !attendanceDate || !['Present','Absent','Paid Leave','Unpaid Leave'].includes(status)) {
    return res.status(400).json({ error: 'Employee, date, and a valid attendance status are required.' });
  }
  const id = objectId(employeeId);
  if (!id) return res.status(400).json({ error: 'A valid employee ID is required.' });
  const employee = await Employee.findById(id).select('departmentId');
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId).select('departmentId');
    if (!manager?.departmentId) {
      return res.status(403).json({ error: 'Link this manager account to an employee in their department.' });
    }
    if (String(employee.departmentId) !== String(manager.departmentId)) {
      return res.status(403).json({ error: 'You can only record attendance for employees in your department.' });
    }
  }
  const item = await Attendance.findOneAndUpdate(
    { employeeId: id, attendanceDate },
    {
      employeeId: id,
      attendanceDate,
      status,
      overtimeHours: req.body.overtimeHours ?? 0,
      notes: req.body.notes ?? ''
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
  await logActivity(req, 'recorded', 'attendance', item.id);
  res.status(200).json(item);
}));
app.put('/api/attendance/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can update attendance.' });
  const item = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ error: 'Attendance record not found.' });
  await logActivity(req, 'updated', 'attendance', item.id);
  res.json(item);
}));
app.delete('/api/attendance/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'hr'].includes(req.admin.role)) return res.status(403).json({ error: 'Only HR can delete attendance.' });
  const item = await Attendance.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Attendance record not found.' });
  res.status(204).end();
}));

app.get('/api/salary', asyncRoute(async (req, res) => {
  if (!['admin', 'hr', 'payroll_manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Salary details are restricted to HR and payroll managers.' });
  const query = req.query.employeeId && objectId(req.query.employeeId) ? { employeeId: objectId(req.query.employeeId) } : {};
  res.json(await Salary.find(query).populate('Employee', 'id employeeId fullName'));
}));
app.post('/api/salary', asyncRoute(async (req, res) => {
  if (!['admin', 'payroll_manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can change salary structures.' });
  if (!req.body.employeeId || !objectId(req.body.employeeId)) return res.status(400).json({ error: 'Employee is required.' });
  const employeeId = objectId(req.body.employeeId);
  const effectiveDate = req.body.effectiveDate || new Date().toISOString().slice(0, 10);
  const reason = req.body.reason || 'Compensation update';
  const editable = ['basicSalary','hra','allowances','bonus','overtimeRate','providentFund','professionalTax','incomeTax','otherDeductions'];
  const changes = Object.fromEntries(editable.filter(key => req.body[key] !== undefined).map(key => [key, Number(req.body[key])]));
  const current = await Salary.findOne({ employeeId });
  if (current) await SalaryRevision.create({ employeeId, effectiveDate, reason, snapshot: current.toJSON() });
  const item = await Salary.findOneAndUpdate(
    { employeeId },
    changes,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (!current) await SalaryRevision.create({ employeeId, effectiveDate, reason: 'Initial salary structure', snapshot: item.toJSON() });
  await logActivity(req, 'updated salary structure', 'salary', item.id, { employeeId: employeeId.toString(), effectiveDate, reason });
  res.status(current ? 200 : 201).json(item);
}));
app.put('/api/salary/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'payroll_manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can change salary structures.' });
  const item = await Salary.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ error: 'Salary structure not found.' });
  res.json(item);
}));
app.delete('/api/salary/:id', asyncRoute(async (req, res) => {
  if (!['admin', 'payroll_manager'].includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can change salary structures.' });
  const item = await Salary.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Salary structure not found.' });
  res.status(204).end();
}));

app.use('/api/payroll', payrollRouter);

app.get('/api/payslips/:payrollId', asyncRoute(async (req, res) => {
  const item = await Payroll.findById(req.params.payrollId).populate({ path: 'Employee', populate: { path: 'Department' } });
  if (!item) return res.status(404).json({ error: 'Payslip not found.' });
  if (req.admin.role === 'employee' && String(item.employeeId) !== String(req.admin.employeeId)) return res.status(403).json({ error: 'You can only view your own payslips.' });
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId || String(item.Employee?.departmentId) !== String(manager.departmentId)) return res.status(403).json({ error: 'You can only view payslips for employees in your department.' });
  }
  const setting = await CompanySetting.findOne({ key: 'company' });
  const company = setting?.value || {};
  res.json({ company: { name: company.companyName || process.env.COMPANY_NAME || 'Northstar Systems', address: company.companyAddress || process.env.COMPANY_ADDRESS || '', currency: company.currency || 'USD' }, payroll: item });
}));
app.get('/api/payslips/:payrollId/pdf', asyncRoute(async (req, res) => {
  const item = await Payroll.findById(req.params.payrollId).populate({ path: 'Employee', populate: { path: 'Department' } });
  if (!item) return res.status(404).json({ error: 'Payslip not found.' });
  if (req.admin.role === 'employee' && String(item.employeeId) !== String(req.admin.employeeId)) return res.status(403).json({ error: 'You can only download your own payslips.' });
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId || String(item.Employee?.departmentId) !== String(manager.departmentId)) return res.status(403).json({ error: 'You can only download payslips for employees in your department.' });
  }
  const setting = await CompanySetting.findOne({ key: 'company' });
  const company = setting?.value || {};
  const currency = company.currency || 'USD';
  const locale = company.locale || 'en-US';
  const pdf = await makePdf(
    `${company.companyName || process.env.COMPANY_NAME || 'Northstar Systems'} - Payslip`,
    ['Employee', 'Period', `Gross (${currency})`, `Deductions (${currency})`, `Net (${currency})`],
    [[item.Employee?.fullName || '', `${item.month}/${item.year}`, currencyAmount(item.grossSalary, currency, locale), currencyAmount(item.totalDeductions, currency, locale), currencyAmount(item.netSalary, currency, locale)]]
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=payslip-${item.Employee?.employeeId || item.employeeId}-${item.year}-${String(item.month).padStart(2, '0')}.pdf`);
  res.send(pdf);
}));

app.use('/api/reports', requireRoles('admin', 'hr', 'payroll_manager'));
app.get('/api/reports/summary', asyncRoute(async (req, res) => {
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();
  const [employeeCount, departmentCount, pendingCount, paidCount, payrollRows, recentEmployees, recentPayroll, departmentCounts, trend] = await Promise.all([
    Employee.countDocuments({ employmentStatus: 'Active' }),
    Department.countDocuments(),
    Payroll.countDocuments({ status: 'Pending' }),
    Payroll.countDocuments({ status: 'Paid' }),
    Payroll.find({ month, year, status: { $ne: 'Cancelled' } }).select('netSalary'),
    Employee.find().populate('Department').sort({ createdAt: -1 }).limit(5),
    Payroll.find().populate({ path: 'Employee', populate: { path: 'Department' } }).sort({ createdAt: -1 }).limit(5),
    Employee.aggregate([{ $match: { departmentId: { $ne: null } } }, { $group: { _id: '$departmentId', employeeCount: { $sum: 1 } } }]),
    Payroll.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: { year: '$year', month: '$month' }, total: { $sum: '$netSalary' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 }
    ])
  ]);
  const departmentNames = await Department.find({ _id: { $in: departmentCounts.map(row => row._id) } });
  const names = new Map(departmentNames.map(department => [department.id, department.departmentName]));
  res.json({
    employeeCount,
    departmentCount,
    pendingCount,
    paidCount,
    monthlyPayroll: payrollRows.reduce((sum, payroll) => sum + Number(payroll.netSalary || 0), 0),
    recentEmployees,
    recentPayroll,
    departmentCounts: departmentCounts.map(row => ({ departmentName: names.get(String(row._id)) || 'Unassigned', employeeCount: row.employeeCount })),
    monthlyTrend: trend.map(row => ({ month: row._id.month, year: row._id.year, total: row.total }))
  });
}));
app.get('/api/reports/employees/:employeeId/salary-history', asyncRoute(async (req, res) => {
  const employee = await Employee.findById(req.params.employeeId).populate('Department');
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  const history = await Payroll.find({ employeeId: employee._id, status: { $ne: 'Cancelled' } }).sort({ year: -1, month: -1 });
  res.json({ employee, history });
}));
app.get('/api/reports/payroll.csv', asyncRoute(async (req, res) => {
  const query = req.query.year ? { year: Number(req.query.year) } : {};
  const items = await Payroll.find(query).populate({ path: 'Employee', populate: { path: 'Department' } }).sort({ year: -1, month: -1 });
  const company = (await CompanySetting.findOne({ key: 'company' }))?.value || {};
  const currency = company.currency || 'USD';
  const lines = [
    ['Employee ID','Employee','Department','Month','Year',`Gross Salary (${currency})`,`Deductions (${currency})`,`Net Salary (${currency})`,'Status'],
    ...items.map(payroll => [payroll.Employee?.employeeId, payroll.Employee?.fullName, payroll.Employee?.Department?.departmentName, payroll.month, payroll.year, payroll.grossSalary, payroll.totalDeductions, payroll.netSalary, payroll.status])
  ];
  res.type('text/csv').attachment('payroll-report.csv').send(lines.map(row => row.map(csvCell).join(',')).join('\n'));
}));
app.get('/api/reports/payroll.pdf', asyncRoute(async (req, res) => {
  const query = req.query.year ? { year: Number(req.query.year) } : {};
  const items = await Payroll.find(query).populate('Employee').sort({ year: -1, month: -1 });
  const company = (await CompanySetting.findOne({ key: 'company' }))?.value || {};
  const currency = company.currency || 'USD';
  const locale = company.locale || 'en-US';
  const pdf = await makePdf(
    `${company.companyName || process.env.COMPANY_NAME || 'Northstar Systems'} - Payroll Report`,
    ['Employee', 'Period', `Gross (${currency})`, `Deductions (${currency})`, `Net (${currency})`, 'Status'],
    items.map(payroll => [payroll.Employee?.fullName || '', `${payroll.month}/${payroll.year}`, currencyAmount(payroll.grossSalary, currency, locale), currencyAmount(payroll.totalDeductions, currency, locale), currencyAmount(payroll.netSalary, currency, locale), payroll.status])
  );
  res.type('application/pdf').attachment('payroll-report.pdf').send(pdf);
}));
app.get('/api/reports/department.csv', asyncRoute(async (req, res) => {
  const departments = await Department.find().sort({ departmentName: 1 });
  const company = (await CompanySetting.findOne({ key: 'company' }))?.value || {};
  const lines = [['Department','Employees','Payroll records',`Net payroll (${company.currency || 'USD'})`]];
  for (const department of departments) {
    const employees = await Employee.find({ departmentId: department._id }).select('_id');
    const employeeIds = employees.map(employee => employee._id);
    const payrolls = await Payroll.find({ employeeId: { $in: employeeIds }, status: { $ne: 'Cancelled' } }).select('netSalary');
    lines.push([department.departmentName, employees.length, payrolls.length, payrolls.reduce((sum, payroll) => sum + Number(payroll.netSalary || 0), 0)]);
  }
  res.type('text/csv').attachment('department-report.csv').send(lines.map(row => row.map(csvCell).join(',')).join('\n'));
}));

app.use((req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'A record with these unique details already exists.' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors).map(error => error.message).join(', ') });
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid MongoDB ID.' });
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

const port = Number(process.env.PORT || 4000);
(async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Copy backend/.env.example to backend/.env and configure it.');
    await connectDB();
    app.listen(port, () => console.log(`Payroll API listening on http://localhost:${port}`));
  } catch (error) {
    console.error('Unable to start API:', error.message);
    process.exit(1);
  }
})();
