const jwt = require('jsonwebtoken');
const db = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  const user = db.prepare('SELECT id, email, display_name, is_admin, is_banned FROM users WHERE id = ?').get(payload.userId);
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
  if (user.is_banned) return res.status(403).json({ error: 'This account has been banned.' });

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
