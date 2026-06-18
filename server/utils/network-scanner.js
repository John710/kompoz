const net = require('net');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const db = require('./db');
const { checkAll } = require('./status-checker');

const execAsync = util.promisify(exec);

// Common ports to scan (fastest first)
const COMMON_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 515, 554, 631, 888, 993, 995,
  1433, 1521, 1883, 27017, 32400, 3306, 3389, 5432, 5683, 5900, 6379, 8000, 8008, 8080, 8123, 8443, 8888,
  9000, 9090, 49152
];
const BATCH_SIZE = 20;
const TCP_TIMEOUT = 500;
const PING_TIMEOUT = 1500;

// RFC 1918 private ranges
const PRIVATE_RANGES = [
  { start: ipToLong('10.0.0.0'), end: ipToLong('10.255.255.255') },
  { start: ipToLong('172.16.0.0'), end: ipToLong('172.31.255.255') },
  { start: ipToLong('192.168.0.0'), end: ipToLong('192.168.255.255') },
];

function ipToLong(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function longToIp(long) {
  return [
    (long >>> 24) & 0xFF,
    (long >>> 16) & 0xFF,
    (long >>> 8) & 0xFF,
    long & 0xFF,
  ].join('.');
}

function parseCidr(cidr) {
  const [ipStr, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  if (!ipStr || isNaN(prefix) || prefix < 1 || prefix > 32) {
    throw new Error('Invalid CIDR format');
  }
  const ip = ipToLong(ipStr);
  const mask = 0xFFFFFFFF << (32 - prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hosts = [];
  for (let h = network + 1; h < broadcast; h++) {
    hosts.push(longToIp(h));
  }
  return { network, broadcast, prefix, hosts };
}

function isPrivateCidr(cidr) {
  const ip = cidr.split('/')[0];
  const long = ipToLong(ip);
  return PRIVATE_RANGES.some(r => long >= r.start && long <= r.end);
}

function tcpConnect(host, port, timeout = TCP_TIMEOUT) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const onResult = (open) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(open ? port : false);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => onResult(true));
    socket.once('timeout', () => onResult(false));
    socket.once('error', () => onResult(false));
    socket.connect(port, host);
  });
}

async function pingHost(ip, timeout = PING_TIMEOUT) {
  return new Promise((resolve) => {
    let cmd;
    if (process.platform === 'win32') {
      cmd = `ping -n 1 -w ${timeout} ${ip}`;
    } else {
      cmd = `ping -c 1 -W ${Math.ceil(timeout / 1000)} ${ip}`;
    }
    exec(cmd, (err, stdout, stderr) => {
      // Parse TTL for OS detection
      let ttl = null;
      const ttlMatch = (stdout + stderr).match(/TTL[=:](\d+)/i);
      if (ttlMatch) {
        ttl = parseInt(ttlMatch[1], 10);
      }
      // Check if ping succeeded
      const successPatterns = [
        /TTL=\d+/i, /bytes from/i, /Reply from/i, /1 received/i, /1 пакет получен/i
      ];
      const isSuccess = successPatterns.some(pattern => pattern.test(stdout) || pattern.test(stderr));
      resolve({ online: isSuccess || !err, ttl });
    });
  });
}

// Grab banner from open port
async function grabBanner(ip, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = '';
    let resolved = false;

    const done = (banner) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(banner || null);
    };

    socket.setTimeout(timeout);
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8', 0, 512); // Limit to first 512 bytes
      if (data.includes('\n') || data.includes('\r')) {
        done(data.trim());
      }
    });
    socket.on('connect', () => {
      // For some protocols send a newline to trigger response
      socket.write('\r\n');
    });
    socket.on('timeout', () => {
      if (data) done(data.trim());
      else done(null);
    });
    socket.on('error', () => {
      if (data) done(data.trim());
      else done(null);
    });
    socket.on('close', () => {
      if (data) done(data.trim());
      else done(null);
    });

    socket.connect(port, ip);
  });
}

