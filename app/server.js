const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseBugs, applyFlags } = require('./flags');
const { createStore, COUPONS, SHIPPING, FREE_SHIPPING_FROM } = require('./store');

const PORT = Number(process.env.PORT) || 4000;
const BUGS = parseBugs(process.env.BUGS);
const bug = (id) => BUGS.has(id);
const PUBLIC = path.join(__dirname, 'public');
const PAGES = {
  '/': 'index.html',
  '/cadastro': 'register.html',
  '/entrar': 'login.html',
  '/carrinho': 'cart.html',
  '/checkout': 'checkout.html',
  '/perfil': 'profile.html',
  '/pedido': 'order.html',
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

let db = createStore();

// ---------- helpers ----------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hash = (pw) => crypto.createHash('sha256').update(pw).digest('hex'); // shortcut: demo app only, use a real KDF anywhere real

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const fail = (res, status, error, field) => send(res, status, field ? { error, field } : { error });

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(null); } });
  });
}

function getSession(req, res) {
  const sid = /(?:^|;\s*)sid=([a-f0-9]{32})/.exec(req.headers.cookie || '')?.[1];
  if (sid && db.sessions.has(sid)) return { sid, ...db.sessions.get(sid) };
  return newSession(res, null);
}
function newSession(res, userId) {
  const sid = crypto.randomBytes(16).toString('hex');
  db.sessions.set(sid, { userId });
  res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  return { sid, userId };
}
const userById = (id) => [...db.users.values()].find((u) => u.id === id);
const cartKey = (s) => (s.userId ? `u:${s.userId}` : `s:${s.sid}`);
function cartOf(s) {
  const key = cartKey(s);
  if (!db.carts.has(key)) db.carts.set(key, { items: {}, coupon: null });
  return db.carts.get(key);
}

