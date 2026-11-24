const jwt = require('jsonwebtoken');

function requireAdmin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!['admin', 'hr', 'payroll_manager', 'department_manager', 'employee'].includes(payload.role)) return res.status(403).json({ error: 'This account does not have an allowed workspace role.' });
    req.admin = payload;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired session.' }); }
}
function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.admin?.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action.' });
}
module.exports = { requireAdmin, requireRoles };
