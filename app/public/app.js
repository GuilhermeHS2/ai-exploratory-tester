// Shared client code. Each page sets <body data-page="...">.
const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = (sel, root = document) => root.querySelector(sel);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erro inesperado.'), { status: res.status, field: data.field });
  return data;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function showError(form, err) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  const out = $('.error', form);
  out.textContent = err ? err.message : '';
  if (err?.field) {
    const input = form.elements[err.field];
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }
}

async function renderHeader() {
  const me = await api('GET', '/api/me');
  $('#top').innerHTML = `
    <a class="logo" href="/">Loja Ponto</a>
    <a href="/carrinho">Carrinho (<span id="cart-count">${me.cartCount}</span>)</a>
    ${me.user
      ? `<a href="/perfil">Olá, ${esc(me.user.name.split(' ')[0])}</a> <button class="secondary" id="logout">Sair</button>`
      : `<a href="/entrar">Entrar</a> <a href="/cadastro">Criar conta</a>`}`;
  $('#logout')?.addEventListener('click', async () => { await api('POST', '/api/logout'); location.href = '/'; });
  return me;
}

function setCartCount(t) {
  $('#cart-count').textContent = t.lines.reduce((s, l) => s + l.qty, 0);
}

const pages = {
  async catalog() {
    const params = new URLSearchParams(location.search);
    const form = $('#search');
    form.elements.q.value = params.get('q') || '';
    const { items, categories } = await api('GET', `/api/products?${params}`);
    const select = form.elements.categoria;
    select.innerHTML = '<option value="">Todas as categorias</option>' +
      categories.map((c) => `<option ${c === params.get('categoria') ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#results-count').textContent = `${items.length} produto(s)`;
    $('#products').innerHTML = items.length ? items.map((p) => `
      <article class="card" data-product="${p.id}">
        <span class="badge">${esc(p.category)}</span>
        <h2 style="font-size:17px;margin:0">${esc(p.name)}</h2>
        <span class="price">${brl(p.price)}</span>
        <span class="muted">${p.stock ? `${p.stock} em estoque` : 'Esgotado'}</span>
        <button data-add="${p.id}" ${p.stock ? '' : 'disabled'}>Adicionar ao carrinho</button>
        <p class="error" role="alert"></p>
      </article>`).join('') : '<p>Nenhum produto encontrado.</p>';
    $('#products').addEventListener('click', async (e) => {
      const id = e.target.dataset?.add;
      if (!id) return;
      const err = $(`[data-product="${id}"] .error`);
      try {
        setCartCount(await api('POST', '/api/cart', { productId: id, qty: 1 }));
        err.textContent = '';
        e.target.textContent = 'Adicionado ✓';
        setTimeout(() => { e.target.textContent = 'Adicionar ao carrinho'; }, 1200);
      } catch (x) { err.textContent = x.message; }
    });
  },

  async register() {
    const form = $('#register');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      try {
        await api('POST', '/api/register', f);
        await api('POST', '/api/login', { email: f.email, password: f.password });
        location.href = '/';
      } catch (err) { showError(form, err); }
    });
  },

  async login() {
    const form = $('#login');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/login', Object.fromEntries(new FormData(form)));
        const next = new URLSearchParams(location.search).get('next');
        location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      } catch (err) { showError(form, err); }
    });
  },

  async cart() {
    const render = (t) => {
      setCartCount(t);
      $('#note').textContent = t.note || '';
      if (!t.lines.length) {
        $('#cart').innerHTML = '<p>Seu carrinho está vazio. <a href="/">Ver produtos</a></p>';
        return;
      }
      $('#cart').innerHTML = `
        <table>
          <thead><tr><th>Produto</th><th class="num">Preço</th><th class="num">Qtd.</th><th class="num">Total</th><th><span class="muted">Ações</span></th></tr></thead>
          <tbody>${t.lines.map((l) => `
            <tr data-line="${l.id}">
              <td>${esc(l.name)}</td>
              <td class="num">${brl(l.price)}</td>
              <td class="num"><input type="number" min="0" max="${l.stock}" value="${l.qty}" aria-label="Quantidade de ${esc(l.name)}" style="width:70px"></td>
              <td class="num">${brl(l.total)}</td>
              <td><button class="secondary" data-remove="${l.id}">Remover</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
        <p class="error" role="alert" id="cart-error"></p>
        <form id="coupon" class="row" style="max-width:none">
          <label>Cupom de desconto <input name="code" autocomplete="off"></label>
          <button>Aplicar</button>
          ${t.coupon ? `<span>Cupom <strong>${esc(t.coupon)}</strong> aplicado <button type="button" class="secondary" id="remove-coupon">Remover cupom</button></span>` : ''}
          <p class="error" role="alert"></p>
        </form>
        <div class="summary" aria-label="Resumo do pedido">
          <div><span>Subtotal</span><span data-testid="subtotal">${brl(t.subtotal)}</span></div>
          <div><span>Desconto</span><span data-testid="discount">- ${brl(t.discount)}</span></div>
          <div><span>Frete</span><span data-testid="shipping">${t.shipping ? brl(t.shipping) : 'Grátis'}</span></div>
          <div class="total"><span>Total</span><span data-testid="total">${brl(t.total)}</span></div>
          <a class="btn" href="/checkout" style="text-align:center;margin-top:8px">Finalizar compra</a>
        </div>`;
    };
    render(await api('GET', '/api/cart'));

    $('#cart').addEventListener('change', async (e) => {
      const row = e.target.closest('[data-line]');
      if (!row) return;
      try { render(await api('PUT', '/api/cart', { productId: row.dataset.line, qty: Number(e.target.value) })); }
      catch (err) { $('#cart-error').textContent = err.message; }
    });
    $('#cart').addEventListener('click', async (e) => {
      if (e.target.dataset.remove) render(await api('PUT', '/api/cart', { productId: e.target.dataset.remove, qty: 0 }));
      if (e.target.id === 'remove-coupon') render(await api('DELETE', '/api/cart/coupon'));
    });
    $('#cart').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      try { render(await api('POST', '/api/cart/coupon', { code: form.elements.code.value })); }
      catch (err) { showError(form, err); }
    });
  },

  async checkout(me) {
    if (!me.user) { location.href = '/entrar?next=/checkout'; return; }
    const t = await api('GET', '/api/cart');
    if (!t.lines.length) { location.href = '/carrinho'; return; }
    $('#order-total').textContent = brl(t.total);
    const form = $('#checkout');
    const toggle = () => { $('#card-fields').hidden = form.elements.method.value !== 'cartao'; };
    form.addEventListener('change', toggle);
    toggle();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try {
        const { id } = await api('POST', '/api/checkout', {
          address: { cep: f.cep, street: f.street, number: f.number, city: f.city },
          payment: { method: f.method, card: f.card, expiry: f.expiry, cvv: f.cvv },
        });
        location.href = `/pedido?id=${id}`;
      } catch (err) { showError(form, err); btn.disabled = false; }
    });
  },

  async order(me) {
    if (!me.user) { location.href = '/entrar'; return; }
    try {
      const o = await api('GET', `/api/orders?${new URLSearchParams({ id: new URLSearchParams(location.search).get('id') || '' })}`);
      $('#order').innerHTML = `
        <p class="success">Pedido <strong>#${o.id}</strong> confirmado.</p>
        <ul>${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)} (${brl(l.total)})</li>`).join('')}</ul>
        <p>Pagamento: ${o.payment === 'pix' ? 'Pix' : 'Cartão de crédito'} · Total: <strong>${brl(o.total)}</strong></p>
        <a href="/perfil">Ver meus pedidos</a>`;
    } catch (err) { $('#order').textContent = err.message; }
  },

  async profile(me) {
    if (!me.user) { location.href = '/entrar?next=/perfil'; return; }
    const form = $('#profile');
    const p = await api('GET', '/api/profile');
    form.elements.name.value = p.name;
    form.elements.email.value = p.email;
    form.elements.phone.value = p.phone;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#saved').textContent = '';
      try {
        await api('PUT', '/api/profile', { name: form.elements.name.value, phone: form.elements.phone.value });
        showError(form, null);
        $('#saved').textContent = 'Dados salvos.';
        await renderHeader();
      } catch (err) { showError(form, err); }
    });
    const { items } = await api('GET', '/api/orders');
    $('#orders').innerHTML = items.length
      ? `<ul>${items.map((o) => `<li><a href="/pedido?id=${o.id}">Pedido #${o.id}</a> · ${brl(o.total)} · ${new Date(o.createdAt).toLocaleDateString('pt-BR')}</li>`).join('')}</ul>`
      : '<p class="muted">Você ainda não fez pedidos.</p>';
  },
};

renderHeader().then((me) => pages[document.body.dataset.page]?.(me));
