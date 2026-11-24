const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const bcrypt = require('bcryptjs');
const { Admin, ActivityLog, CompanySetting, Department, Employee, LeaveRequest, Notification, Payroll, Payslip, Salary, SalaryRevision, Attendance } = require('../models');
const { requireRoles } = require('../middleware/auth');
const { notifyAccount, notifyRoles } = require('../services/notifications');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const roles = { admin: ['admin'], hr: ['admin', 'hr'], payroll: ['admin', 'payroll_manager'], hrPayroll: ['admin', 'hr', 'payroll_manager'] };
const roleGate = allowed => (req, res, next) =>
  allowed.includes(req.admin?.role)
    ? next()
    : requireRoles(...allowed)(req, res, next);
const publicAccount = user => ({ id: user.id || user._id.toString(), fullName: user.fullName, email: user.email, role: user.role, employeeId: user.employeeId, twoFactorEnabled: user.twoFactorEnabled });
const log = (adminId, action, entityType, entityId, details = {}) => ActivityLog.create({ adminId, action, entityType, entityId: String(entityId || ''), details }).catch(() => {});
const validRoles = ['admin', 'hr', 'payroll_manager', 'department_manager', 'employee'];

router.get('/users', roleGate(roles.admin), asyncRoute(async (req, res) => {
  const users = await Admin.find().sort({ createdAt: -1 });
  res.json(users.map(publicAccount));
}));

router.post('/users', roleGate(roles.admin), asyncRoute(async (req, res) => {
  const { fullName, email, password, role, employeeId } = req.body;
  if (!fullName?.trim() || !email || !password || password.length < 8 || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Name, email, password (8+ characters), and a valid role are required.' });
  }
  if (['employee', 'department_manager'].includes(role) && !employeeId) {
    return res.status(400).json({ error: 'Choose the linked employee for this workspace role.' });
  }
  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const user = await Admin.create({
    fullName: fullName.trim(),
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    role,
    employeeId: employeeId || null
  });
  await log(req.admin.id, 'created account', 'user', user._id, { role });
  res.status(201).json(publicAccount(user));
}));

router.put('/users/:id', roleGate(roles.admin), asyncRoute(async (req, res) => {
  const user = await Admin.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (user._id.toString() === String(req.admin.id) && req.body.role && req.body.role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
  }
  if (req.body.role && !validRoles.includes(req.body.role)) {
    return res.status(400).json({ error: 'Choose a valid workspace role.' });
  }
  for (const key of ['fullName', 'role', 'employeeId']) {
    if (req.body[key] !== undefined) user[key] = req.body[key];
  }
  if (['employee', 'department_manager'].includes(user.role) && !user.employeeId) {
    return res.status(400).json({ error: 'Link this role to an employee profile before saving.' });
  }
  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    user.passwordHash = await bcrypt.hash(req.body.password, 12);
  }
  await user.save();
  await log(req.admin.id, 'updated account', 'user', user._id, { role: user.role });
  res.json(publicAccount(user));
}));

router.delete('/users/:id', roleGate(roles.admin), asyncRoute(async (req, res) => {
  if (String(req.params.id) === String(req.admin.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  const user = await Admin.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  await log(req.admin.id, 'deleted account', 'user', req.params.id);
  res.status(204).end();
}));


router.get('/leave', asyncRoute(async (req, res) => {
  const query = {};
  if (req.admin.role === 'employee') {
    if (!req.admin.employeeId) return res.status(403).json({ error: 'This employee account is not linked to an employee profile.' });
    query.employeeId = req.admin.employeeId;
  } else if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId) return res.status(403).json({ error: 'Link this manager account to a department employee profile.' });
    const team = await Employee.find({ departmentId: manager.departmentId }).select('_id');
    query.employeeId = { $in: team.map(e => e._id) };
  } else if (req.query.status) {
    query.status = req.query.status;
  }
  const items = await LeaveRequest.find(query)
    .populate({ path: 'Employee', select: 'id employeeId fullName departmentId' })
    .sort({ createdAt: -1 })
    .limit(500);
  res.json(items);
}));

router.post('/leave', asyncRoute(async (req, res) => {
  const employeeId = ['employee', 'department_manager'].includes(req.admin.role) ? req.admin.employeeId : req.body.employeeId;
  if (req.admin.role === 'department_manager' && req.body.employeeId && String(req.body.employeeId) !== String(req.admin.employeeId)) {
    return res.status(403).json({ error: 'Managers can submit leave requests only for themselves.' });
  }
  const { startDate, endDate, leaveType, reason } = req.body;
  if (!employeeId || !startDate || !endDate || endDate < startDate || !['Paid', 'Unpaid', 'Sick', 'Personal'].includes(leaveType)) {
    return res.status(400).json({ error: 'Choose an employee, valid date range, and leave type.' });
  }
  const request = await LeaveRequest.create({ employeeId, startDate, endDate, leaveType, reason });
  await log(req.admin.id, 'requested leave', 'leave', request._id);
  await notifyRoles(roles.hr, { title: 'Leave request submitted', message: `A new ${leaveType.toLowerCase()} leave request needs review.`, category: 'leave', link: '/leave' });
  res.status(201).json(request);
}));

