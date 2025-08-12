// admin.js
import { db } from "./firebase-config.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = s => document.querySelector(s);
const money = n => (n||0).toLocaleString('vi-VN') + '₫';
function toNum(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }

function requireAdmin(){
  return document.getElementById('adminPanel')?.style.display !== 'none';
}

// ---- Products ----
function mountProducts(){
  if (!requireAdmin()) return;
  const rows = $('#ad_rows');
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap)=>{
    rows.innerHTML='';
    snap.forEach(docu=>{
      const p = { id: docu.id, ...docu.data() };
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.name||''}</td><td>${p.price??''}</td><td>${p.original_price??''}</td>
                      <td>${p.is_sale?'✔':''}</td>
                      <td>${p.image?`<a href="${p.image}" target="_blank">Xem</a>`:''}</td>
                      <td><button data-ed="${p.id}">Sửa</button> <button data-del="${p.id}">Xoá</button></td>`;
      rows.appendChild(tr);
    });
    rows.querySelectorAll('button[data-ed]').forEach(b=> b.onclick = async ()=>{
      const snap = await getDoc(doc(db,'products', b.dataset.ed));
      const p = snap.data()||{};
      $('#ad_docId').value = snap.id;
      $('#ad_name').value = p.name||'';
      $('#ad_price').value = p.price||'';
      $('#ad_original_price').value = p.original_price||'';
      $('#ad_image').value = p.image||'';
      $('#ad_is_sale').checked = !!p.is_sale;
      window.scrollTo({top:0,behavior:'smooth'});
    });
    rows.querySelectorAll('button[data-del]').forEach(b=> b.onclick = async ()=>{
      if (!confirm('Xoá sản phẩm này?')) return;
      await deleteDoc(doc(db,'products', b.dataset.del));
    });
  });

  $('#ad_save').onclick = async ()=>{
    const payload = {
      name: $('#ad_name').value.trim(),
      price: toNum($('#ad_price').value),
      original_price: toNum($('#ad_original_price').value),
      image: $('#ad_image').value.trim(),
      is_sale: $('#ad_is_sale').checked,
      updatedAt: serverTimestamp(),
    };
    if (!payload.name) { alert('Nhập tên sản phẩm'); return; }
    const id = $('#ad_docId').value;
    if (id) await updateDoc(doc(db,'products',id), payload);
    else await addDoc(collection(db,'products'), { ...payload, createdAt: serverTimestamp() });
    $('#ad_docId').value=''; $('#ad_name').value=''; $('#ad_price').value=''; $('#ad_original_price').value=''; $('#ad_image').value=''; $('#ad_is_sale').checked=false;
  };
  $('#ad_reset').onclick = ()=>{ $('#ad_docId').value=''; $('#ad_name').value=''; $('#ad_price').value=''; $('#ad_original_price').value=''; $('#ad_image').value=''; $('#ad_is_sale').checked=false; };
}

// ---- Users ----
function mountUsers(){
  if (!requireAdmin()) return;
  const rows = $('#user_rows');
  const q = query(collection(db,'users'), orderBy('displayName'));
  onSnapshot(q, (snap)=>{
    rows.innerHTML='';
    snap.forEach(docu=>{
      const u = { id: docu.id, ...docu.data() };
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.email||''}</td><td>${u.displayName||''}</td><td>${u.role||'user'}</td><td>${money(u.balance||0)}</td>
                      <td>
                        <button data-topup="${u.id}">Nạp</button>
                        <button data-deduct="${u.id}">Rút</button>
                        <button data-role="${u.id}">Đổi role</button>
                      </td>`;
      rows.appendChild(tr);
    });
    rows.querySelectorAll('button[data-topup]').forEach(b=> b.onclick = ()=> adjustBalance(b.dataset.topup, +prompt('Nạp bao nhiêu? (VND)', '0')||0));
    rows.querySelectorAll('button[data-deduct]').forEach(b=> b.onclick = ()=> adjustBalance(b.dataset.deduct, -(+prompt('Rút bao nhiêu? (VND)', '0')||0)));
    rows.querySelectorAll('button[data-role]').forEach(b=> b.onclick = ()=> changeRole(b.dataset.role));
  });
}

async function adjustBalance(uid, delta){
  if (!delta) return;
  const ref = doc(db,'users', uid);
  const snap = await getDoc(ref);
  const cur = (snap.data()?.balance)||0;
  const next = Math.max(0, cur + delta);
  await updateDoc(ref, { balance: next, updatedAt: serverTimestamp() });
}
async function changeRole(uid){
  const ref = doc(db,'users', uid);
  const snap = await getDoc(ref);
  const cur = snap.data()?.role||'user';
  const next = (cur==='admin')?'user':'admin';
  if (!confirm(`Đổi role ${cur} -> ${next}?`)) return;
  await updateDoc(ref, { role: next, updatedAt: serverTimestamp() });
}

// ---- Orders (tối giản) ----
function mountOrders(){
  if (!requireAdmin()) return;
  const rows = $('#order_rows');
  const q = query(collection(db,'orders'), orderBy('createdAt','desc'));
  onSnapshot(q, (snap)=>{
    rows.innerHTML='';
    snap.forEach(docu=>{
      const o = { id: docu.id, ...docu.data() };
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${o.id}</td><td>${o.user?.email||o.userId||''}</td><td>${money(o.total||0)}</td>
                      <td>${o.paymentMethod||''}</td><td>${o.status||''}</td>
                      <td>${renderOrderActions(o)}</td>`;
      rows.appendChild(tr);
    });
    rows.querySelectorAll('[data-confirm-wallet]').forEach(b=> b.onclick = ()=> confirmWallet(b.dataset.id));
    rows.querySelectorAll('[data-mark-paid]').forEach(b=> b.onclick = ()=> markPaid(b.dataset.id));
  });
}
function renderOrderActions(o){
  if (o.paymentMethod==='WALLET' && o.status==='awaiting_admin'){
    return `<button data-confirm-wallet="${o.id}">Xác nhận trừ ví</button>`;
  }
  if (o.status!=='paid'){
    return `<button data-mark-paid="${o.id}">Đánh dấu đã thanh toán</button>`;
  }
  return '';
}
async function confirmWallet(id){
  const ref = doc(db,'orders', id);
  const snap = await getDoc(ref); const o = snap.data();
  if (!o) return;
  const uref = doc(db,'users', o.userId);
  const us = await getDoc(uref); const cur = (us.data()?.balance)||0;
  if (cur < (o.total||0)) { alert('Số dư không đủ'); return; }
  await updateDoc(uref, { balance: cur - (o.total||0), updatedAt: serverTimestamp() });
  await updateDoc(ref, { status: 'paid', paidAt: serverTimestamp() });
}
async function markPaid(id){
  const ref = doc(db,'orders', id);
  await updateDoc(ref, { status: 'paid', paidAt: serverTimestamp() });
}

// Boot
window.addEventListener('load', ()=>{
  const observer = new MutationObserver(()=>{
    const show = document.getElementById('adminPanel')?.style.display !== 'none';
    if (show && !observer._mounted){ mountProducts(); mountUsers(); mountOrders(); observer._mounted = true; }
  });
  observer.observe(document.body, { attributes:true, childList:true, subtree:true });
});
