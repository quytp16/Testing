// shop.js
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, where, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const money = n => (n||0).toLocaleString('vi-VN') + '₫';

function addToCart(item){
  const cart = JSON.parse(localStorage.getItem('cart')||'[]');
  const idx = cart.findIndex(x => x.id === item.id);
  if (idx >= 0) cart[idx].qty += 1;
  else cart.push({ id: item.id, name: item.name, price: item.price, image: item.image, qty: 1 });
  localStorage.setItem('cart', JSON.stringify(cart));
  const t = document.getElementById('toast');
  if (t){ t.textContent = 'Đã thêm vào giỏ hàng'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1500); }
  const cc = document.getElementById('cartCount');
  if (cc){ const total = cart.reduce((s,i)=>s+i.qty,0); cc.textContent = total; }
}

function cardHTML(p){
  const showStrike = (typeof p.original_price === 'number') && (p.original_price > (p.price||0));
  return `
  <div class="product">
    <div class="product__media">
      <img src="${p.image || 'img/logo.jpg'}" alt="${p.name || ''}"/>
    </div>
    <div class="product__body">
      <h3 class="product__title">${p.name || ''}</h3>
      <div class="product__price">
        <span class="price">${money(p.price||0)}</span>
        ${showStrike ? `<span class="price--strike">${money(p.original_price)}</span>` : ''}
      </div>
      <button class="btn buy-now" data-id="${p.id}">Mua ngay</button>
    </div>
  </div>`;
}
" alt="${p.name || ''}"/>
    </div>
    <div class="product__body">
      <h3 class="product__title">${p.name || ''}</h3>
      <div class="product__price">
        <span class="price">${money(p.price||0)}</span>
        ${p.original_price ? `<span class="price--strike">${money(p.original_price)}</span>` : ''}
      </div>
      <button class="btn buy-now" data-id="${p.id}">Mua ngay</button>
    </div>
  </div>`;
}

async function _safeGetDocs(qry, fallback){
  try { return await getDocs(qry); }
  catch(e){
    if (fallback){ try { return await getDocs(fallback); } catch(ex){ console.error(ex); throw ex; } }
    console.error(e);
    throw e;
  }
}

export async function renderFlashSale({ container = '#flashList' } = {}){
  const el = document.querySelector(container);
  if (!el) return;
  el.innerHTML = '<div class="muted">Đang tải...</div>';
  const col = collection(db, 'products');
  const qMain = query(col, where('is_sale','==', true), orderBy('createdAt','desc'));
  const qFallback = query(col, where('is_sale','==', true)); // nếu thiếu index

  const snap = await _safeGetDocs(qMain, qFallback);
  if (snap.empty){ el.innerHTML = '<div class="muted">Chưa có sản phẩm Flash Sale.</div>'; return; }

  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  el.innerHTML = items.map(cardHTML).join('');

  el.querySelectorAll('.buy-now').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = items.find(x => x.id === btn.dataset.id);
      if (p) addToCart(p);
    });
  });
}

export async function renderProducts({ container = '#products .products' } = {}){
  const el = document.querySelector(container);
  if (!el) return;
  el.innerHTML = '<div class="muted">Đang tải...</div>';
  const col = collection(db, 'products');
  const qMain = query(col, orderBy('createdAt','desc'), limit(24));
  const snap = await _safeGetDocs(qMain);
  const items = [];
  snap.forEach(d => items.push({ id: d.id, ...d.data() }));
  if (!items.length){ el.innerHTML = '<div class="muted">Chưa có sản phẩm.</div>'; return; }
  el.innerHTML = items.map(cardHTML).join('');
  el.querySelectorAll('.buy-now').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = items.find(x => x.id === btn.dataset.id);
      if (p) addToCart(p);
    });
  });
}

// auto render products if container exists (homepage)
document.addEventListener('DOMContentLoaded', ()=>{
  const hasHomeProducts = document.querySelector('#products .products');
  if (hasHomeProducts) renderProducts({ container: '#products .products' });
});
