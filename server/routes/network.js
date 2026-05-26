const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { scanCidr, getScanProgress } = require('../utils/network-scanner');
const { checkDevice, checkAll } = require('../utils/status-checker');

// POST /api/network/scan
router.post('/scan', async (req, res) => {
  try {
    const { cidr } = req.body || {};
    if (!cidr) return res.status(400).json({ error: 'CIDR is required' });

    // Run scan in background
    scanCidr(cidr)
      .then(() => console.log('Scan completed for', cidr))
      .catch(err => console.error('Scan error:', err.message));

    res.json({ ok: true, message: 'Scan started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/network/scan-status
router.get('/scan-status', (req, res) => {
  res.json(getScanProgress());
});

// GET /api/network/devices
router.get('/devices', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM network_devices';
    const params = [];
    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await db.query(sql, params);
    res.json({ devices: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/network/devices
router.post('/devices', async (req, res) => {
  try {
    const d = req.body || {};
    if (d.id) {
      // Update existing
      await db.query(
        `UPDATE network_devices SET
          name = $1, type = $2, status = $3, x = $4, y = $5, notes = $6,
          check_method = $7, check_target = $8, properties = $9, updated_at = NOW()
         WHERE id = $10`,
        [
          d.name, d.type, d.status, d.x, d.y, d.notes,
          d.check_method, d.check_target,
          JSON.stringify(d.properties || []),
          d.id
        ]
      );
      res.json({ ok: true, id: d.id });
    } else {
      // Create new
      const { rows } = await db.query(
        `INSERT INTO network_devices
          (ip, mac, name, type, status, x, y, notes, check_method, check_target, properties, ports)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          d.ip, d.mac || null, d.name || '', d.type || 'unknown', d.status || 'pending',
          d.x || 0, d.y || 0, d.notes || '',
          d.check_method || 'ping', d.check_target || null,
          JSON.stringify(d.properties || []),
          d.ports || []
        ]
      );
      res.json({ ok: true, id: rows[0].id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/network/devices/:id
router.delete('/devices/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM network_devices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/network/links
router.post('/links', async (req, res) => {
  try {
    const d = req.body || {};
    if (d.id) {
      await db.query(
        'UPDATE network_links SET source_id = $1, target_id = $2, type = $3, label = $4 WHERE id = $5',
        [d.source_id, d.target_id, d.type, d.label, d.id]
      );
      res.json({ ok: true, id: d.id });
    } else {
      const { rows } = await db.query(
        'INSERT INTO network_links (source_id, target_id, type, label) VALUES ($1, $2, $3, $4) RETURNING id',
        [d.source_id, d.target_id, d.type || 'ethernet', d.label || '']
      );
      res.json({ ok: true, id: rows[0].id });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/network/links/:id
router.delete('/links/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM network_links WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/network/check-status
router.post('/check-status', async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (ids && Array.isArray(ids)) {
      const results = [];
      for (const id of ids) {
        const { rows } = await db.query('SELECT * FROM network_devices WHERE id = $1', [id]);
        if (rows.length > 0) {
          const online = await checkDevice(rows[0]);
          await db.query('UPDATE network_devices SET online = $1, updated_at = NOW() WHERE id = $2', [online, id]);
          results.push({ id, online });
        }
      }
      res.json({ results });
    } else {
      await checkAll();
      res.json({ ok: true, message: 'All devices checked' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/network/scan-history
router.get('/scan-history', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM network_scan_history ORDER BY started_at DESC LIMIT 20'
    );
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