// Detect OS based on TTL
function detectOs(ttl) {
  if (!ttl) return null;
  if (ttl <= 64) {
    // Android/iOS/Linux/macOS all use TTL 64
    return 'Linux/Unix/macOS/Android/iOS';
  }
  if (ttl <= 128) return 'Windows';
  if (ttl <= 255) return 'Network Device';
  return null;
}

// Helper to suggest device type based on open ports, OS, and TTL
function suggestDeviceType(os, ports, ttl) {
  const portSet = new Set(ports);

  // Common mobile device ports (often no open ports, or maybe 53, 80, 443)
  if (ttl && ttl <= 64 && (ports.length === 0 || (ports.length <= 2 && (portSet.has(80) || portSet.has(443) || portSet.has(53))))) {
    // Check if it's likely a mobile device
    // Mobile devices often don't have many open ports
    return 'mobile';
  }

  // Common IoT device ports
  if (portSet.has(1883) || portSet.has(8883)) return 'iot'; // MQTT
  if (portSet.has(5683) || portSet.has(5684)) return 'iot'; // CoAP

  // Common printer ports
  if (portSet.has(515) || portSet.has(631) || portSet.has(9100)) return 'printer';

  // Camera ports
  if (portSet.has(554) || (portSet.has(8080) && portSet.has(554))) { // RTSP, common camera port
    return 'camera';
  }

  // Router/Switch ports
  if (portSet.has(22) || portSet.has(23) || portSet.has(80) || portSet.has(443) || portSet.has(161)) {
    if (os === 'Network Device') {
      return 'router';
    }
  }

  // If it's Network Device but no specific ports found, default to unknown (user can change)
  if (os === 'Network Device') return 'unknown';

  // If it's Linux/Unix/macOS but has IoT ports, return IoT
  if (os === 'Linux/Unix/macOS/Android/iOS' && (portSet.has(1883) || portSet.has(5683))) {
    return 'iot';
  }

  return 'unknown';
}

// Get mDNS hostname (.local)
async function getMdnsHostname(ip) {
  try {
    const { stdout } = await execAsync(`avahi-resolve -a ${ip} || true`, { timeout: 3000 });
    const match = stdout.trim().split(/\s+/);
    if (match && match[1]) {
      return match[1].replace('.local.', '').replace('.local', '');
    }
  } catch { /* ignore */ }
  return null;
}

// Get NetBIOS hostname
async function getNetbiosHostname(ip) {
  try {
    let cmd;
    if (process.platform === 'win32') {
      cmd = `nbtstat -A ${ip}`;
    } else {
      cmd = `nmblookup -A ${ip} || true`;
    }
    const { stdout } = await execAsync(cmd, { timeout: 3000 });
    if (process.platform === 'win32') {
      const match = stdout.match(/NetBIOS Remote Machine Name Table[\s\S]*?([^\s]+)\s+<00>/i);
      if (match) return match[1].trim();
    } else {
      const match = stdout.match(/(\S+)\s+<00>/i);
      if (match) return match[1].trim();
    }
  } catch { /* ignore */ }
  return null;
}

async function scanIp(ip, arpTable = {}) {
  const openPorts = [];
  const banners = {};

  // First check ARP table for quick online status
  const isInArp = !!arpTable[ip];

  // Scan all ports and grab banners
  for (const port of COMMON_PORTS) {
    const result = await tcpConnect(ip, port);
    if (result) {
      openPorts.push(port);
      const banner = await grabBanner(ip, port);
      if (banner) {
        banners[port] = banner;
      }
    }
  }

  let ttl = null;
  let online = openPorts.length > 0 || isInArp; // Use ARP as online check
  if (!online) {
    const pingResult = await pingHost(ip);
    online = pingResult.online;
    ttl = pingResult.ttl;
  } else {
    // Try to get TTL even if we have open ports or are in ARP
    try {
      const pingResult = await pingHost(ip);
      ttl = pingResult.ttl;
    } catch { /* ignore */ }
  }

  const os = detectOs(ttl);
  const suggestedType = suggestDeviceType(os, openPorts, ttl);

  return { ip, online, ports: openPorts, banners, os, suggestedType };
}

