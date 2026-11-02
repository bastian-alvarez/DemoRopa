'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const money = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value || 0);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const filters = { search: '', category: '', type: '', style: '', color: '', sort: 'featured' };
let products = [];
let cart = JSON.parse(localStorage.getItem('sur-cart') || '{}');
let whatsappNumber = '';
let editingId = null;
let staticPreview = false;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}
function saveCart() { localStorage.setItem('sur-cart', JSON.stringify(cart)); renderCart(); }
function loadProductInfo() { return products.find(p => p.id === arguments[0]); }

async function loadStore() {
  try {
    [products, { whatsappNumber }] = await Promise.all([api('./api/products'), api('./api/config')]);
  } catch {
    staticPreview = true;
    try {
      const [catalog, config] = await Promise.all([fetch('./catalog.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }), fetch('./site-config.json').then(r => { if (!r.ok) throw new Error(); return r.json(); })]);
      products = catalog;
      whatsappNumber = String(config.whatsappNumber || '').replace(/\D/g, '');
    } catch { products = []; }
  }
  populateFilters(); renderProducts(); renderCart();
}
function populateFilters() {
  for (const [id, key] of [['type-filter', 'type'], ['color-filter', 'color']]) {
    const select = $(`#${id}`);
    const selected = filters[key];
    const values = [...new Set(products.map(p => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    select.innerHTML = `<option value="">Todos</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}`;
    select.value = selected;
  }
}
function filteredProducts() {
  let list = products.filter(p => p.active !== false);
  if (filters.search) {
    const term = filters.search.toLocaleLowerCase('es');
    list = list.filter(p => [p.name, p.category, p.type, p.style, p.color, p.description].some(v => String(v || '').toLocaleLowerCase('es').includes(term)));
  }
  if (filters.category) list = list.filter(p => p.category === filters.category);
  if (filters.type) list = list.filter(p => p.type === filters.type);
  if (filters.style) list = list.filter(p => p.style === filters.style);
  if (filters.color) list = list.filter(p => p.color === filters.color);
  if (filters.sort === 'low') list.sort((a, b) => a.price - b.price);
  if (filters.sort === 'high') list.sort((a, b) => b.price - a.price);
  if (filters.sort === 'new') list.reverse();
  if (filters.sort === 'featured') list.sort((a, b) => Number(b.featured) - Number(a.featured));
  return list;
}
function renderProducts() {
  const list = filteredProducts();
  $('#result-count').textContent = `${list.length} ${list.length === 1 ? 'prenda' : 'prendas'}`;
  $('#product-grid').innerHTML = list.map(p => `
    <article class="product-card">
      <div class="product-image-wrap">
        <img class="product-image" src="${escapeHtml(p.image || '')}" alt="${escapeHtml(p.name)}" loading="lazy">
        ${p.featured ? '<span class="product-badge">SELECCIÓN</span>' : ''}
        <button class="quick-add" data-add="${escapeHtml(p.id)}" aria-label="Agregar ${escapeHtml(p.name)} a la bolsa">+</button>
      </div>
      <div class="product-info"><div class="product-meta"><span>${escapeHtml(p.category)} · ${escapeHtml(p.type)}</span><span>${escapeHtml(p.style)}</span></div><h3 class="product-name">${escapeHtml(p.name)}</h3><div class="product-bottom"><span class="product-price">${money(p.price)}</span><span class="product-color">${escapeHtml(p.color || '')}</span></div></div>
    </article>`).join('');
  $('#empty-state').classList.toggle('hidden', list.length > 0);
  $('#product-grid').classList.toggle('hidden', list.length === 0);
  const chips = ['category', 'type', 'style', 'color'].filter(key => filters[key]);
  $('#active-filters').innerHTML = chips.map(key => `<button class="filter-chip" data-clear="${key}">${escapeHtml(filters[key])} ×</button>`).join('');
}
function addToCart(id) { cart[id] = (cart[id] || 0) + 1; saveCart(); openCart(); }
function cartItems() { return Object.entries(cart).map(([id, quantity]) => ({ product: loadProductInfo(id), quantity: Number(quantity) })).filter(x => x.product && x.quantity > 0); }
function renderCart() {
  const items = cartItems();
  const count = items.reduce((sum, x) => sum + x.quantity, 0);
  const total = items.reduce((sum, x) => sum + x.product.price * x.quantity, 0);
  $('#cart-count').textContent = count;
  $('#drawer-count').textContent = `(${count})`;
  $('#cart-total').textContent = money(total);
  $('#cart-items').innerHTML = items.length ? items.map(({ product: p, quantity }) => `<article class="cart-row"><img src="${escapeHtml(p.image || '')}" alt="${escapeHtml(p.name)}"><div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.size || 'Talla a coordinar')} · ${escapeHtml(p.color || '')}</p><div class="quantity"><button data-quantity="${escapeHtml(p.id)}" data-change="-1" aria-label="Quitar una unidad">−</button><span>${quantity}</span><button data-quantity="${escapeHtml(p.id)}" data-change="1" aria-label="Agregar una unidad">+</button></div></div><span class="cart-row-price">${money(p.price * quantity)}</span></article>`).join('') : '<div class="cart-empty">Tu bolsa está esperando una favorita ✳</div>';
  $('#whatsapp-order').disabled = !items.length;
}
function openCart() { $('#cart-drawer').classList.add('open'); $('#cart-drawer').setAttribute('aria-hidden', 'false'); $('#overlay').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeDrawers() { $('#cart-drawer').classList.remove('open'); $('#cart-drawer').setAttribute('aria-hidden', 'true'); $('#overlay').classList.add('hidden'); document.body.style.overflow = ''; }
function sendWhatsApp() {
  const items = cartItems();
  if (!items.length) return;
  if (!whatsappNumber) { alert('La tienda aún no configuró su número de WhatsApp.'); return; }
  const lines = items.map(({ product: p, quantity }) => `• ${p.name} — ${quantity} x ${money(p.price)} | Talla: ${p.size || 'a coordinar'} | Color: ${p.color || 'a coordinar'}`);
  const total = items.reduce((sum, x) => sum + x.product.price * x.quantity, 0);
  const note = $('#order-note').value.trim();
  const text = `Hola, quiero consultar por este pedido de Sur Studio:\n\n${lines.join('\n')}\n\nSubtotal referencial: ${money(total)}${note ? `\n\nComentario: ${note}` : ''}\n\n¿Me confirman disponibilidad, pago y despacho?`;
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

function showAdmin() {
  closeDrawers();
  $('#admin-modal').classList.remove('hidden');
  renderAdmin();
}
function hideAdmin() { $('#admin-modal').classList.add('hidden'); }
async function renderAdmin() {
  const content = $('#admin-content');
  if (staticPreview) {
    content.innerHTML = '<div class="admin-login"><p class="eyebrow">VISTA DE PREVISUALIZACIÓN</p><h2>Administración en Node</h2><p>GitHub Pages publica solo esta vitrina estática. Para iniciar sesión y administrar prendas, ejecuta el servidor Node siguiendo la guía del proyecto.</p></div>';
    return;
  }
  content.innerHTML = '<div class="admin-login"><p class="eyebrow">GESTIÓN DE CATÁLOGO</p><h2>Vista de administración</h2><p>Ingresa con las credenciales configuradas en el servidor.</p><div class="admin-form"><label>Usuario<input id="admin-user" autocomplete="username"></label><label>Contraseña<input id="admin-password" type="password" autocomplete="current-password"></label><button class="button button-dark" id="admin-login-button">Ingresar <span>↗</span></button><div class="admin-error" id="admin-error"></div></div></div>';
  try { const status = await api('./api/admin/status'); if (status.authenticated) await renderAdminPanel(); }
  catch {
    staticPreview = true;
    content.innerHTML = '<div class="admin-login"><p class="eyebrow">VISTA DE PREVISUALIZACIÓN</p><h2>Administración en Node</h2><p>GitHub Pages publica solo esta vitrina estática. Para iniciar sesión y administrar prendas, ejecuta el servidor Node siguiendo la guía del proyecto.</p></div>';
  }
}
async function loginAdmin() {
  const error = $('#admin-error');
  try {
    await api('./api/admin/login', { method: 'POST', body: JSON.stringify({ username: $('#admin-user').value, password: $('#admin-password').value }) });
    await renderAdminPanel();
  } catch (e) { error.textContent = e.message; }
}
async function renderAdminPanel() {
  let list;
  try { list = await api('./api/admin/products'); }
  catch (e) { $('#admin-content').innerHTML = `<div class="admin-login"><p class="admin-error">${escapeHtml(e.message)}</p></div>`; return; }
  const content = $('#admin-content');
  content.innerHTML = `<div class="admin-panel"><div class="admin-bar"><div><p class="eyebrow">CATÁLOGO</p><h2>Prendas publicadas</h2><p class="admin-sub">${list.length} productos en tu colección. Los cambios se guardan automáticamente.</p></div><div class="admin-actions"><button class="button button-dark" id="admin-new">+ Agregar prenda</button><button class="button-soft" id="admin-logout">Salir</button></div></div><div class="admin-list">${list.length ? `<table class="admin-table"><thead><tr><th>Prenda</th><th>Precio</th><th>Estilo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${list.map(p => `<tr><td>${escapeHtml(p.name)}<br><small>${escapeHtml(p.category)} · ${escapeHtml(p.type)}</small></td><td>${money(p.price)}</td><td>${escapeHtml(p.style)}</td><td class="${p.active ? '' : 'status-off'}">${p.active ? 'Publicada' : 'Oculta'}</td><td><button data-edit="${escapeHtml(p.id)}">Editar</button><button data-toggle="${escapeHtml(p.id)}">${p.active ? 'Ocultar' : 'Publicar'}</button><button data-delete="${escapeHtml(p.id)}">Borrar</button></td></tr>`).join('')}</tbody></table>` : '<p class="admin-sub">Todavía no hay prendas. Agrega la primera para comenzar.</p>'}</div><div id="admin-editor"></div></div>`;
}
function editorForm(product = {}) {
  editingId = product.id || null;
  const host = $('#admin-editor');
  host.innerHTML = `<div class="admin-editor"><h3>${editingId ? 'Editar prenda' : 'Agregar prenda'}</h3><form class="admin-form" id="product-form"><div class="form-two"><label>Nombre<input name="name" required maxlength="120" value="${escapeHtml(product.name || '')}"></label><label>Precio CLP<input name="price" type="number" min="0" step="1" required value="${escapeHtml(product.price || '')}"></label><label>Categoría<select name="category" required>${['Mujer','Hombre','Niños'].map(v => `<option ${product.category === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Tipo de prenda<input name="type" required placeholder="Vestidos, poleras..." value="${escapeHtml(product.type || '')}"></label><label>Estilo<select name="style">${['Casual','Urbano','Veraniego','Formal','Deportivo','Boho','Minimalista','Clásico'].map(v => `<option ${product.style === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>Tallas disponibles<input name="size" placeholder="S, M, L" value="${escapeHtml(product.size || '')}"></label><label>Color<input name="color" value="${escapeHtml(product.color || '')}"></label><label>Imagen (URL Unsplash)<input name="image" type="url" placeholder="https://images.unsplash.com/..." value="${escapeHtml(product.image || '')}"></label></div><label>Descripción<textarea name="description" rows="3" maxlength="500">${escapeHtml(product.description || '')}</textarea></label><label><span><input name="featured" type="checkbox" ${product.featured ? 'checked' : ''}> Destacar en la colección</span></label><label><span><input name="active" type="checkbox" ${product.active !== false ? 'checked' : ''}> Publicada en la tienda</span></label><div class="admin-actions"><button class="button button-dark" type="submit">Guardar prenda</button><button class="button-soft" type="button" id="cancel-editor">Cancelar</button><span class="admin-error" id="product-error"></span></div></form></div>`;
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function submitProduct(form) {
  const data = Object.fromEntries(new FormData(form));
  data.featured = form.elements.featured.checked;
  data.active = form.elements.active.checked;
  try {
    await api(editingId ? `./api/admin/products/${encodeURIComponent(editingId)}` : './api/admin/products', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(data) });
    editingId = null;
    await renderAdminPanel();
    await loadStore();
  } catch (e) { $('#product-error').textContent = e.message; }
}

document.addEventListener('input', event => {
  if (event.target.id === 'search') { filters.search = event.target.value.trim(); renderProducts(); }
});
document.addEventListener('change', event => {
  if (event.target.id === 'category-filter') filters.category = event.target.value;
  if (event.target.id === 'type-filter') filters.type = event.target.value;
  if (event.target.id === 'style-filter') filters.style = event.target.value;
  if (event.target.id === 'color-filter') filters.color = event.target.value;
  if (event.target.id === 'sort-filter') filters.sort = event.target.value;
  if (['category-filter','type-filter','style-filter','color-filter','sort-filter'].includes(event.target.id)) renderProducts();
});
document.addEventListener('click', async event => {
  const add = event.target.closest('[data-add]'); if (add) addToCart(add.dataset.add);
  const qty = event.target.closest('[data-quantity]'); if (qty) { const id = qty.dataset.quantity; cart[id] = (cart[id] || 0) + Number(qty.dataset.change); if (cart[id] <= 0) delete cart[id]; saveCart(); }
  const chip = event.target.closest('[data-clear]'); if (chip) { filters[chip.dataset.clear] = ''; $(`#${chip.dataset.clear}-filter`).value = ''; renderProducts(); }
  if (event.target.closest('#clear-filters')) { filters.search = filters.category = filters.type = filters.style = filters.color = ''; $('#search').value = ''; $('#category-filter').value = ''; $('#type-filter').value = ''; $('#style-filter').value = ''; $('#color-filter').value = ''; renderProducts(); }
  if (event.target.closest('#cart-open')) openCart();
  if (event.target.closest('#cart-close') || event.target.id === 'overlay') closeDrawers();
  if (event.target.closest('#whatsapp-order')) sendWhatsApp();
  if (event.target.closest('#admin-open')) showAdmin();
  if (event.target.closest('#admin-close')) hideAdmin();
  if (event.target.closest('#admin-login-button')) loginAdmin();
  if (event.target.closest('#admin-new')) editorForm({ active: true });
  if (event.target.closest('#cancel-editor')) { $('#admin-editor').innerHTML = ''; editingId = null; }
  if (event.target.closest('#admin-logout')) { await api('./api/admin/logout', { method: 'POST', body: '{}' }); await renderAdmin(); }
  const edit = event.target.closest('[data-edit]');
  if (edit) { const list = await api('./api/admin/products'); editorForm(list.find(p => p.id === edit.dataset.edit)); }
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) { const list = await api('./api/admin/products'); const item = list.find(p => p.id === toggle.dataset.toggle); await api(`./api/admin/products/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ ...item, active: !item.active }) }); await renderAdminPanel(); await loadStore(); }
  const del = event.target.closest('[data-delete]');
  if (del && confirm('¿Borrar esta prenda del catálogo?')) { await api(`./api/admin/products/${encodeURIComponent(del.dataset.delete)}`, { method: 'DELETE' }); await renderAdminPanel(); await loadStore(); }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'product-form') { event.preventDefault(); submitProduct(event.target); }
});
$$('[data-category-link]').forEach(link => link.addEventListener('click', () => { filters.category = link.dataset.categoryLink; $('#category-filter').value = filters.category; renderProducts(); }));
loadStore();

