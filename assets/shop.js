
// assets/shop.js
import { db } from "./firebase-config.js";
import {
  collection, getDocs, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function vnd(n) {
  if (n === null || n === undefined) return "";
  try { return Number(n).toLocaleString('vi-VN') + '₫'; } catch { return n + '₫'; }
}

function productCard(p) {
  const orig = p.original_price ? `<del>${vnd(p.original_price)}</del>` : "";
  const badge = p.is_sale ? `<div class="product__badge">Flash sale</div>` : "";
  const price = p.price ? vnd(p.price) : "";
  const dataAdd = JSON.stringify({id: p.id || p.slug || p._id || crypto.randomUUID(), name: p.name, price: Number(p.price||0)});
  return `
  <div class="card product">
    <div class="product__thumb" tabindex="0">
      ${badge}
      <img src="${p.image || 'img/placeholder.png'}" alt="${p.name || ''}">
    </div>
    <div class="product__body">
      <h3 class="product__title">${p.name || ''}</h3>
      <div class="product__price">${orig}<strong>${price}</strong></div>
    </div>
    <div class="product__actions">
      <button class="btn btn--small" data-add='${dataAdd}'>Mua ngay</button>
    </div>
  </div>`;
}

async function render(container, filterSale=false) {
  const listEl = container.querySelector(".products") || container;
  listEl.innerHTML = `<p>Đang tải sản phẩm…</p>`;
  try {
    let q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    if (filterSale) q = query(collection(db, "products"), where("is_sale","==", true), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({id: d.id, ...d.data()}));
    if (items.length === 0) {
      listEl.innerHTML = `<p>Chưa có sản phẩm.</p>`;
      return;
    }
    listEl.innerHTML = items.map(productCard).join("");
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p>Lỗi tải danh sách sản phẩm.</p>`;
  }
}

(function bootstrap(){
  const flashSection = document.getElementById("flash-sale");
  const mainProducts = document.getElementById("products") || document.querySelector("section#products");
  if (flashSection) render(flashSection, true);
  if (mainProducts) render(mainProducts, false);
})();
