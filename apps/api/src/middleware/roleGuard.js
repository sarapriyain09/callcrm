export function getRole(req) {
  const role = String(req.header('x-callcrm-role') || 'agent').toLowerCase();
  if (role === 'admin' || role === 'agent') return role;
  return 'agent';
}

export function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = getRole(req);
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: `Access denied for role '${role}'. Allowed roles: ${allowedRoles.join(', ')}`
      });
    }

    req.callcrmRole = role;
    return next();
  };
}
