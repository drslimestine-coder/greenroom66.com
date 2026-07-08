const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function getOwnedCharacter(id, ownerId) {
  return db.prepare('SELECT * FROM characters WHERE id = ? AND owner_id = ?').get(id, ownerId);
}

router.get('/:personaId/:characterId', (req, res) => {
  const { personaId, characterId } = req.params;
  const persona = getOwnedCharacter(personaId, req.user.id);
  const character = getOwnedCharacter(characterId, req.user.id);
  if (!persona || !character) return res.status(404).json({ error: 'Persona or character not found in your cast.' });

  const rows = db.prepare(`SELECT role, content FROM messages
    WHERE owner_id = ? AND persona_id = ? AND character_id = ? ORDER BY created_at ASC`).all(req.user.id, personaId, characterId);
  res.json({ messages: rows });
});

router.post('/:personaId/:characterId/message', async (req, res) => {
  const { personaId, characterId } = req.params;
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });

  const persona = getOwnedCharacter(personaId, req.user.id);
  const character = getOwnedCharacter(characterId, req.user.id);
  if (!persona || !character) return res.status(404).json({ error: 'Persona or character not found in your cast.' });

  const now = Date.now();
  db.prepare(`INSERT INTO messages (id, owner_id, persona_id, character_id, role, content, created_at)
              VALUES (?, ?, ?, ?, 'user', ?, ?)`).run(uuidv4(), req.user.id, personaId, characterId, content.trim(), now);

  const history = db.prepare(`SELECT role, content FROM messages
    WHERE owner_id = ? AND persona_id = ? AND character_id = ? ORDER BY created_at ASC`).all(req.user.id, personaId, characterId);

  const systemPrompt = `You are playing the character "${character.name}" in an immersive, ongoing roleplay scene.
Character source: ${character.fandom || 'Original character'}.
Character personality and background: ${character.description || 'No further details provided; infer a fitting personality from the name and source.'}

The user is playing their own persona named "${persona.name}". Persona background: ${persona.description || 'No further details provided.'}

Stay fully and consistently in character as ${character.name} at all times. Never break character, never mention being an AI or a language model. Write vivid, in-character dialogue and brief action description (you may use *asterisks* for actions). Keep replies to a natural conversational length - a few sentences to a short paragraph. React to what the persona says and drive the scene forward.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: history.map(m => ({ role: m.role, content: m.content }))
      })
    });
    const data = await apiRes.json();
    if (!apiRes.ok) {
      console.error('Anthropic API error:', data);
      return res.status(502).json({ error: 'The scene stalled - the AI service returned an error.' });
    }
    let replyText = (data.content || []).map(b => b.type === 'text' ? b.text : '').join('\n').trim() || '...';

    db.prepare(`INSERT INTO messages (id, owner_id, persona_id, character_id, role, content, created_at)
                VALUES (?, ?, ?, ?, 'assistant', ?, ?)`).run(uuidv4(), req.user.id, personaId, characterId, replyText, Date.now());

    const updated = db.prepare(`SELECT role, content FROM messages
      WHERE owner_id = ? AND persona_id = ? AND character_id = ? ORDER BY created_at ASC`).all(req.user.id, personaId, characterId);
    res.json({ messages: updated });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(502).json({ error: 'The scene stalled - could not reach the AI service.' });
  }
});

module.exports = router;
