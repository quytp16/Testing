// admin.js — add Deposit/Withdraw to Users tab + wallet-deduct in Orders
import { db } from "./firebase-config.js";
import {
  collection, updateDoc, deleteDoc, doc, getDoc, getDocs,
  onSnapshot, orderBy, query, where, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const moneyVN = (n) => (Number(n)||0).toLocaleString('vi-VN') + '₫';

function setRowHTML(el, html){
  if (!el) return;
  el.innerHTML = html;
}

// PRODUCTS
function mountProducts(){
  const tbody = $('#ad_rows');
  if (!tbody) return;
  const qy = query(collection(db, 'products'), orderBy('updatedAt', 'desc'));
  onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach((d)=>{
      const x = d.data()||{};
      rows.push(`<tr>
        <td>${x.name||'-'}</td>
        <td>${moneyVN(x.price)}</td>
        <td>${x.original_price ? moneyVN(x.original_price) : '—'}</td>
        <td>${x.is_sale ? '✅' : '—'}</td>
        <td>${x.category||'—'}</td>
        <td>${x.image ? `<img src="${x.image}" alt="" style="height:42px">` : '—'}</td>
        <td>
          <button class="btn btn--sm" data-edit-product="${d.id}">Sửa</button>
          <button class="btn btn--sm btn--danger" data-del-product="${d.id}">Xoá</button>
        </td>
      </tr>`);
    });
    setRowHTML(tbody, rows.join(''));
  });

  document.addEventListener('click', async (e)=>{
    const del = e.target.closest('[data-del-product]');
    if (del){
      const id = del.getAttribute('data-del-product');
      if (!confirm('Xoá sản phẩm này?')) return;
      await deleteDoc(doc(db, 'products', id));
    }
  });
}

// USERS
function mountUsers(){
  const tbody = $('#user_rows');
  if (!tbody) return;
  const qy = query(collection(db, 'users'), orderBy('email', 'asc'));
  onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach((d)=>{
      const x = d.data()||{};
      rows.push(`<tr>
        <td>${x.email||'—'}</td>
        <td>${x.name||'—'}</td>
        <td>${x.role||'user'}</td>
        <td>${moneyVN(x.balance||0)}</td>
        <td class="flex gap-2">
          <button class="btn btn--sm" data-role-user="${d.id}">Set user</button>
          <button class="btn btn--sm" data-role-admin="${d.id}">Set admin</button>
          <button class="btn btn--sm" data-deposit="${d.id}">Nạp</button>
          <button class="btn btn--sm btn--danger" data-withdraw="${d.id}">Rút</button>
        </td>
      </tr>`);
    });
    setRowHTML(tbody, rows.join(''));
  });

  // role change
  document.addEventListener('click', async (e)=>{
    const btnU = e.target.closest('[data-role-user]');
    const btnA = e.target.closest('[data-role-admin]');
    if (btnU || btnA){
      const id = (btnU||btnA).getAttribute(btnU ? 'data-role-user' : 'data-role-admin');
      await updateDoc(doc(db,'users', id), { role: btnA ? 'admin' : 'user', updatedAt: serverTimestamp() });
    }
  });

  // deposit
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-deposit]');
    if (!btn) return;
    const id = btn.getAttribute('data-deposit');
    let v = prompt('Nhập số tiền cần nạp (VND):', '100000');
    if (v === null) return;
    v = Number(String(v).replace(/[^\d.-]/g,''));
    if (!Number.isFinite(v) || v <= 0){ alert('Số tiền không hợp lệ'); return; }
    btn.disabled = true;
    try {
      await runTransaction(db, async (tx)=>{
        const ref = doc(db, 'users', id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Không tìm thấy user');
        const cur = Number((snap.data()||{}).balance || 0);
        tx.update(ref, { balance: cur + v, updatedAt: serverTimestamp() });
      });
      alert('Đã nạp tiền');
    } catch(err){
      alert('Lỗi nạp tiền: ' + (err?.message || err));
    } finally {
      btn.disabled = false;
    }
  });

  // withdraw
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-withdraw]');
    if (!btn) return;
    const id = btn.getAttribute('data-withdraw');
    let v = prompt('Nhập số tiền cần rút (VND):', '50000');
    if (v === null) return;
    v = Number(String(v).replace(/[^\d.-]/g,''));
    if (!Number.isFinite(v) || v <= 0){ alert('Số tiền không hợp lệ'); return; }
    btn.disabled = true;
    try {
      await runTransaction(db, async (tx)=>{
        const ref = doc(db, 'users', id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Không tìm thấy user');
        const cur = Number((snap.data()||{}).balance || 0);
        if (cur < v) throw new Error('Số dư không đủ để rút');
        tx.update(ref, { balance: cur - v, updatedAt: serverTimestamp() });
      });
      alert('Đã rút tiền');
    } catch(err){
      alert('Lỗi rút tiền: ' + (err?.message || err));
    } finally {
      btn.disabled = false;
    }
  });
}