router.put('/leave/:id/review', asyncRoute(async (req, res) => {
  const request = await LeaveRequest.findById(req.params.id).populate('Employee');
  if (!request) return res.status(404).json({ error: 'Leave request not found.' });
  if (!roles.hr.includes(req.admin.role) && req.admin.role !== 'department_manager') {
    return res.status(403).json({ error: 'Only HR or a department manager can review leave.' });
  }
  if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager || String(manager.departmentId) !== String(request.Employee?.departmentId)) {
      return res.status(403).json({ error: 'You can only review leave for your department.' });
    }
  }
  if (!['Approved', 'Rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Review status must be Approved or Rejected.' });
  request.status = req.body.status;
  request.reviewedBy = req.admin.id;
  request.reviewedAt = new Date();
  request.reviewerNote = req.body.reviewerNote || null;
  await request.save();

  await log(req.admin.id, `leave ${request.status.toLowerCase()}`, 'leave', request._id);
  const employeeUser = await Admin.findOne({ employeeId: request.employeeId, role: 'employee' });
  if (employeeUser) {
    await notifyAccount(employeeUser._id, {
      title: `Leave ${request.status.toLowerCase()}`,
      message: `Your leave request from ${request.startDate} to ${request.endDate} was ${request.status.toLowerCase()}.`,
      category: 'leave',
      link: '/leave'
    });
  }
  res.json(request);
}));


router.get('/salary-revisions/:employeeId', roleGate(roles.payroll), asyncRoute(async (req, res) => {
  const items = await SalaryRevision.find({ employeeId: req.params.employeeId }).sort({ effectiveDate: -1, createdAt: -1 });
  res.json(items);
}));

router.get('/audit', roleGate(roles.hr), asyncRoute(async (req, res) => {
  const query = {};
  if (req.query.entityType) query.entityType = req.query.entityType;
  const items = await ActivityLog.find(query)
    .populate({ path: 'Admin', select: 'id fullName email role' })
    .sort({ createdAt: -1 })
    .limit(Math.min(500, Number(req.query.limit) || 150));
  res.json(items);
}));


router.get('/notifications', asyncRoute(async (req, res) => {
  const items = await Notification.find({ adminId: req.admin.id }).sort({ createdAt: -1 }).limit(100);
  res.json(items);
}));

router.put('/notifications/:id/read', asyncRoute(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, adminId: req.admin.id },
    { readAt: new Date() },
    { new: true }
  );
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  res.json(notification);
}));

router.put('/notifications/read-all', asyncRoute(async (req, res) => {
  await Notification.updateMany({ adminId: req.admin.id, readAt: null }, { readAt: new Date() });
  res.json({ success: true });
}));


router.get('/settings/company', asyncRoute(async (req, res) => {
  const setting = await CompanySetting.findOne({ key: 'company' });
  res.json(setting?.value || { currency: 'USD', locale: 'en-US', taxJurisdiction: 'US-CA', taxYear: new Date().getFullYear(), companyName: process.env.COMPANY_NAME || 'Northstar Systems', companyAddress: process.env.COMPANY_ADDRESS || '' });
}));

router.put('/settings/company', roleGate(roles.admin), asyncRoute(async (req, res) => {
  const value = {
    currency: String(req.body.currency || 'USD').toUpperCase(),
    locale: req.body.locale || 'en-US',
    taxJurisdiction: req.body.taxJurisdiction || '',
    taxYear: Number(req.body.taxYear) || new Date().getFullYear(),
    companyName: req.body.companyName || '',
    companyAddress: req.body.companyAddress || ''
  };
  if (!/^[A-Z]{3}$/.test(value.currency)) return res.status(400).json({ error: 'Currency must be a three-letter ISL code.' });
  const setting = await CompanySetting.findOneAndUpdate(
    { key: 'company' },
    { value },
    { upsert: true, new: true }
  );
  await log(req.admin.id, 'updated company payroll settings', 'settings', setting._id);
  res.json(setting.value);
}));


