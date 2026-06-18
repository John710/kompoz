const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { scanCidr, getScanProgress } = require('../utils/network-scanner');
const { checkDevice, checkAll } = require('../utils/status-checker');

// Guard: network features require DATABASE_URL
router.use((req, res, next) => {
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'Database not configured. Set DATABASE_URL environment variable.' });
  }
  next();
});

// POST /api/network/scan
router.post('/scan', async (req, res) => {
  try {
    const { cidr } = req.body || {};
    if (!cidr) return res.status(400).json({ error: 'CIDR is required' });

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
    const { status, type, online } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (type) {
      conditions.push(`type = $${idx++}`);
      params.push(type);
    }
    if (online !== undefined) {
      conditions.push(`online = $${idx++}`);
      params.push(online === 'true');
    }

    let sql = 'SELECT * FROM network_devices';
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
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
      await db.query(
        `UPDATE network_devices SET
          name = $1, type = $2, status = $3, x = $4, y = $5, notes = $6,
          check_method = $7, check_target = $8, properties = $9, mac = $10, ports = $11, vendor = $12,
          os = $13, banners = $14, hostname_mdns = $15, hostname_netbios = $16,
          updated_at = NOW()
         WHERE id = $17`,
        [
          d.name, d.device_type || d.type, d.status, d.x, d.y, d.notes,
          d.check_method, d.check_target,
          JSON.stringify(d.properties || []),
          d.mac || null,
          d.ports || [],
          d.vendor || null,
          d.os || null,
          d.banners ? JSON.stringify(d.banners) : null,
          d.hostname_mdns || null,
          d.hostname_netbios || null,
          d.id
        ]
      );
      res.json({ ok: true, id: d.id });
    } else {
      const { rows } = await db.query(
        `INSERT INTO network_devices
          (ip, mac, name, type, status, x, y, notes, check_method, check_target, properties, ports, vendor, os, banners, hostname_mdns, hostname_netbios)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          d.ip, d.mac || null, d.name || '', d.device_type || d.type || 'unknown', d.status || 'pending',
          d.x || 0, d.y || 0, d.notes || '',
          d.check_method || 'ping', d.check_target || null,
          JSON.stringify(d.properties || []),
          d.ports || [],
          d.vendor || null,
          d.os || null,
          d.banners ? JSON.stringify(d.banners) : null,
          d.hostname_mdns || null,
          d.hostname_netbios || null
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
    await db.query('DELETE FROM network_links WHERE source_id = $1 OR target_id = $1', [req.params.id]);
    await db.query('DELETE FROM network_devices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/network/clear-map
router.post('/clear-map', async (req, res) => {
  try {
    const { option } = req.body;
    if (option === 'all') {
      // Clear all network data
      await db.query('DELETE FROM network_links');
      await db.query('DELETE FROM network_devices');
      await db.query('DELETE FROM network_scan_history');
    } else if (option === 'devices') {
      // Clear only mapped devices and links
      await db.query(
        "DELETE FROM network_links WHERE source_id IN (SELECT id FROM network_devices WHERE status = 'mapped') OR target_id IN (SELECT id FROM network_devices WHERE status = 'mapped')"
      );
      await db.query("DELETE FROM network_devices WHERE status = 'mapped'");
    } else if (option === 'history') {
      // Clear only scan history
      await db.query('DELETE FROM network_scan_history');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/network/links
router.get('/links', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM network_links ORDER BY created_at DESC');
    // Convert snake_case to camelCase for client-side friendly
    const links = rows.map(link => ({
      ...link,
      sourcePos: link.source_pos,
      targetPos: link.target_pos
    }));
    res.json({ links });
  } catch (err) {
    console.error('server GET /links error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/network/links
router.post('/links', async (req, res) => {
  try {
    const d = req.body || {};
    if (d.id) {
      await db.query(
        'UPDATE network_links SET source_id = $1, target_id = $2, type = $3, label = $4, waypoints = $5, source_pos = $6, target_pos = $7 WHERE id = $8',
        [d.source_id, d.target_id, d.type, d.label, JSON.stringify(d.waypoints || []), d.sourcePos || null, d.targetPos || null, d.id]
      );
      res.json({ ok: true, id: d.id });
    } else {
      const { rows } = await db.query(
        'INSERT INTO network_links (source_id, target_id, type, label, waypoints, source_pos, target_pos) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [d.source_id, d.target_id, d.type || 'ethernet', d.label || d.type || '', JSON.stringify(d.waypoints || []), d.sourcePos || null, d.targetPos || null]
      );
      res.json({ ok: true, id: rows[0].id });
    }
  } catch (err) {
    console.error('server POST /links error:', err);
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
      // Check ALL devices (both pending and mapped)
      const { rows: allDevices } = await db.query('SELECT * FROM network_devices');
      const results = [];
      for (const device of allDevices) {
        const online = await checkDevice(device);
        await db.query('UPDATE network_devices SET online = $1, updated_at = NOW() WHERE id = $2', [online, device.id]);
        results.push({ id: device.id, online });
      }
      res.json({ ok: true, message: 'All devices checked', results });
    }
  } catch (err) {
    console.error('server POST /check-status error:', err);
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

// Settings endpoints
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM settings WHERE key LIKE $1', ['statusCheckInterval']);
    const setting = rows[0];
    res.json({ interval: setting ? parseInt(setting.value, 10) : 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { interval } = req.body;
    await db.query(`
      INSERT INTO settings (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, ['statusCheckInterval', String(interval)]);
    res.json({ ok: true, interval });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