// ORDERS
function mountOrders(){
  const tbody = $('#order_rows');
  if (!tbody) return;
  const qy = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  onSnapshot(qy, (snap)=>{
    const rows = [];
    snap.forEach((d)=>{
      const x = d.data()||{};
      const cust = x.customer || {};
      const status = x.status || 'pending';
      const method = x.paymentMethod || x.method || '—';
      const canMarkPaid = status === 'pending' || status === 'pending_wallet' || status === 'awaiting_bank';
      const walletAction = (method === 'WALLET' || method === 'wallet') && (status === 'pending' || status === 'pending_wallet');
      const actions = canMarkPaid
        ? `<div class="flex gap-2">
             ${walletAction ? `<button class="btn btn--sm" data-wallet-pay="${d.id}">Xác nhận trừ ví + thanh toán</button>` : ''}
             <button class="btn btn--sm" data-mark-paid="${d.id}">Đánh dấu đã thanh toán</button>
           </div>`
        : '—';
      rows.push(`<tr>
        <td>#${d.id.slice(-6)}</td>
        <td>${cust.name||'—'}<br/><span class="muted small">${cust.email||cust.phone||''}</span></td>
        <td>${moneyVN(x.total||0)}</td>
        <td>${method}</td>
        <td>${status}</td>
        <td>${actions}</td>
      </tr>`);
    });
    setRowHTML(tbody, rows.join(''));
  });

  // Mark paid without wallet deduction
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-mark-paid]');
    if (!btn) return;
    const id = btn.getAttribute('data-mark-paid');
    btn.disabled = true; btn.textContent = 'Đang cập nhật...';
    try {
      await updateDoc(doc(db, 'orders', id), { status: 'paid', paidAt: serverTimestamp(), updatedAt: serverTimestamp() });
      btn.textContent = 'Đã thanh toán';
    } catch(err){
      alert('Không thể cập nhật trạng thái: ' + (err?.message || err));
      btn.disabled = false; btn.textContent = 'Đánh dấu đã thanh toán';
    }
  });

  // Wallet deduction + mark paid
  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-wallet-pay]');
    if (!btn) return;
    const id = btn.getAttribute('data-wallet-pay');
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Đang trừ ví...';

    try {
      await runTransaction(db, async (tx)=>{
        const refOrder = doc(db, 'orders', id);
        const snapOrder = await tx.get(refOrder);
        if (!snapOrder.exists()) throw new Error('Không tìm thấy đơn hàng');
        const o = snapOrder.data()||{};
        if (o.status === 'paid') return;
        const total = Number(o.total||0);
        const customer = o.customer || {};
        const email = (customer.email||'').trim().toLowerCase();
        if (!email) throw new Error('Đơn hàng không có email khách');

        // find user by email
        const qyUser = query(collection(db,'users'), where('email','==', email));
        const snapUser = await getDocs(qyUser);
        if (snapUser.empty) throw new Error('Không tìm thấy user trùng email');

        const userDoc = snapUser.docs[0];
        const refUser = doc(db, 'users', userDoc.id);
        const bal = Number((userDoc.data()||{}).balance || 0);
        if (bal < total) throw new Error('Số dư ví không đủ');

        // deduct and mark paid
        tx.update(refUser, { balance: bal - total, updatedAt: serverTimestamp() });
        tx.update(refOrder, { status: 'paid', paidAt: serverTimestamp(), updatedAt: serverTimestamp(), paidBy: email, paidMethod: 'wallet' });
      });

      btn.textContent = 'Đã trừ ví & thanh toán';
    } catch(err){
      alert('Không thể trừ ví/đánh dấu thanh toán: ' + (err?.message || err));
      btn.disabled = false; btn.textContent = old;
    }
  });
}

// Mount
window.addEventListener('load', ()=>{
  mountProducts();
  mountUsers();
  mountOrders();
});