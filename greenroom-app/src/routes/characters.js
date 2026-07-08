const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function toClient(c) {
  return {
    id: c.id, type: c.type, name: c.name, tagline: c.tagline, fandom: c.fandom,
    description: c.description, color: c.color, public: !!c.is_public
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM characters WHERE owner_id = ? ORDER BY created_at ASC').all(req.user.id);
  res.json({ characters: rows.map(toClient) });
});

router.post('/', (req, res) => {
  const { type, name, tagline, fandom, description, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name is required.' });
  if (!['persona', 'character'].includes(type)) return res.status(400).json({ error: 'Invalid character type.' });

  const row = {
    id: uuidv4(), owner_id: req.user.id, type,
    name: name.trim().slice(0, 60), tagline: (tagline || '').slice(0, 80),
    fandom: (fandom || '').slice(0, 50), description: (description || '').slice(0, 1200),
    color: color || '#c9a24b', is_public: 0, created_at: Date.now()
  };
  db.prepare(`INSERT INTO characters (id, owner_id, type, name, tagline, fandom, description, color, is_public, created_at)
              VALUES (@id, @owner_id, @type, @name, @tagline, @fandom, @description, @color, @is_public, @created_at)`).run(row);
  res.json({ character: toClient(row) });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM characters WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Character not found.' });

  const { name, tagline, fandom, description, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'A name is required.' });

  db.prepare(`UPDATE characters SET name=?, tagline=?, fandom=?, description=?, color=? WHERE id=?`)
    .run(name.trim().slice(0, 60), (tagline || '').slice(0, 80), (fandom || '').slice(0, 50), (description || '').slice(0, 1200), color || existing.color, req.params.id);

  const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  res.json({ character: toClient(updated) });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM characters WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Character not found.' });
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM messages WHERE owner_id = ? AND (persona_id = ? OR character_id = ?)').run(req.user.id, req.params.id, req.params.id);
  res.json({ ok: true });
});

router.post('/:id/publish', (req, res) => {
  const existing = db.prepare('SELECT * FROM characters WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Character not found.' });
  if (existing.type !== 'character') return res.status(400).json({ error: 'Only characters (not personas) can be published.' });

  const next = existing.is_public ? 0 : 1;
  db.prepare('UPDATE characters SET is_public = ? WHERE id = ?').run(next, req.params.id);
  res.json({ public: !!next });
});

module.exports = router;
