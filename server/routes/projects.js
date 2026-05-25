const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { getAllProjects, getProjectDir, canCreateProjects, safeResolvePath } = require('../utils/fs');

const router = express.Router();

// GET /api/projects
router.get('/', (req, res) => {
  try {
    const projects = getAllProjects();
    const { can }  = canCreateProjects();
    res.json({ projects, canCreate: can });
  } catch (err) {
    res.status(500).json({ error: err.message, errorKey: 'errorLoadProjects' });
  }
});

// POST /api/projects
router.post('/', (req, res) => {
  try {
    const { can, mountRoot } = canCreateProjects();
    if (!can) return res.status(400).json({ error: 'No available multi-mode mount point.', errorKey: 'errNoMount' });

    const { name } = req.body;
    if (!name || !/^[a-zA-Z0_\-]+$/.test(name))
      return res.status(400).json({ error: 'Invalid name.', errorKey: 'errInvalidName' });

    const projectDir = safeResolvePath(mountRoot, name);
    if (fs.existsSync(projectDir)) return res.status(409).json({ error: 'Project already exists.', errorKey: 'errProjectExists' });

    fs.mkdirSync(path.join(projectDir, 'compose'), { recursive: true });
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message, errorKey: 'errorDelete' });
  }
});

// DELETE /api/projects/:name
router.delete('/:name', (req, res) => {
  try {
    const { name } = req.params;
    let dir;
    try { dir = getProjectDir(name); } catch { return res.status(404).json({ error: 'Project not found.', errorKey: 'errProjectNotFound' }); }

    const projects = getAllProjects();
    const proj = projects.find(p => p.name === name);
    if (proj?.direct) return res.status(400).json({ error: 'Cannot delete direct-mode project.', errorKey: 'errCantDeleteDirect' });

    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message, errorKey: 'errorDelete' });
  }
});

module.exports = router;
