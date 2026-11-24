const express = require('express');
const { ActivityLog, Admin, Department, Employee, Notification, Payroll, Payslip } = require('../models');
const { generatePayroll } = require('../controllers/payrollController');
const { notifyAccount, notifyRoles } = require('../services/notifications');

const router = express.Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const payrollRoles = ['admin', 'payroll_manager'];

router.get('/', asyncRoute(async (req, res) => {
  const query = {};
  if (req.query.month) query.month = Number(req.query.month);
  if (req.query.year) query.year = Number(req.query.year);
  if (req.query.status) query.status = req.query.status;

  if (req.admin.role === 'employee') {
    if (!req.admin.employeeId) return res.status(403).json({ error: 'Link your login to an employee profile to access payslips.' });
    query.employeeId = req.admin.employeeId;
  } else if (req.admin.role === 'department_manager') {
    const manager = await Employee.findById(req.admin.employeeId);
    if (!manager?.departmentId) return res.status(403).json({ error: 'Link this manager account to a department employee profile.' });
    const team = await Employee.find({ departmentId: manager.departmentId }).select('_id');
    query.employeeId = { $in: team.map(e => e._id) };
  } else if (!['admin', 'hr', 'payroll_manager'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Payroll access is restricted.' });
  } else if (req.query.departmentId) {
    const deptEmployees = await Employee.find({ departmentId: req.query.departmentId }).select('_id');
    query.employeeId = { $in: deptEmployees.map(e => e._id) };
  }

  if (req.query.employeeId) {
    if (query.employeeId && query.employeeId.$in) {
      query.employeeId = { $in: query.employeeId.$in.filter(id => id.toString() === String(req.query.employeeId)) };
    } else {
      query.employeeId = req.query.employeeId;
    }
  }

  const items = await Payroll.find(query)
    .populate({ path: 'Employee', populate: { path: 'Department' } })
    .sort({ year: -1, month: -1, createdAt: -1 })
    .limit(500);

  res.json(items);
}));

router.post('/', asyncRoute(async (req, res) => {
  if (!payrollRoles.includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can generate payroll.' });
  const item = await generatePayroll(req.body, req.admin.id);
  res.status(201).json(item);
}));

router.put('/:id', asyncRoute(async (req, res) => {
  if (!payrollRoles.includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can update payments.' });
  const item = await Payroll.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Payroll record not found.' });
  if (!['Pending', 'Paid', 'Cancelled'].includes(req.body.status)) return res.status(400).json({ error: 'Choose Pending, Paid, or Cancelled.' });
  if (req.body.status === 'Paid' && item.approvalStatus !== 'Approved') return res.status(409).json({ error: 'Payroll must be approved before it can be marked paid.' });

  item.status = req.body.status;
  item.paymentDate = req.body.status === 'Paid' ? (req.body.paymentDate || new Date().toISOString().slice(0, 10)) : null;
  await item.save();

  ActivityLog.create({ adminId: req.admin.id, action: 'updated status', entityType: 'payroll', entityId: item._id.toString(), details: { status: item.status } }).catch(() => {});

  if (item.status === 'Paid') {
    const employeeUser = await Admin.findOne({ employeeId: item.employeeId, role: 'employee' });
    if (employeeUser) {
      await notifyAccount(employeeUser._id, {
        title: 'Payslip is ready',
        message: `Your ${item.month}/${item.year} payroll has been paid. Your payslip is available in the employee portal.`,
        category: 'payroll',
        link: `/payslips/${item._id}`
      });
    }
  }

  res.json(item);
}));

router.put('/:id/approval', asyncRoute(async (req, res) => {
  if (!payrollRoles.includes(req.admin.role)) return res.status(403).json({ error: 'Only administrators or payroll managers can review payroll.' });
  const item = await Payroll.findById(req.params.id).populate('Employee');
  if (!item) return res.status(404).json({ error: 'Payroll record not found.' });
  if (!['Approved', 'Rejected'].includes(req.body.approvalStatus)) return res.status(400).json({ error: 'Approval status must be Approved or Rejected.' });
  if (item.status !== 'Pending') return res.status(409).json({ error: 'Only unpaid payroll can be approved or rejected.' });

  item.approvalStatus = req.body.approvalStatus;
  item.approvedBy = req.admin.id;
  item.approvedAt = new Date();
  item.approvalNote = String(req.body.approvalNote || '').slice(0, 500) || null;
  await item.save();

  await ActivityLog.create({ adminId: req.admin.id, action: `payroll ${item.approvalStatus.toLowerCase()}`, entityType: 'payroll', entityId: item._id.toString(), details: { note: item.approvalNote } });

  const employees = await Admin.find({ employeeId: item.employeeId });
  await Promise.all(employees.map(user => Notification.create({
    adminId: user._id,
    title: `Payroll ${item.approvalStatus.toLowerCase()}`,
    message: `Your ${item.month}/${item.year} payroll was ${item.approvalStatus.toLowerCase()}.`,
    category: 'payroll',
    link: `/payslips/${item._id}`
  })));

  await notifyRoles(['admin', 'payroll_manager'], {
    title: 'Payroll approval updated',
    message: `Payroll ${item._id} was ${item.approvalStatus.toLowerCase()}.`,
    category: 'payroll',
    link: '/payroll',
    email: false
  });

  res.json(item);
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  if (!payrollRoles.includes(req.admin.role)) return res.status(403).json({ error: 'Only payroll managers can delete payroll.' });
  const item = await Payroll.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: 'Payroll record not found.' });
  await Payslip.deleteMany({ payrollId: item._id });
  res.status(204).end();
}));

module.exports = router;