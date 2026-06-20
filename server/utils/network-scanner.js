const net = require('net');
const { exec } = require('child_process');
const util = require('util');
const db = require('./db');

const execAsync = util.promisify(exec);

// Common ports to scan (fastest first)
const COMMON_PORTS = [22, 80, 443, 8080, 1883, 3389, 5900, 8123];
const BATCH_SIZE = 20;
const TCP_TIMEOUT = 500;
const PING_TIMEOUT = 1500;
const MAX_SCAN_HOSTS = 4096;

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
  const hostCount = broadcast - network - 1;
  if (hostCount > MAX_SCAN_HOSTS) {
    throw new Error('errCidrTooLarge');
  }
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
    exec(`ping -c 1 -W ${Math.ceil(timeout / 1000)} ${ip}`, (err) => {
      resolve(!err);
    });
  });
}

async function scanIp(ip) {
  // Try TCP ports first (fast)
  const openPorts = [];
  for (const port of COMMON_PORTS) {
    const result = await tcpConnect(ip, port);
    if (result) openPorts.push(port);
  }

  if (openPorts.length > 0) {
    return { ip, online: true, ports: openPorts };
  }

  // Fallback to ping
  const alive = await pingHost(ip);
  return { ip, online: alive, ports: [] };
}

async function getHostnames(ips) {
  const map = {};
  for (const ip of ips) {
    try {
      const { stdout } = await execAsync(`getent hosts ${ip} || true`, { timeout: 2000 });
      const match = stdout.match(/([a-zA-Z0-9][-a-zA-Z0-9]*\.)+[a-zA-Z]+/);
      if (match) map[ip] = match[0].split(".")[0];
    } catch { /* ignore */ }
  }
  return map;
}

async function getArpTable() {
  try {
    const { stdout } = await execAsync('ip neigh show');
    const map = {};
    stdout.split('\n').forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[4] === 'lladdr') {
        const ip = parts[0];
        const mac = parts[2];
        map[ip] = mac;
      }
    });
    return map;
  } catch {
    return {};
  }
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

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = hosts.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ip) => {
        global.scanProgress.current = ip;
        const result = await scanIp(ip);
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

  // Get MAC addresses from ARP table
  const arpTable = await getArpTable();
  const hostnames = await getHostnames(found.map(d => d.ip));

  // Save found devices to DB (if not already exists)
  for (const device of found) {
    const mac = arpTable[device.ip] || null;
        const name = hostnames[device.ip] || '';
    try {
      const { rows } = await db.query('SELECT id FROM network_devices WHERE ip = $1', [device.ip]);
      if (rows.length === 0) {
        await db.query(
          'INSERT INTO network_devices (ip, mac, name, type, status, ports) VALUES ($1, $2, $3, $4, $5, $6)',
          [device.ip, mac, name, 'unknown', 'pending', device.ports]
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

  global.scanProgress = { running: false, total, done: total, current: null };

  return { found: found.length, devices: found };
}

function getScanProgress() {
  return global.scanProgress || { running: false, total: 0, done: 0, current: null };
}

module.exports = { scanCidr, getScanProgress, parseCidr, isPrivateCidr };
