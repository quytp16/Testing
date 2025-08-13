
// assets/shop.js — Render products to .products grids (homepage + flash-sale)
// Requires: firebase-config.js exports db; Firestore has collection 'products'
import { db } from './firebase-config.js';
import {
  collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const money = n => (Number(n)||0).toLocaleString('vi-VN') + '₫';
const $ = (s)=>document.querySelector(s);

/* ---------- Card renderer (4:3 image, consistent with style.css) ---------- */
function cardHTML(p){
  return `
  <div class="card">
    <div class="product__thumb">
      ${p.is_sale ? `<span class="product__badge">SALE</span>` : ''}
      <img src="${p.image || 'img/logo.jpg'}" alt="${p.name || ''}"/>
    </div>
    <div class="product__body">
      <h3 class="product__title">${p.name || ''}</h3>
      <div class="product__price">
        <span class="price">${money(p.price||0)}</span>
        ${p.original_price ? `<del>${money(p.original_price)}</del>` : ''}
      </div>
      <div class="product__actions">
        <button class="btn buy-now" data-id="${p.id}" data-name="${p.name||''}" data-price="${Number(p.price||0)}" data-image="${p.image||''}">Mua ngay</button>
      </div>
    </div>
  </div>`;
}

/* ---------- Fetch helpers ---------- */
async function fetchAllProducts(){
  const snap = await getDocs(query(collection(db,'products'), orderBy('name', 'asc')));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function fetchFlashSale(){
  const snap = await getDocs(query(collection(db,'products'), where('is_sale','==', true), orderBy('name','asc')));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
async function fetchFeatured(){
  // Featured = đang sale, hoặc lấy vài sản phẩm đầu
  const sale = await fetchFlashSale();
  if (sale.length) return sale;
  const snap = await getDocs(query(collection(db,'products'), orderBy('name','asc'), limit(8)));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

/* ---------- Render helpers ---------- */
function bindBuyNow(container){
  container.addEventListener('click', (e)=>{
    const btn = e.target.closest('.buy-now');
    if (!btn) return;
    const item = {
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: Number(btn.dataset.price||0),
      image: btn.dataset.image || '',
      qty: 1
    };
    if (typeof window.addToCart === 'function') {
      window.addToCart(item);
    } else {
      // Minimal local cart add (fallback)
      try {
        const cart = JSON.parse(localStorage.getItem('cart')||'[]');
        const idx = cart.findIndex(x => String(x.id) === String(item.id));
        if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty)||1) + 1;
        else cart.push(item);
        localStorage.setItem('cart', JSON.stringify(cart));
        alert('Đã thêm vào giỏ hàng');
      } catch {}
    }
  });
}

async function renderTo(containerSelector, productsPromise){
  const el = $(containerSelector);
  if (!el) return;
  el.innerHTML = '<div class="muted">Đang tải...</div>';
  try{
    const list = await productsPromise;
    if (!list.length){
      el.innerHTML = '<div class="muted">Chưa có sản phẩm.</div>';
      return;
    }
    el.innerHTML = list.map(cardHTML).join('');
    bindBuyNow(el);
  }catch(e){
    console.error(e);
    el.innerHTML = '<div class="muted">Lỗi tải sản phẩm.</div>';
  }
}

/* ---------- Public render APIs ---------- */
export async function renderProducts(opts={}){
  const selector = opts.container || '#products .products';
  await renderTo(selector, fetchAllProducts());
}
export async function renderFeatured(opts={}){
  const selector = opts.container || '#featured .products';
  await renderTo(selector, fetchFeatured());
}
export async function renderFlashSale(opts={}){
  const selector = opts.container || '.products';
  await renderTo(selector, fetchFlashSale());
}

/* ---------- Auto-init on pages that have matching containers ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  if (document.querySelector('#products .products')) renderProducts();
  if (document.querySelector('#featured .products')) renderFeatured();
  // Flash-sale page will call renderFlashSale directly in its own script.
});