router.post('/employees/import', roleGate(roles.hr), upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file first.' });
  const records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: false });
  if (records.length > 1000) return res.status(413).json({ error: 'Import is limited to 1,000 rows per file.' });
  const results = [];
  for (let index = 0; index < records.length; index += 1) {
    const row = records[index];
    try {
      const fullName = row.full_name || row.fullName;
      const email = String(row.email || '').trim().toLowerCase();
      if (!fullName || !email || !email.includes('@')) throw new Error('full_name and valid email are required');
      const empCode = row.employee_id || row.employeeId || `EMP-${Date.now().toString().slice(-6)}${index % 10}`;
      const duplicate = await Employee.findOne({ $or: [{ email }, { employeeId: empCode }] });
      if (duplicate) throw new Error('email or employee_id already exists');
      let departmentId = row.department_id || row.departmentId || null;
      if (!departmentId && row.department) {
        const d = await Department.findOne({ departmentName: row.department });
        if (d) departmentId = d._id;
      }
      const employee = await Employee.create({
        employeeId: empCode,
        fullName,
        email,
        phone: row.phone || '',
        departmentId,
        designation: row.designation || '',
        joiningDate: row.joining_date || row.joiningDate || '',
        employmentStatus: row.employment_status || 'Active'
      });
      results.push({ row: index + 2, employeeId: employee.employeeId, status: 'imported' });
    } catch (error) {
      results.push({ row: index + 2, status: 'error', error: error.message });
    }
  }
  await log(req.admin.id, 'imported employees', 'employee', null, { count: results.filter(row => row.status === 'imported').length });
  res.json({ total: records.length, imported: results.filter(row => row.status === 'imported').length, failed: results.filter(row => row.status === 'error').length, rows: results });
}));


router.get('/backups/download', roleGate(roles.admin), asyncRoute(async (req, res) => {
  const [admins, departments, employees, attendance, salaries, payrolls, payslips, leaves, revisions, notifications, activity, settings] = await Promise.all([
    Admin.find().lean(),
    Department.find().lean(),
    Employee.find().lean(),
    Attendance.find().lean(),
    Salary.find().lean(),
    Payroll.find().lean(),
    Payslip.find().lean(),
    LeaveRequest.find().lean(),
    SalaryRevision.find().lean(),
    Notification.find().lean(),
    ActivityLog.find().lean(),
    CompanySetting.find().lean()
  ]);
  const backup = { admins, departments, employees, attendance, salaries, payrolls, payslips, leaves, revisions, notifications, activity, settings, exportedAt: new Date().toISOString() };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=payroll-backup-${new Date().toISOString().slice(0, 10)}.json`);
  res.send(JSON.stringify(backup, null, 2));
}));

router.post('/backups/restore', roleGate(roles.admin), upload.single('file'), asyncRoute(async (req, res) => {
  if (req.body.confirmation !== 'RESTORE') return res.status(400).json({ error: 'Type RESTORE to confirm replacing database contents.' });
  if (!req.file) return res.status(400).json({ error: 'Upload a backup JSON file.' });
  let data;
  try {
    data = JSON.parse(req.file.buffer.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON file: ' + err.message });
  }


  const currentAdmin = await Admin.findById(req.admin.id).lean();
  await Admin.deleteMany({ _id: { $ne: currentAdmin?._id } });
  await Department.deleteMany({});
  await Employee.deleteMany({});
  await Salary.deleteMany({});
  await Payroll.deleteMany({});
  await Payslip.deleteMany({});
  await Attendance.deleteMany({});
  await LeaveRequest.deleteMany({});
  await SalaryRevision.deleteMany({});
  await Notification.deleteMany({});
  await ActivityLog.deleteMany({});
  await CompanySetting.deleteMany({});

  if (data.admins?.length) {
    const currentId = String(currentAdmin?._id || '');
    const adminsToRestore = data.admins.filter(admin => String(admin._id) !== currentId);
    if (adminsToRestore.length) await Admin.insertMany(adminsToRestore);
  }
  if (data.departments?.length) await Department.insertMany(data.departments);
  if (data.employees?.length) await Employee.insertMany(data.employees);
  if (data.salaries?.length) await Salary.insertMany(data.salaries);
  if (data.payrolls?.length) await Payroll.insertMany(data.payrolls);
  if (data.payslips?.length) await Payslip.insertMany(data.payslips);
  if (data.attendance?.length) await Attendance.insertMany(data.attendance);
  if (data.leaves?.length) await LeaveRequest.insertMany(data.leaves);
  if (data.revisions?.length) await SalaryRevision.insertMany(data.revisions);
  if (data.notifications?.length) await Notification.insertMany(data.notifications);
  if (data.activity?.length) await ActivityLog.insertMany(data.activity);
  if (data.settings?.length) await CompanySetting.insertMany(data.settings);


  await log(req.admin.id, 'restored database from backup', 'system', null);
  res.json({ success: true });
}));


module.exports = router;