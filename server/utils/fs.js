const fs   = require('fs');
const path = require('path');

// COMPOSE_MOUNTS — запятая-разделённый список путей внутри контейнера.
// Каждый путь — либо direct-проект (содержит yml/compose//.env),
// либо папка с подпапками-проектами (multi mode).
// Можно задать кастомное имя через | : /mnt/docker|my-stack
// Пример: COMPOSE_MOUNTS=/mnt/docker|docker-stack,/mnt/server
// Если не задан — используем COMPOSE_ROOT (legacy).
const COMPOSE_ROOT   = process.env.COMPOSE_ROOT   || '/compose';
const COMPOSE_MOUNTS = process.env.COMPOSE_MOUNTS || '';

const YAML_RE = /\.(yml|yaml)$/;

// Признаки direct-проекта в папке
function isDirectProject(dir) {
  if (!fs.existsSync(dir)) return false;
  if (fs.existsSync(path.join(dir, '.env'))) return true;
  if (fs.existsSync(path.join(dir, 'compose')) && fs.statSync(path.join(dir, 'compose')).isDirectory()) return true;
  return fs.readdirSync(dir).some(e => YAML_RE.test(e) && fs.statSync(path.join(dir, e)).isFile());
}

// Возвращает список всех "монтируемых корней" (папок для поиска проектов)
function getMountRoots() {
  return getMountEntries().map(e => e.path);
}

// Возвращает записи маунтов с опциональными кастомными именами
function getMountEntries() {
  if (COMPOSE_MOUNTS) {
    return COMPOSE_MOUNTS.split(',').map(e => e.trim()).filter(Boolean).map(entry => {
      const pipeIdx = entry.indexOf('|');
      if (pipeIdx > 0) {
        return { path: entry.slice(0, pipeIdx).trim(), customName: entry.slice(pipeIdx + 1).trim() };
      }
      return { path: entry };
    });
  }
  return [{ path: COMPOSE_ROOT }];
}

// Возвращает плоский список всех проектов из всех маунт-точек
// Проект: { name, dir, fileCount, direct, mountRoot }
function getAllProjects() {
  const projects = [];
  const seen = new Set(); // защита от дублей по name

  for (const { path: mountRoot, customName } of getMountEntries()) {
    if (!fs.existsSync(mountRoot)) continue;

    if (isDirectProject(mountRoot)) {
      // Весь mountRoot — один проект
      const name = customName || path.basename(mountRoot);
      const uniqueName = seen.has(name) ? `${name}_${projects.length}` : name;
      seen.add(uniqueName);
      projects.push({
        name: uniqueName,
        dir: mountRoot,
        fileCount: countFiles(mountRoot),
        direct: true,
        mountRoot,
      });
    } else {
      // Подпапки внутри mountRoot — отдельные проекты
      let entries = [];
      try { entries = fs.readdirSync(mountRoot); } catch {}
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const full = path.join(mountRoot, entry);
        if (!fs.statSync(full).isDirectory()) continue;
        const uniqueName = seen.has(entry) ? `${entry}_${projects.length}` : entry;
        seen.add(uniqueName);
        projects.push({
          name: uniqueName,
          dir: full,
          fileCount: countFiles(full),
          direct: false,
          mountRoot,
        });
      }
    }
  }
  return projects;
}

// Находит директорию проекта по имени
function getProjectDir(projectName) {
  const all = getAllProjects();
  const found = all.find(p => p.name === projectName);
  if (!found) throw new Error(`Проект "${projectName}" не найден`);
  return found.dir;
}

// Может ли пользователь создавать новые проекты?
// Только если хотя бы один маунт является multi-mode
function canCreateProjects() {
  for (const { path: mountRoot } of getMountEntries()) {
    if (!fs.existsSync(mountRoot)) continue;
    if (!isDirectProject(mountRoot)) return { can: true, mountRoot };
  }
  return { can: false };
}

function countFiles(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return n;
  try {
    n += fs.readdirSync(dir).filter(f => YAML_RE.test(f) && fs.statSync(path.join(dir, f)).isFile()).length;
    if (fs.existsSync(path.join(dir, '.env'))) n++;
    const compose = path.join(dir, 'compose');
    if (fs.existsSync(compose)) n += fs.readdirSync(compose).filter(f => fs.statSync(path.join(compose, f)).isFile()).length;
    const appdata = path.join(dir, 'appdata');
    if (fs.existsSync(appdata)) n += fs.readdirSync(appdata).filter(f => fs.statSync(path.join(appdata, f)).isFile()).length;
    const secrets = path.join(dir, 'secrets');
    if (fs.existsSync(secrets)) n += fs.readdirSync(secrets).filter(f => fs.statSync(path.join(secrets, f)).isFile() && !f.endsWith('.bak')).length;
  } catch {}
  return n;
}

function safeResolvePath(base, filePath) {
  const baseResolved = path.resolve(base);
  const resolved = path.resolve(baseResolved, filePath);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) throw new Error('Path traversal detected');
  return resolved;
}


function listYamlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(e => YAML_RE.test(e) && fs.statSync(path.join(dir, e)).isFile());
}

module.exports = {
  getMountRoots, getMountEntries, getAllProjects, getProjectDir, canCreateProjects,
  safeResolvePath, listYamlFiles, countFiles, isDirectProject,
  COMPOSE_ROOT,
};
