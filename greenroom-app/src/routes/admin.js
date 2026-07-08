const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, email, display_name, is_admin, is_banned, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users: rows.map(u => ({
    id: u.id, email: u.email, displayName: u.display_name,
    isAdmin: !!u.is_admin, isBanned: !!u.is_banned, createdAt: u.created_at
  })) });
});

router.post('/users/:id/ban', (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't ban your own account." });
  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/unban', (req, res) => {
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/gallery', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.tagline, c.fandom, c.color, u.display_name AS author, u.id AS author_id
    FROM characters c JOIN users u ON u.id = c.owner_id
    WHERE c.is_public = 1
    ORDER BY c.created_at DESC
  `).all();
  res.json({ gallery: rows.map(r => ({
    id: r.id, name: r.name, tagline: r.tagline, fandom: r.fandom, color: r.color,
    author: r.author, authorId: r.author_id
  })) });
});

router.delete('/gallery/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM characters WHERE id = ? AND is_public = 1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found in the public gallery.' });
  db.prepare('UPDATE characters SET is_public = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
