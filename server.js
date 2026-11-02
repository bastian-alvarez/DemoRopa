'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnv();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PRODUCT_FILE = path.join(DATA_DIR, 'products.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SECRET = process.env.SESSION_SECRET || '';
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
const SECURE = process.env.NODE_ENV === 'production';
const sessions = new Map();
const loginAttempts = new Map();
const MAX_BODY = 32 * 1024;

function loadEnv() {
  try {
    for (const raw of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* .env is optional */ }
}

function initProducts() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRODUCT_FILE)) {
    fs.copyFileSync(path.join(DATA_DIR, 'products.seed.json'), PRODUCT_FILE);
  }
}
function readProducts() {
  try {
    const value = JSON.parse(fs.readFileSync(PRODUCT_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function saveProducts(products) {
  const temp = `${PRODUCT_FILE}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(products, null, 2), { mode: 0o600 });
  fs.renameSync(temp, PRODUCT_FILE);
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const at = part.indexOf('=');
    return at < 0 ? ['', ''] : [part.slice(0, at).trim(), decodeURIComponent(part.slice(at + 1).trim())];
  }).filter(([k]) => k));
}
function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SECURE ? '__Host-store-admin' : 'store-admin'] || '';
  const [id, signature] = token.split('.');
  const expected = id && SECRET ? crypto.createHmac('sha256', SECRET).update(id).digest('hex') : '';
  if (!id || !signature || !expected || !safeEqual(signature, expected)) return false;
  const item = id && sessions.get(id);
  if (!item || item.expires < Date.now()) { if (id) sessions.delete(id); return false; }
  return true;
}
function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...headers });
  res.end(Buffer.isBuffer(body) ? body : type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function securityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://images.unsplash.com data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  if (SECURE) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function originOk(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Solicitud demasiado grande'), { status: 413 })); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function cleanProduct(input, old = {}) {
  const fields = ['name', 'category', 'type', 'style', 'color', 'description', 'size', 'image'];
  const product = { ...old };
  for (const field of fields) if (input[field] !== undefined) product[field] = String(input[field]).trim().slice(0, field === 'description' ? 500 : 120);
  if (input.price !== undefined) product.price = Math.round(Number(input.price));
  if (input.active !== undefined) product.active = Boolean(input.active);
  if (input.featured !== undefined) product.featured = Boolean(input.featured);
  if (!product.name || !product.category || !product.type || !product.style || !Number.isFinite(product.price) || product.price < 0 || product.price > 100000000) throw new Error('Completa nombre, categoría, tipo, estilo y un precio válido.');
  if (product.image) {
    try { if (new URL(product.image).protocol !== 'https:' || new URL(product.image).hostname !== 'images.unsplash.com') throw new Error(); }
    catch { throw new Error('Usa una URL de imagen HTTPS de images.unsplash.com.'); }
  }
  return product;
}

async function handle(req, res) {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;
  if (req.method === 'GET' && route === '/api/products') {
    return send(res, 200, readProducts().filter(p => p.active));
  }
  if (req.method === 'GET' && route === '/api/config') return send(res, 200, { whatsappNumber: WHATSAPP_NUMBER });
  if (req.method === 'GET' && route === '/catalog.json') return send(res, 200, readProducts());
  if (route.startsWith('/api/admin')) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originOk(req)) return send(res, 403, { error: 'Origen no permitido.' });
    if (req.method === 'GET' && route === '/api/admin/status') return send(res, 200, { authenticated: isAdmin(req) });
    if (req.method === 'POST' && route === '/api/admin/login') {
      const ip = req.socket.remoteAddress || 'unknown';
      const attempt = loginAttempts.get(ip) || { count: 0, until: 0 };
      if (attempt.until > Date.now()) return send(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
      const data = await readBody(req);
      const valid = ADMIN_USER && ADMIN_PASSWORD && SECRET.length >= 32 && safeEqual(data.username || '', ADMIN_USER) && safeEqual(data.password || '', ADMIN_PASSWORD);
      if (!valid) {
        attempt.count++;
        if (attempt.count >= 8) { attempt.count = 0; attempt.until = Date.now() + 10 * 60 * 1000; }
        loginAttempts.set(ip, attempt);
        return send(res, 401, { error: 'Usuario o contraseña incorrectos.' });
      }
      loginAttempts.delete(ip);
      const id = crypto.randomBytes(32).toString('hex');
      sessions.set(id, { expires: Date.now() + 8 * 60 * 60 * 1000 });
      const signature = crypto.createHmac('sha256', SECRET).update(id).digest('hex');
      const cookie = `${SECURE ? '__Host-store-admin' : 'store-admin'}=${id}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${SECURE ? '; Secure' : ''}`;
      return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'Set-Cookie': cookie });
    }
    if (req.method === 'POST' && route === '/api/admin/logout') {
      const cookies = parseCookies(req.headers.cookie);
      const id = (cookies[SECURE ? '__Host-store-admin' : 'store-admin'] || '').split('.')[0];
      if (id) sessions.delete(id);
      return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'Set-Cookie': `${SECURE ? '__Host-store-admin' : 'store-admin'}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${SECURE ? '; Secure' : ''}` });
    }
    if (!isAdmin(req)) return send(res, 401, { error: 'Inicia sesión como administrador.' });
    if (req.method === 'GET' && route === '/api/admin/products') return send(res, 200, readProducts());
    if (req.method === 'POST' && route === '/api/admin/products') {
      const data = await readBody(req);
      const products = readProducts();
      const product = cleanProduct(data);
      product.id = crypto.randomUUID();
      products.unshift(product);
      saveProducts(products);
      return send(res, 201, product);
    }
    const match = route.match(/^\/api\/admin\/products\/([\w-]+)$/);
    if (match && ['PUT', 'DELETE'].includes(req.method)) {
      const products = readProducts();
      const index = products.findIndex(p => p.id === match[1]);
      if (index < 0) return send(res, 404, { error: 'Prenda no encontrada.' });
      if (req.method === 'DELETE') { products.splice(index, 1); saveProducts(products); return send(res, 200, { ok: true }); }
      const data = await readBody(req);
      const updated = cleanProduct(data, products[index]);
      updated.id = products[index].id;
      products[index] = updated;
      saveProducts(products);
      return send(res, 200, updated);
    }
    return send(res, 404, { error: 'Ruta no encontrada.' });
  }
  const files = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js', '/site-config.json': 'site-config.json' };
  if (req.method === 'GET' && files[route]) {
    const file = path.join(ROOT, 'public', files[route]);
    try { return send(res, 200, fs.readFileSync(file), files[route].endsWith('.css') ? 'text/css; charset=utf-8' : files[route].endsWith('.js') ? 'text/javascript; charset=utf-8' : files[route].endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', { 'Cache-Control': 'public, max-age=300' }); }
    catch { return send(res, 500, 'No se pudo cargar la página.', 'text/plain; charset=utf-8'); }
  }
  return send(res, 404, { error: 'No encontrado.' });
}

initProducts();
if (process.env.NODE_ENV === 'production' && (!ADMIN_USER || !ADMIN_PASSWORD || SECRET.length < 32)) {
  console.error('Configura ADMIN_USER, ADMIN_PASSWORD y SESSION_SECRET (mínimo 32 caracteres) para producción.');
  process.exit(1);
}
http.createServer((req, res) => {
  handle(req, res).catch(error => {
    if (!res.headersSent) send(res, error.status || 400, { error: error.status ? error.message : 'No se pudo completar la solicitud.' });
    else res.destroy();
  });
}).listen(PORT, () => console.log(`Tienda disponible en http://localhost:${PORT}`));

