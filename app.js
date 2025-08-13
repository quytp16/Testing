
// app.js — tailored for current HTML/CSS (drawer__overlay inside #cartDrawer)
(function () {
  // ---- Element refs
  const $ = (s) => document.querySelector(s);
  const drawer     = $('#cartDrawer');
  const btnOpen    = $('#openCart');
  const btnClose   = $('#xCart');
  const overlay    = $('#closeCart');
  const listEl     = $('#drawerItems');
  const totalEl    = $('#drawerTotal');
  const countEl    = $('#cartCount');
  const toastEl    = $('#toast');

  // ---- Utils
  const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0) + '₫';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem('cart') || '[]'); }
    catch { return []; }
  }
  function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateBadge(cart);
  }
  function updateBadge(cart = loadCart()) {
    if (!countEl) return;
    const c = cart.reduce((s, i) => s + (Number(i.qty) || 1), 0);
    countEl.textContent = String(c);
  }

  // ---- Drawer
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    renderDrawer();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
  }

  // ---- Render items
function renderDrawer() {
  if (!listEl) return;
  const cart = loadCart();
  if (!cart.length) {
    listEl.innerHTML = '<div class="muted" style="padding:8px 0">Giỏ hàng trống.</div>';
    totalEl.textContent = fmt(0);
    updateBadge(cart);
    return;
  }
  let sum = 0;
  listEl.innerHTML = cart.map((i, idx) => {
    const price = Number(i.price || 0);
    const qty = Number(i.qty || 1);
    sum += price * qty;
    return `
      <div class="drawer__item" data-idx="${idx}" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="font-weight:600">${i.name || 'Sản phẩm'}</div>
        <div class="qty" style="display:flex;gap:6px;align-items:center">
          <button class="qty__btn" data-act="dec">-</button>
          <input class="qty__input" type="number" min="1" value="${qty}" style="width:54px;text-align:center">
          <button class="qty__btn" data-act="inc">+</button>
        </div>
      </div>`;
  }).join('');
  totalEl.textContent = fmt(sum);
  updateBadge(cart);
}

  // ---- Event delegation for qty/remove
  listEl?.addEventListener('click', (e) => {
    const actBtn = e.target.closest('[data-act]');
    if (!actBtn) return;
    const row = e.target.closest('[data-idx]');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const cart = loadCart();
    if (Number.isNaN(idx) || idx < 0 || idx >= cart.length) return;

    const act = actBtn.dataset.act;
    if (act === 'remove') {
      cart.splice(idx, 1);
    } else if (act === 'inc') {
      cart[idx].qty = (Number(cart[idx].qty) || 1) + 1;
    } else if (act === 'dec') {
      cart[idx].qty = Math.max(1, (Number(cart[idx].qty) || 1) - 1);
    }
    saveCart(cart);
    renderDrawer();
  });
  listEl?.addEventListener('change', (e) => {
    const input = e.target.closest('.qty__input');
    if (!input) return;
    const row = e.target.closest('[data-idx]');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const cart = loadCart();
    cart[idx].qty = Math.max(1, Number(input.value || 1));
    saveCart(cart);
    renderDrawer();
  });

  // ---- Wire controls
  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // ---- Add to cart API
  window.addToCart = function (item) {
    if (!item) return;
    const cart = loadCart();
    const key = String(item.id ?? '');
    const idx = cart.findIndex(x => String(x.id ?? '') === key && key !== '');
    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty) || 1) + (Number(item.qty) || 1);
    } else {
      cart.push({
        id: item.id ?? Date.now(),
        name: item.name ?? 'Sản phẩm',
        price: Number(item.price || 0),
        qty: Number(item.qty || 1),
        image: item.image || ''
      });
    }
    saveCart(cart);
    renderDrawer();
    openDrawer();
    if (toastEl) {
      toastEl.textContent = 'Đã thêm vào giỏ hàng';
      toastEl.style.display = 'block';
      setTimeout(() => { toastEl.style.display = 'none'; }, 1200);
    }
  };

  // ---- Auto-bind buttons with data attributes
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-cart],[data-add]');
    if (!btn) return;
    const item = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: Number(btn.dataset.price || 0),
      image: btn.dataset.image,
      qty: Number(btn.dataset.qty || 1),
    };
    window.addToCart(item);
  });

  // ---- Init
  updateBadge();
  renderDrawer();
})();
