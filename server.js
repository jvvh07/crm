const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Helper to run queries with promises
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// ── LEADS ──────────────────────────────────────────────────────────────────

app.get('/api/leads', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM leads");
    // Parse tags JSON string back to array
    const leads = rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }));
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads', async (req, res) => {
  const l = req.body;
  const tags = JSON.stringify(l.tags || []);
  try {
    await dbRun(`INSERT INTO leads (id, firstName, lastName, fullName, role, email, phone, company, segment, dealValue, stage, source, closingDate, notes, heatScore, owner, createdAt, updatedAt, tags) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
    [l.id, l.firstName, l.lastName, l.fullName, l.role, l.email, l.phone, l.company, l.segment, l.dealValue, l.stage, l.source, l.closingDate, l.notes, l.heatScore, l.owner, l.createdAt, l.updatedAt, tags]);
    res.status(201).json({ id: l.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  const id = req.params.id;
  const l = req.body;
  const tags = JSON.stringify(l.tags || []);
  try {
    await dbRun(`UPDATE leads SET firstName=?, lastName=?, fullName=?, role=?, email=?, phone=?, company=?, segment=?, dealValue=?, stage=?, source=?, closingDate=?, notes=?, heatScore=?, owner=?, updatedAt=?, tags=? WHERE id=?`,
    [l.firstName, l.lastName, l.fullName, l.role, l.email, l.phone, l.company, l.segment, l.dealValue, l.stage, l.source, l.closingDate, l.notes, l.heatScore, l.owner, l.updatedAt, tags, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM leads WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TASKS ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await dbAll("SELECT * FROM tasks");
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const t = req.body;
  try {
    await dbRun(`INSERT INTO tasks (id, title, company, type, date, time, owner, status, leadId, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.id, t.title, t.company, t.type, t.date, t.time, t.owner, t.status, t.leadId, t.notes]);
    res.status(201).json({ id: t.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const t = req.body;
  try {
    await dbRun(`UPDATE tasks SET title=?, company=?, type=?, date=?, time=?, owner=?, status=?, notes=? WHERE id=?`,
    [t.title, t.company, t.type, t.date, t.time, t.owner, t.status, t.notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM tasks WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SETTINGS ───────────────────────────────────────────────────────────────

app.get('/api/settings', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM settings");
    const settings = {};
    rows.forEach(r => {
      // Try to parse as JSON if it looks like an object/array, otherwise keep as string/number
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch {
        settings[r.key] = r.value;
      }
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings/:key', async (req, res) => {
  const key = req.params.key;
  const value = typeof req.body.value === 'object' ? JSON.stringify(req.body.value) : req.body.value.toString();
  try {
    await dbRun(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUTOMATIONS ────────────────────────────────────────────────────────────

app.get('/api/automations', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM automations");
    const automations = rows.map(r => ({
      ...r,
      active: !!r.active,
      steps: JSON.parse(r.steps || '[]')
    }));
    res.json(automations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/automations', async (req, res) => {
  const a = req.body;
  try {
    await dbRun(`INSERT INTO automations (id, title, active, steps) VALUES (?, ?, ?, ?)`,
    [a.id, a.title, a.active ? 1 : 0, JSON.stringify(a.steps || [])]);
    res.status(201).json({ id: a.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/automations/:id', async (req, res) => {
  const a = req.body;
  try {
    await dbRun(`UPDATE automations SET title=?, active=?, steps=? WHERE id=?`,
    [a.title, a.active ? 1 : 0, JSON.stringify(a.steps || []), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM automations WHERE id=?", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`IBEX CRM Backend running at http://localhost:${PORT}`);
});
