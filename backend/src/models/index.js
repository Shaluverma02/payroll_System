const mongoose = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret.__v;
      return ret;
    }
  }
};

const adminSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin', enum: ['admin', 'hr', 'payroll_manager', 'department_manager', 'employee'] },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  twoFactorSecret: { type: String, default: null },
  twoFactorEnabled: { type: Boolean, default: false }
}, schemaOptions);

const departmentSchema = new mongoose.Schema({
  departmentId: { type: String, required: true, unique: true, trim: true },
  departmentName: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  managerName: { type: String, default: '' }
}, schemaOptions);

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  gender: { type: String, default: '' },
  dateOfBirth: { type: String, default: '' },
  designation: { type: String, default: '' },
  joiningDate: { type: String, default: '' },
  address: { type: String, default: '' },
  bankAccountNumber: { type: String, default: '' },
  ifscCode: { type: String, default: '' },
  panNumber: { type: String, default: '' },
  employmentStatus: { type: String, enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }
}, schemaOptions);

employeeSchema.virtual('Department', {
  ref: 'Department',
  localField: 'departmentId',
  foreignField: '_id',
  justOne: true
});

employeeSchema.virtual('Salary', {
  ref: 'Salary',
  localField: '_id',
  foreignField: 'employeeId',
  justOne: true
});

employeeSchema.virtual('Payrolls', {
  ref: 'Payroll',
  localField: '_id',
  foreignField: 'employeeId'
});

const attendanceSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  attendanceDate: { type: String, required: true },
  status: { type: String, enum: ['Present', 'Absent', 'Paid Leave', 'Unpaid Leave'], required: true },
  overtimeHours: { type: Number, default: 0 },
  notes: { type: String, default: '' }
}, schemaOptions);
attendanceSchema.index({ employeeId: 1, attendanceDate: 1 }, { unique: true });

attendanceSchema.virtual('Employee', {
  ref: 'Employee',
  localField: 'employeeId',
  foreignField: '_id',
  justOne: true
});

const salarySchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
  basicSalary: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  allowances: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  overtimeRate: { type: Number, default: 0 },
  providentFund: { type: Number, default: 0 },
  professionalTax: { type: Number, default: 0 },
  incomeTax: { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 }
}, schemaOptions);

salarySchema.virtual('Employee', {
  ref: 'Employee',
  localField: 'employeeId',
  foreignField: '_id',
  justOne: true
});

const payrollSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  presentDays: { type: Number, default: 0 },
  unpaidLeaveDays: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  grossSalary: { type: Number, required: true },
  totalDeductions: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  earnings: { type: mongoose.Schema.Types.Mixed, default: {} },
  deductions: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['Pending', 'Paid', 'Cancelled'], default: 'Pending' },
  approvalStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  approvedAt: { type: Date, default: null },
  approvalNote: { type: String, default: null },
  paymentDate: { type: String, default: null }
}, schemaOptions);
payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

payrollSchema.virtual('Employee', {
  ref: 'Employee',
  localField: 'employeeId',
  foreignField: '_id',
  justOne: true
});

payrollSchema.virtual('Approver', {
  ref: 'Admin',
  localField: 'approvedBy',
  foreignField: '_id',
  justOne: true
});

const payslipSchema = new mongoose.Schema({
  payrollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll', required: true, unique: true },
  pdfPath: { type: String, default: '' }
}, schemaOptions);

payslipSchema.virtual('Payroll', {
  ref: 'Payroll',
  localField: 'payrollId',
  foreignField: '_id',
  justOne: true
});

const activityLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  action: { type: String, required: true },
  entityType: { type: String, default: '' },
  entityId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, schemaOptions);

activityLogSchema.virtual('Admin', {
  ref: 'Admin',
  localField: 'adminId',
  foreignField: '_id',
  justOne: true
});

const leaveRequestSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  leaveType: { type: String, enum: ['Paid', 'Unpaid', 'Sick', 'Personal'], required: true },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  reviewerNote: { type: String, default: null }
}, schemaOptions);

leaveRequestSchema.virtual('Employee', {
  ref: 'Employee',
  localField: 'employeeId',
  foreignField: '_id',
  justOne: true
});

const salaryRevisionSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  effectiveDate: { type: String, required: true },
  reason: { type: String, default: '' },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }
}, schemaOptions);

const notificationSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  category: { type: String, default: 'general' },
  readAt: { type: Date, default: null },
  link: { type: String, default: '' }
}, schemaOptions);

const companySettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, schemaOptions);

const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
const Salary = mongoose.models.Salary || mongoose.model('Salary', salarySchema);
const Payroll = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema);
const Payslip = mongoose.models.Payslip || mongoose.model('Payslip', payslipSchema);
const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);
const LeaveRequest = mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', leaveRequestSchema);
const SalaryRevision = mongoose.models.SalaryRevision || mongoose.model('SalaryRevision', salaryRevisionSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const CompanySetting = mongoose.models.CompanySetting || mongoose.model('CompanySetting', companySettingSchema);

module.exports = {
  mongoose,
  Admin,
  Department,
  Employee,
  Attendance,
  Salary,
  Payroll,
  Payslip,
  ActivityLog,
  LeaveRequest,
  SalaryRevision,
  Notification,
  CompanySetting
};
