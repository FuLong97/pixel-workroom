// src/network.mjs - Find the address a phone on the same Wi-Fi can use to reach this computer
import os from 'os';

const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

// Wi-Fi / Ethernet first; skip virtual adapters (Docker, WSL, VPN, VirtualBox, Hyper-V)
const VIRTUAL = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|tailscale|zerotier|loopback|bluetooth/i;

export function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !isPrivate(a.address)) continue;
      out.push({ name, ip: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  // real adapters first, then 192.168.x (typical home router), then the rest
  return out.sort((a, b) => a.virtual - b.virtual || (b.ip.startsWith('192.168.') - a.ip.startsWith('192.168.')));
}

export function phoneBase(port) {
  if (process.env.LAN_SHARE === '0') return null;
  const best = process.env.PUBLIC_HOST || lanAddresses()[0]?.ip;
  return best ? `http://${best}:${port}` : null;
}

export function isLoopback(addr = '') {
  return addr === '::1' || addr === '127.0.0.1' || addr === '::ffff:127.0.0.1';
}
