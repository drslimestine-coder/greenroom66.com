const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.tagline, c.fandom, c.description, c.color, u.display_name AS author, u.id AS author_id
    FROM characters c
    JOIN users u ON u.id = c.owner_id
    WHERE c.is_public = 1 AND u.is_banned = 0
    ORDER BY c.created_at DESC
  `).all();
  res.json({ gallery: rows.map(r => ({
    id: r.id, name: r.name, tagline: r.tagline, fandom: r.fandom,
    description: r.description, color: r.color, author: r.author, authorId: r.author_id
  })) });
});

router.post('/:id/add', (req, res) => {
  const source = db.prepare(`
    SELECT c.* FROM characters c JOIN users u ON u.id = c.owner_id
    WHERE c.id = ? AND c.is_public = 1 AND u.is_banned = 0
  `).get(req.params.id);
  if (!source) return res.status(404).json({ error: 'That character is no longer available.' });

  const row = {
    id: uuidv4(), owner_id: req.user.id, type: 'character',
    name: source.name, tagline: source.tagline, fandom: source.fandom,
    description: source.description, color: source.color, is_public: 0, created_at: Date.now()
  };
  db.prepare(`INSERT INTO characters (id, owner_id, type, name, tagline, fandom, description, color, is_public, created_at)
              VALUES (@id, @owner_id, @type, @name, @tagline, @fandom, @description, @color, @is_public, @created_at)`).run(row);
  res.json({ ok: true, name: source.name });
});

module.exports = router;