async function getHostnames(ips) {
  const map = {};
  for (const ip of ips) {
    try {
      let hostname = null;
      if (process.platform === 'win32') {
        // On Windows, use nslookup or ping -a
        try {
          const { stdout } = await execAsync(`ping -a -n 1 -w 1000 ${ip}`, { timeout: 2000 });
          // Look for something like "Pinging PC-NAME [192.168.1.100]..."
          const match = stdout.match(/Pinging\s+([^\s\[]+)/i);
          if (match && match[1]) {
            hostname = match[1].trim();
          }
        } catch { /* ignore */ }
      } else {
        // On Linux, use getent hosts
        const { stdout } = await execAsync(`getent hosts ${ip} || true`, { timeout: 2000 });
        const match = stdout.match(/([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]+/);
        if (match) hostname = match[0].split(".")[0];
      }
      if (hostname) map[ip] = hostname;
    } catch { /* ignore */ }
  }
  return map;
}

async function getArpTable() {
  try {
    let cmd;
    if (process.platform === 'win32') {
      cmd = 'arp -a';
    } else {
      cmd = 'ip neigh show';
    }
    const { stdout } = await execAsync(cmd);
    const map = {};

    if (process.platform === 'win32') {
      stdout.split('\n').forEach(line => {
        // Match lines like: 192.168.1.1    00-11-22-33-44-55    dynamic
        const match = line.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2}[-:][0-9a-fA-F]{2})/i);
        if (match) {
          const ip = match[1];
          const mac = match[2].replace(/-/g, ':');
          map[ip] = mac;
        }
      });
    } else {
      stdout.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        const idx = parts.indexOf("lladdr");
        if (idx >= 0 && parts[idx + 1]) {
          const ip = parts[0];
          const mac = parts[idx + 1];
          map[ip] = mac;
        }
      });
    }

    return map;
  } catch {
    return {};
  }
}

function getLocalMacs() {
  const localMacs = {};
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localMacs[iface.address] = iface.mac;
      }
    }
  }
  return localMacs;
}


async function getVendor(mac) {
  if (!mac) return null;
  try {
    const res = await fetch('https://api.macvendors.com/' + encodeURIComponent(mac));
    if (res.status === 200) {
      const text = await res.text();
      return text || null;
    }
  } catch (e) {
    // ignore network errors
  }
  return null;
}

