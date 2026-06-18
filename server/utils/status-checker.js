const { exec } = require('child_process');
const net = require('net');
const http = require('http');
const db = require('./db');

const CHECK_INTERVAL_MS = parseInt(process.env.STATUS_CHECK_INTERVAL, 10) || 60000;
let timer = null;

function checkPing(ip, timeout = 2000) {
  return new Promise((resolve) => {
    let cmd;
    if (process.platform === 'win32') {
      // Windows ping: -n count, -w timeout in milliseconds
      cmd = `ping -n 1 -w ${timeout} ${ip}`;
    } else {
      // Linux/macOS ping: -c count, -W timeout in seconds
      cmd = `ping -c 1 -W ${Math.ceil(timeout / 1000)} ${ip}`;
    }
    require('child_process').exec(cmd, (err, stdout, stderr) => {
      // Check output for success indicators
      if (err) {
        // Sometimes ping returns non-zero exit code even if it's reachable, check output
        const successPatterns = [
          /TTL=\d+/i,
          /bytes from/i,
          /Reply from/i,
          /1 received/i
        ];
        const isSuccess = successPatterns.some(pattern => pattern.test(stdout) || pattern.test(stderr));
        resolve(isSuccess);
      } else {
        // No error, assume success
        resolve(true);
      }
    });
  });
}

function checkTcp(ip, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    socket.setTimeout(timeout);
    socket.once('connect', () => { resolved = true; socket.destroy(); resolve(true); });
    socket.once('timeout', () => { if (!resolved) { resolved = true; socket.destroy(); resolve(false); } });
    socket.once('error', () => { if (!resolved) { resolved = true; socket.destroy(); resolve(false); } });
    socket.connect(port, ip);
  });
}

function checkHttp(ip, target = '', timeout = 3000) {
  const path = target || '/';
  return new Promise((resolve) => {
    const req = http.get(`http://${ip}${path}`, { timeout }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function checkDevice(device) {
  const method = device.check_method || 'ping';
  const target = device.check_target;
  const ports = device.ports || [];

  let online = false;

  if (method === 'ping') {
    online = await checkPing(device.ip);
  } else if (method === 'tcp') {
    const port = parseInt(target, 10) || ports[0];
    if (port) {
      online = await checkTcp(device.ip, port);
    } else {
      // Fall back to ping if no port provided
      online = await checkPing(device.ip);
    }
  } else if (method === 'http') {
    online = await checkHttp(device.ip, target);
  } else if (ports.length > 0) {
    // Default: try first open port
    online = await checkTcp(device.ip, ports[0]);
  } else {
    online = await checkPing(device.ip);
  }

  return online;
}

async function checkAll() {
  try {
    // Check ALL devices (both pending and mapped)
    const { rows: devices } = await db.query(
      "SELECT id, ip, check_method, check_target, ports FROM network_devices"
    );

    for (const device of devices) {
      const online = await checkDevice(device);
      await db.query('UPDATE network_devices SET online = $1, updated_at = NOW() WHERE id = $2', [online, device.id]);
    }
  } catch (err) {
    console.error('Status checker error:', err.message);
  }
}

function start() {
  if (timer) clearInterval(timer);
  checkAll(); // run immediately
  timer = setInterval(checkAll, CHECK_INTERVAL_MS);
  console.log('Status checker started, interval:', CHECK_INTERVAL_MS, 'ms');
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, checkDevice, checkAll };