function totals(cart) {
  const lines = Object.entries(cart.items).map(([id, qty]) => {
    const p = db.products.find((x) => x.id === id);
    return { id, name: p.name, price: p.price, qty, stock: p.stock, total: p.price * qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  let note = null;
  let c = cart.coupon && COUPONS[cart.coupon];
  if (c?.min && subtotal < c.min) {
    note = `Cupom ${cart.coupon} removido: pedido abaixo do mínimo.`;
    cart.coupon = null;
    c = null;
  }
  const discount = c?.type === 'percent' ? Math.round((subtotal * c.value) / 100) : 0;
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM || c?.type === 'shipping' ? 0 : SHIPPING;
  return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping, coupon: cart.coupon, note };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- API ----------
async function api(req, res, url) {
  const s = getSession(req, res);
  const route = `${req.method} ${url.pathname}`;
  const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
  if (body === null) return fail(res, 400, 'JSON inválido.');

  switch (route) {
    case 'GET /api/me': {
      const u = s.userId && userById(s.userId);
      const count = Object.values(cartOf(s).items).reduce((a, b) => a + b, 0);
      return send(res, 200, { user: u ? { name: u.name, email: u.email } : null, cartCount: count });
    }

    case 'POST /api/register': {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!name) return fail(res, 422, 'Informe seu nome.', 'name');
      if (!EMAIL.test(email)) return fail(res, 422, 'E-mail inválido.', 'email');
      if (password.length < 8) return fail(res, 422, 'A senha precisa ter pelo menos 8 caracteres.', 'password');
      if (password !== body.confirm) return fail(res, 422, 'As senhas não conferem.', 'confirm');
      if (db.users.has(email)) return fail(res, 409, 'Já existe uma conta com este e-mail.', 'email');
      const user = { id: db.nextUserId++, name, email, password: hash(password), phone: '' };
      db.users.set(email, user);
      return send(res, 201, { name, email });
    }

    case 'POST /api/login': {
      const u = db.users.get(String(body.email || '').trim().toLowerCase());
      if (!u || u.password !== hash(String(body.password || ''))) return fail(res, 401, 'E-mail ou senha incorretos.');
      const guest = cartOf(s);
      db.sessions.delete(s.sid);
      const ns = newSession(res, u.id);
      const userCart = cartOf(ns);
      for (const [id, qty] of Object.entries(guest.items)) {
        const stock = db.products.find((p) => p.id === id).stock;
        userCart.items[id] = Math.min(stock, (userCart.items[id] || 0) + qty);
      }
      userCart.coupon = userCart.coupon || guest.coupon;
      db.carts.delete(`s:${s.sid}`);
      return send(res, 200, { name: u.name });
    }

    case 'POST /api/logout':
      db.sessions.delete(s.sid);
      newSession(res, null);
      return send(res, 200, { ok: true });

    case 'GET /api/products': {
      const q = norm(url.searchParams.get('q') || '');
      const cat = url.searchParams.get('categoria') || '';
      const items = db.products.filter((p) => (!q || norm(p.name).includes(q)) && (!cat || p.category === cat));
      return send(res, 200, { items, categories: [...new Set(db.products.map((p) => p.category))] });
    }

    case 'GET /api/cart':
      return send(res, 200, totals(cartOf(s)));

    case 'POST /api/cart': {
      const p = db.products.find((x) => x.id === body.productId);
      if (!p) return fail(res, 404, 'Produto não encontrado.');
      const qty = Number(body.qty ?? 1);
      if (!Number.isInteger(qty) || qty < 1) return fail(res, 422, 'Quantidade inválida.');
      const cart = cartOf(s);
      const next = (cart.items[p.id] || 0) + qty;
      if (next > p.stock) return fail(res, 409, p.stock === 0 ? 'Produto esgotado.' : `Só temos ${p.stock} unidade(s) em estoque.`);
      cart.items[p.id] = next;
      return send(res, 200, totals(cart));
    }

    case 'PUT /api/cart': {
      const cart = cartOf(s);
      const p = db.products.find((x) => x.id === body.productId);
      if (!p || !cart.items[p.id]) return fail(res, 404, 'Item não está no carrinho.');
      const qty = Number(body.qty);
      if (!Number.isInteger(qty) || qty < 0) return fail(res, 422, 'Quantidade inválida.');
      if (qty > p.stock) return fail(res, 409, `Só temos ${p.stock} unidade(s) em estoque.`);
      if (qty === 0) delete cart.items[p.id];
      else cart.items[p.id] = qty;
      return send(res, 200, totals(cart));
    }

    case 'POST /api/cart/coupon': {
      const code = String(body.code || '').trim().toUpperCase();
      const c = COUPONS[code];
      const cart = cartOf(s);
      if (!c) return fail(res, 404, 'Cupom inválido.');
      if (c.expired) return fail(res, 422, 'Este cupom expirou.');
      if (c.min && totals(cart).subtotal < c.min) return fail(res, 422, `Pedido mínimo de R$ ${(c.min / 100).toFixed(2).replace('.', ',')} para este cupom.`);
      cart.coupon = code;
      return send(res, 200, totals(cart));
    }

    case 'DELETE /api/cart/coupon': {
      const cart = cartOf(s);
      cart.coupon = null;
      return send(res, 200, totals(cart));
    }

    case 'POST /api/checkout': {
      const u = s.userId && userById(s.userId);
      if (!u) return fail(res, 401, 'Entre na sua conta para finalizar a compra.');
      const cart = cartOf(s);
      const t = totals(cart);
      if (!t.lines.length) return fail(res, 422, 'Seu carrinho está vazio.');
      const a = body.address || {};
      if (!/^\d{5}-?\d{3}$/.test(String(a.cep || ''))) return fail(res, 422, 'CEP inválido.', 'cep');
      if (!String(a.street || '').trim()) return fail(res, 422, 'Informe a rua.', 'street');
      if (!String(a.number || '').trim()) return fail(res, 422, 'Informe o número.', 'number');
      if (!String(a.city || '').trim()) return fail(res, 422, 'Informe a cidade.', 'city');
      const pay = body.payment || {};
      if (pay.method === 'cartao') {
        if (!/^\d{16}$/.test(String(pay.card || '').replace(/\s/g, ''))) return fail(res, 422, 'Número do cartão inválido.', 'card');
        const m = /^(\d{2})\/(\d{2})$/.exec(String(pay.expiry || ''));
        const now = new Date();
        const exp = m && new Date(2000 + Number(m[2]), Number(m[1])); // first day of the month after expiry
        if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || exp <= now) return fail(res, 422, 'Validade inválida.', 'expiry');
        if (!/^\d{3}$/.test(String(pay.cvv || ''))) return fail(res, 422, 'CVV inválido.', 'cvv');
      } else if (pay.method !== 'pix') {
        return fail(res, 422, 'Escolha a forma de pagamento.', 'method');
      }
      for (const l of t.lines) if (l.qty > l.stock) return fail(res, 409, `${l.name}: estoque insuficiente.`);
      for (const l of t.lines) db.products.find((p) => p.id === l.id).stock -= l.qty;
      const order = { id: db.nextOrderId++, userId: u.id, ...t, payment: pay.method, address: a, createdAt: new Date().toISOString() };
      delete order.note;
      db.orders.push(order);
      db.carts.delete(cartKey(s));
      return send(res, 201, { id: order.id });
    }

    case 'GET /api/orders': {
      if (!s.userId) return fail(res, 401, 'Entre na sua conta.');
      const id = url.searchParams.get('id');
      const mine = db.orders.filter((o) => o.userId === s.userId);
      if (id) {
        const o = mine.find((x) => String(x.id) === id);
        return o ? send(res, 200, o) : fail(res, 404, 'Pedido não encontrado.');
      }
      return send(res, 200, { items: mine.map(({ id: oid, total, createdAt }) => ({ id: oid, total, createdAt })) });
    }

    case 'GET /api/profile': {
      const u = s.userId && userById(s.userId);
      if (!u) return fail(res, 401, 'Entre na sua conta.');
      return send(res, 200, { name: u.name, email: u.email, phone: u.phone });
    }

    case 'PUT /api/profile': {
      const u = s.userId && userById(s.userId);
      if (!u) return fail(res, 401, 'Entre na sua conta.');
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (!name) return fail(res, 422, 'Informe seu nome.', 'name');
      if (phone && !/^\d{10,11}$/.test(phone)) return fail(res, 422, 'Telefone inválido.', 'phone');
      Object.assign(u, { name, phone });
      return send(res, 200, { name: u.name, email: u.email, phone: u.phone });
    }

    case 'POST /api/__reset':
      // Test-only: enabled with ALLOW_RESET=1, never during agent runs.
      if (process.env.ALLOW_RESET !== '1') return fail(res, 404, 'Não encontrado.');
      db = createStore();
      return send(res, 200, { ok: true });

    default:
      return fail(res, 404, 'Não encontrado.');
  }
}

// ---------- static ----------
function serveFile(res, file, status = 200) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC + path.sep)) return fail(res, 404, 'Não encontrado.');
  fs.readFile(full, 'utf8', (err, text) => {
    if (err) return fail(res, 404, 'Não encontrado.');
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(full)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(applyFlags(text, BUGS));
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url).catch((e) => { console.error(e); fail(res, 500, 'Erro interno.'); });
  }
  if (PAGES[url.pathname]) return serveFile(res, PAGES[url.pathname]);
  if (url.pathname.startsWith('/assets/')) return serveFile(res, url.pathname.slice('/assets/'.length));
  return serveFile(res, '404.html', 404);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`shop on http://localhost:${PORT} (bugs: ${[...BUGS].join(',') || 'none'})`));
}

module.exports = { server, bug };
