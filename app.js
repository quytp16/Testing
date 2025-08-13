
// app.js — minimal cart & drawer controller
(function () {
  const drawer = document.getElementById('cartDrawer');
  const btnOpen = document.getElementById('openCart');
  const btnX = document.getElementById('xCart');
  const overlay = document.getElementById('closeCart');
  const listEl = document.getElementById('drawerItems');
  const totalEl = document.getElementById('drawerTotal');
  const countEl = document.getElementById('cartCount');
  const toast = document.getElementById('toast');

  const fmt = (n) => (new Intl.NumberFormat('vi-VN').format(n || 0) + '₫');

  // ---- Cart storage helpers ----
  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch {
      return [];
    }
  }
  function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateBadge(cart);
  }
  function updateBadge(cart = loadCart()) {
    if (countEl) countEl.textContent = cart.reduce((s, i) => s + (i.qty || 1), 0);
  }

  // ---- Drawer open/close ----
  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('open');
    renderDrawer();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('open');
  }

  // ---- Drawer rendering ----
  function renderDrawer() {
    if (!listEl || !totalEl) return;
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
      const line = price * qty;
      sum += line;
      return `
        <div class="drawer__item" data-idx="${idx}">
          <img src="${i.image || ''}" alt="" onerror="this.style.display='none'"/>
          <div class="drawer__meta">
            <div class="drawer__name">${i.name || 'Sản phẩm'}</div>
            <div class="drawer__price">${fmt(price)}</div>
            <div class="qty">
              <button class="qty__btn" data-act="dec">-</button>
              <input class="qty__input" type="number" min="1" value="${qty}" />
              <button class="qty__btn" data-act="inc">+</button>
              <button class="icon-btn" data-act="remove" aria-label="Xóa">×</button>
            </div>
          </div>
        </div>`;
    }).join('');
    totalEl.textContent = fmt(sum);
    updateBadge(cart);
  }

  // ---- Quantity & remove inside drawer (event delegation) ----
  listEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = e.target.closest('[data-idx]');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    const cart = loadCart();
    if (Number.isNaN(idx) || idx < 0 || idx >= cart.length) return;

    const act = btn.dataset.act;
    if (act === 'remove') {
      cart.splice(idx, 1);
    } else if (act === 'inc') {
      cart[idx].qty = (cart[idx].qty || 1) + 1;
    } else if (act === 'dec') {
      cart[idx].qty = Math.max(1, (cart[idx].qty || 1) - 1);
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
    const val = Math.max(1, Number(input.value || 1));
    cart[idx].qty = val;
    saveCart(cart);
    renderDrawer();
  });

  // ---- Wire open/close buttons ----
  btnOpen?.addEventListener('click', openDrawer);
  overlay?.addEventListener('click', closeDrawer);
  btnX?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // ---- Global addToCart helper (use from product buttons if needed) ----
  // Usage (example):
  //   <button onclick="addToCart({id:'p1',name:'Điếu cày',price:100000,image:'...'})">Mua ngay</button>
  window.addToCart = function (item) {
    if (!item) return;
    const cart = loadCart();
    const idx = cart.findIndex(x => String(x.id) === String(item.id));
    if (idx >= 0) {
      cart[idx].qty = (cart[idx].qty || 1) + (Number(item.qty) || 1);
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
    if (toast) {
      toast.textContent = 'Đã thêm vào giỏ hàng';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1200);
    }
  };

  // Fallback: event delegation for generic buttons with data attributes
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-cart],[data-add]');
    if (!btn) return;
    const item = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: Number(btn.dataset.price || 0),
      image: btn.dataset.image,
      qty: Number(btn.dataset.qty || 1)
    };
    window.addToCart(item);
  });

  // Init
  updateBadge();
  renderDrawer();

  // Optional: ensure CSS visibility if theme misses it
  // (Only applies when .drawer.open is not styled in CSS)
  // We use inline style guards to avoid double-defining.
  if (drawer && getComputedStyle(drawer).display === 'none') {
    // do nothing; site CSS already handles display
  }
})();
