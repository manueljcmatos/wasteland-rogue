'use strict';
// Minimal WebSocket server (RFC 6455): text frames, ping/pong, close. Enough for presence and chat.
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 16 * 1024;

class Conn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true;
    socket.setNoDelay(true);
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => { if (this.open) { this.open = false; this.emit('close'); } });
    socket.on('error', () => socket.destroy());
  }
  parse() {
    while (this.open && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], op = b0 & 0x0f, fin = b0 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME || !(b1 & 0x80)) return this.close(1009); // too big or unmasked client frame
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4), data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x1 || op === 0x0) {
        this.frag = op === 0x1 ? data : Buffer.concat([this.frag || Buffer.alloc(0), data]);
        if (this.frag.length > MAX_FRAME) return this.close(1009);
        if (fin) { const msg = this.frag.toString('utf8'); this.frag = null; this.emit('message', msg); }
      } else if (op === 0x8) return this.close(1000);
      else if (op === 0x9) this.frame(0xA, data);
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n])
      : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
        : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(str) { this.frame(0x1, Buffer.from(str)); }
  close(code = 1000) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    try { this.frame(0x8, p); } catch { /* socket gone */ }
    this.open = false; this.socket.end(); this.emit('close');
  }
}

// complete the HTTP upgrade handshake and hand back a connection
function upgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new Conn(socket);
}

module.exports = { upgrade };
