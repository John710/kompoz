// parser.js — парсит compose YAML → граф

const Parser = (() => {

  function parseProject(files) {
    const services = {};
    const networks = {};
    const volumes  = {};
    const rawEdges = [];
    const envVars  = {};

    files.forEach(file => {
      if (file.type === 'env' || file.name.endsWith('.env')) {
        file.content.split('\n').forEach(line => {
          const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*)$/);
          if (m) envVars[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
        });
        return;
      }
      const p = _parseYaml(file.content);

      // Networks
      Object.entries(p.networks || {}).forEach(([name, def]) => {
        if (!networks[name]) networks[name] = {
          id: `net:${name}`, name,
          driver:   def.driver   || 'bridge',
          internal: !!def.internal,
          external: !!def.external,
          subnet:   def.subnet   || null,
          sourceFile: file.path,
        };
      });

      // Top-level volumes
      Object.keys(p.volumes || {}).forEach(name => {
        if (!volumes[name]) volumes[name] = { id: `vol:${name}`, name, sourceFile: file.path };
      });

      // Services
      Object.entries(p.services || {}).forEach(([name, def]) => {
        const id = `svc:${name}`;
        services[id] = {
          id, name,
          image:          def.image          || null,
          container_name: def.container_name || name,
          ports:          def.ports          || [],
          networks:       def.networks       || [],
          namedVolumes:   def.namedVolumes   || [],
          depends_on:     def.depends_on     || [],
          sourceFile:     file.path,
          type:           file.type,
        };
      });
    });

    // Build edges — only between nodes that actually exist
    const allIds = new Set([
      ...Object.keys(services),
      ...Object.values(networks).map(n => n.id),
      ...Object.values(volumes).map(v => v.id),
    ]);

    Object.values(services).forEach(svc => {
      // depends_on
      svc.depends_on.forEach(dep => {
        const tid = `svc:${dep}`;
        if (allIds.has(tid)) rawEdges.push({ from: svc.id, to: tid, kind: 'depends_on' });
      });
      // networks
      svc.networks.forEach(net => {
        const tid = `net:${net}`;
        if (allIds.has(tid)) rawEdges.push({ from: svc.id, to: tid, kind: 'network' });
      });
      // named volumes
      svc.namedVolumes.forEach(vol => {
        const tid = `vol:${vol}`;
        if (allIds.has(tid)) rawEdges.push({ from: svc.id, to: tid, kind: 'volume' });
      });
    });

    // Deduplicate edges
    const seen = new Set();
    const edges = rawEdges.filter(e => {
      const key = `${e.from}→${e.to}→${e.kind}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    return {
      services: Object.values(services),
      networks: Object.values(networks),
      volumes:  Object.values(volumes),
      edges,
      envVars,
    };
  }

  // ── Simplified YAML parser ────────────────────────────────
  function _parseYaml(text) {
    const out = { services: {}, networks: {}, volumes: {} };
    const lines = text.split('\n');

    let section = null;
    let svcName = null, netName = null;
    let inIpam = false, inIpamCfg = false;
    let svcCtx = null; // what list are we building: ports|networks|volumes|depends_on
    let svcCtxIndent = -1;

    const resetSvcCtx = () => { svcCtx = null; svcCtxIndent = -1; };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const tr  = raw.trimStart();
      if (!tr || tr.startsWith('#')) continue;
      const ind = raw.length - tr.length;

      // Root section keys
      if (ind === 0) {
        inIpam = inIpamCfg = false;
        svcName = netName = null;
        resetSvcCtx();
        if (tr === 'services:') { section = 'svc'; continue; }
        if (tr === 'networks:') { section = 'net'; continue; }
        if (tr === 'volumes:')  { section = 'vol'; continue; }
        section = null; continue;
      }

      // ── Services ──
      if (section === 'svc') {
        if (ind === 2 && tr.endsWith(':') && !tr.startsWith('-')) {
          svcName = tr.slice(0, -1).trim();
          resetSvcCtx();
          out.services[svcName] = out.services[svcName] || {
            image: null, container_name: null,
            ports: [], networks: [], namedVolumes: [], depends_on: [],
          };
          continue;
        }
        if (!svcName) continue;
        const svc = out.services[svcName];

        if (ind === 4) {
          resetSvcCtx();
          if (tr.startsWith('image:'))          { svc.image = _val(tr, 'image'); continue; }
          if (tr.startsWith('container_name:')) { svc.container_name = _val(tr, 'container_name'); continue; }
          if (tr === 'ports:')      { svcCtx = 'ports';      svcCtxIndent = 4; continue; }
          if (tr === 'networks:')   { svcCtx = 'networks';   svcCtxIndent = 4; continue; }
          if (tr === 'volumes:')    { svcCtx = 'volumes';    svcCtxIndent = 4; continue; }
          if (tr === 'depends_on:') { svcCtx = 'depends_on'; svcCtxIndent = 4; continue; }
        }

        if (svcCtx && ind > svcCtxIndent) {
          if (tr.startsWith('- ')) {
            const v = tr.slice(2).trim().replace(/['"]/g, '');
            if (svcCtx === 'ports')      svc.ports.push(v);
            if (svcCtx === 'networks')   svc.networks.push(v);
            if (svcCtx === 'depends_on') svc.depends_on.push(v);
            if (svcCtx === 'volumes') {
              // Extract named volume (no / or . at start)
              const host = v.split(':')[0];
              if (!host.startsWith('/') && !host.startsWith('.') && !host.startsWith('$'))
                svc.namedVolumes.push(host);
            }
          } else if (tr.endsWith(':') && !tr.startsWith('-')) {
            // map style: network_name: or service_name:
            const v = tr.slice(0, -1).trim();
            if (svcCtx === 'networks')   svc.networks.push(v);
            if (svcCtx === 'depends_on') svc.depends_on.push(v);
          }
        }
      }

      // ── Networks ──
      if (section === 'net') {
        if (ind === 2 && tr.endsWith(':') && !tr.startsWith('-')) {
          netName = tr.slice(0, -1).trim();
          inIpam = inIpamCfg = false;
          out.networks[netName] = out.networks[netName] || {};
          continue;
        }
        if (!netName) continue;
        const net = out.networks[netName];
        if (ind === 4) {
          inIpam = inIpamCfg = false;
          if (tr.startsWith('driver:'))            net.driver   = _val(tr, 'driver');
          if (tr.includes('internal: true'))        net.internal = true;
          if (tr.includes('external: true'))        net.external = true;
          if (tr === 'ipam:')                      inIpam = true;
        }
        if (inIpam && ind === 6 && tr === 'config:') inIpamCfg = true;
        if (inIpamCfg && ind >= 8 && tr.startsWith('subnet:'))
          net.subnet = _val(tr, 'subnet');
      }

      // ── Top-level volumes ──
      if (section === 'vol') {
        if (ind === 2 && tr.endsWith(':') && !tr.startsWith('-'))
          out.volumes[tr.slice(0, -1).trim()] = {};
      }
    }
    return out;
  }

  function _val(line, key) {
    return line.replace(new RegExp(`^${key}:\\s*`), '').trim().replace(/^['"]|['"]$/g, '');
  }

  return { parseProject };
})();
