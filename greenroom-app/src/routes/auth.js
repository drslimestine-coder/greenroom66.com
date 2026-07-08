const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.display_name, isAdmin: !!u.is_admin };
}

router.post('/register', (req, res) => {
  const { email, password, displayName, adminCode } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists. Try logging in instead.' });

  const isAdmin = !!(process.env.ADMIN_CLAIM_CODE && adminCode && adminCode === process.env.ADMIN_CLAIM_CODE);

  const user = {
    id: uuidv4(),
    email: cleanEmail,
    password_hash: bcrypt.hashSync(password, 12),
    display_name: (displayName || cleanEmail.split('@')[0]).slice(0, 40),
    is_admin: isAdmin ? 1 : 0,
    is_banned: 0,
    created_at: Date.now()
  };
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, is_admin, is_banned, created_at)
              VALUES (@id, @email, @password_hash, @display_name, @is_admin, @is_banned, @created_at)`).run(user);

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  if (user.is_banned) return res.status(403).json({ error: 'This account has been banned.' });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, displayName: req.user.display_name, isAdmin: !!req.user.is_admin } });
});

module.exports = router;