async function scanCidr(cidr) {
  if (!isPrivateCidr(cidr)) {
    throw new Error('Only private RFC 1918 networks are allowed');
  }

  if (global.scanProgress && global.scanProgress.running) {
    throw new Error('Another scan is already running');
  }

  const { hosts } = parseCidr(cidr);
  const total = hosts.length;
  const found = [];

  global.scanProgress = { running: true, total, done: 0, current: null };

  const startedAt = Date.now();

  // Get ARP table and local MACs before scanning
  const arpTable = await getArpTable();
  const localMacs = getLocalMacs();

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = hosts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ip) => {
        global.scanProgress.current = ip;
        const result = await scanIp(ip, arpTable);
        global.scanProgress.done++;
        return result;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.online) {
        found.push(r.value);
      }
    }
  }

  const hostnames = await getHostnames(found.map(d => d.ip));
  console.log('Scan finished. Found', found.length, 'devices');

  // Collect mDNS and NetBIOS hostnames for all devices
  const mdnsHostnames = {};
  const netbiosHostnames = {};
  for (const device of found) {
    try {
      const [mdns, netbios] = await Promise.all([
        getMdnsHostname(device.ip),
        getNetbiosHostname(device.ip)
      ]);
      if (mdns) mdnsHostnames[device.ip] = mdns;
      if (netbios) netbiosHostnames[device.ip] = netbios;
    } catch { /* ignore */ }
  }

  // Save found devices to DB: if not exists insert as pending,
  // if exists but not mapped, update only certain fields, keeping user edits
  for (const device of found) {
    const mac = arpTable[device.ip] || localMacs[device.ip] || null;
    let name = hostnames[device.ip] || '';
    const mdnsHostname = mdnsHostnames[device.ip] || null;
    const netbiosHostname = netbiosHostnames[device.ip] || null;
    const vendor = mac ? await getVendor(mac) : null;

    // Prioritize hostnames: getent > mDNS > NetBIOS
    if (!name && mdnsHostname) name = mdnsHostname;
    if (!name && netbiosHostname) name = netbiosHostname;

    try {
      // First try to find by MAC if available
      let query, params;
      if (mac) {
        query = 'SELECT id, status, name, mac, vendor, ports, os, banners, hostname_mdns, hostname_netbios FROM network_devices WHERE mac = $1';
        params = [mac];
      } else {
        query = 'SELECT id, status, name, mac, vendor, ports, os, banners, hostname_mdns, hostname_netbios FROM network_devices WHERE ip = $1';
        params = [device.ip];
      }
      const { rows } = await db.query(query, params);
      
      if (rows.length === 0) {
        // Not found, insert as pending
        await db.query(
          `INSERT INTO network_devices 
            (ip, mac, name, type, status, ports, vendor, os, banners, hostname_mdns, hostname_netbios) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            device.ip, 
            mac, 
            name, 
            device.suggestedType || 'unknown', 
            'pending', 
            device.ports, 
            vendor, 
            device.os, 
            JSON.stringify(device.banners || {}), 
            mdnsHostname, 
            netbiosHostname
          ]
        );
      } else if (rows[0].status !== 'mapped') {
        // Exists and is pending: update only fields that user hasn't modified
        const existing = rows[0];
        await db.query(
          `UPDATE network_devices SET
            ip = $1,
            mac = COALESCE($2, mac),
            name = CASE WHEN name = '' OR name IS NULL THEN $3 ELSE name END,
            type = CASE WHEN type = '' OR type = 'unknown' OR type IS NULL THEN $4 ELSE type END,
            ports = CASE WHEN ports IS NULL OR ports = '{}' THEN $5 ELSE ports END,
            vendor = COALESCE(NULLIF(vendor, ''), $6),
            os = COALESCE(os, $7),
            banners = COALESCE(banners, '{}'::jsonb) || $8::jsonb,
            hostname_mdns = COALESCE(hostname_mdns, $9),
            hostname_netbios = COALESCE(hostname_netbios, $10),
            status = 'pending',
            updated_at = NOW()
          WHERE id = $11`,
          [
            device.ip, 
            mac, 
            name, 
            device.suggestedType || 'unknown',
            device.ports || [], 
            vendor, 
            device.os, 
            JSON.stringify(device.banners || {}), 
            mdnsHostname, 
            netbiosHostname, 
            rows[0].id
          ]
        );
      }
    } catch (err) {
      console.error('Failed to save device:', device.ip, err.message);
    }
  }

  const duration = Date.now() - startedAt;

  // Save scan history
  try {
    await db.query(
      'INSERT INTO network_scan_history (cidr, found_count, duration_ms, completed_at) VALUES ($1, $2, $3, NOW())',
      [cidr, found.length, duration]
    );
  } catch (err) {
    console.error('Failed to save scan history:', err.message);
  }

  // Проверить статус всех устройств сразу после сканирования
  await checkAll();

  global.scanProgress = { running: false, total, done: total, current: null };

  return { found: found.length, devices: found };
}

function getScanProgress() {
  return global.scanProgress || { running: false, total: 0, done: 0, current: null };
}

module.exports = { scanCidr, getScanProgress, parseCidr, isPrivateCidr };
