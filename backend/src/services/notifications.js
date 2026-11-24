const nodemailer = require('nodemailer');
const { Notification, Admin } = require('../models');

function transporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
}

async function notifyRoles(roles, { title, message, category = 'general', link = null, email = true }) {
  const roleList = Array.isArray(roles) ? roles : [roles];
  const recipients = await Admin.find({ role: { $in: roleList } }).select('_id email fullName');
  await Promise.all(recipients.map(user => Notification.create({ adminId: user._id, title, message, category, link })));
  const mailer = email ? transporter() : null;
  if (mailer && recipients.length) {
    try {
      await mailer.sendMail({ from: process.env.SMTP_FROM, to: recipients.map(user => user.email).join(','), subject: title, text: message });
    } catch (error) { console.error('Notification email failed:', error.message); }
  }
  return recipients.length;
}

async function notifyAccount(adminId, { title, message, category = 'general', link = null, email = true }) {
  const user = await Admin.findById(adminId);
  if (!user) return false;
  await Notification.create({ adminId: user._id, title, message, category, link });
  const mailer = email ? transporter() : null;
  if (mailer) {
    try { await mailer.sendMail({ from: process.env.SMTP_FROM, to: user.email, subject: title, text: message }); }
    catch (error) { console.error('Notification email failed:', error.message); }
  }
  return true;
}

module.exports = { notifyRoles, notifyAccount };