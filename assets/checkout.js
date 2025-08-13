// checkout.js (autofill profile when logged in)
import { auth, db, functions } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { BANK } from './app-config.js';

const $ = (s)=>document.querySelector(s);
const money = n => (n||0).toLocaleString('vi-VN') + '₫';

// ===== Formspree (subject only) =====
const FORMSPREE_ENDPOINT = "https://formspree.io/f/meozvdoo";
const BCC_EMAILS = []; // optional

async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const body = new FormData();
    body.append('subject', subject);
    // send minimal meta so you can see it in dashboard
    body.append('order_id', id || 'N/A');
    body.append('total', String(total || 0));
    body.append('payment_method', method || '');
    if (customer?.email) {
      body.append('email', customer.email);
      body.append('_replyto', customer.email);
      body.append('_cc', customer.email); // may be ignored on free plan
    }
    if (customer?.name) body.append('name', customer.name);
    if (Array.isArray(BCC_EMAILS)) BCC_EMAILS.forEach(e => e && body.append('_bcc', e));
    await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body, headers: { 'Accept': 'application/json' } });
  } catch (e) { console.warn('Send mail failed:', e); }
}

// ===== Cart helpers =====
function loadCart(){ try { return JSON.parse(localStorage.getItem('cart')||'[]'); } catch { return []; } }

function renderCart(){
  const cart = loadCart();
  const sumDiv = $('#summary');
  sumDiv.innerHTML = '';
  if (!cart.length){
    sumDiv.innerHTML = '<div class="muted">Giỏ hàng trống. <a href="index.html">Quay lại mua hàng</a>.</div>';
  } else {
    cart.forEach(it=>{
      const row = document.createElement('div');
      row.style.display='flex';
      row.style.justifyContent='space-between';
      row.innerHTML = `<div>${it.name} <span class="muted">x${it.qty}</span></div><div><strong>${money(it.qty*it.price)}</strong></div>`;
      sumDiv.appendChild(row);
    });
  }
  const total = cart.reduce((s,i)=>s+(i.qty||1)*(i.price||0),0);
  $('#sumTotal').textContent = money(total);
  return { cart, total };
}

// ===== VietQR helper =====
function vietqrUrl({amount, addInfo}){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK;
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const params = new URLSearchParams();
  if (amount) params.append('amount', Math.round(amount));
  if (addInfo) params.append('addInfo', addInfo);
  if (accountName) params.append('accountName', accountName);
  return `${base}?${params.toString()}`;
}

// ===== State & Autofill =====
const state = { user:null, balance:0, orderId:null, profile:{} };

async function loadUserProfile(uid){
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    name: data.name || '',
    phone: data.phone || '',
    address: data.address || '',
    email: data.email || '' // optional stored email
  };
}

function applyProfileToForm(p){
  const form = $('#payForm');
  if (!form) return;
  const f = new FormData(form);
  const nameEl = form.querySelector('input[name="name"]');
  const phoneEl = form.querySelector('input[name="phone"]');
  const emailEl = form.querySelector('input[name="email"]');
  const addrEl = form.querySelector('input[name="address"]');
  if (nameEl) nameEl.value = p?.name || nameEl.value || '';
  if (phoneEl) phoneEl.value = p?.phone || phoneEl.value || '';
  if (emailEl) emailEl.value = p?.email || emailEl.value || state.user?.email || '';
  if (addrEl) addrEl.value = p?.address || addrEl.value || '';
}

function setFormRequiredByAuth(isLoggedIn){
  const form = $('#payForm');
  if (!form) return;
  // Logged-in: đã tự điền, vẫn để editable, giữ required để user không xoá trống
  // Guest: required như bình thường
  ['name','phone','email','address'].forEach(k=>{
    const el = form.querySelector(`input[name="${k}"]`);
    if (el) el.required = true;
  });
}

// ===== Auth listener =====
onAuthStateChanged(auth, async (u) => {
  state.user = u || null;
  const acctBox = $('#acctBox');
  if (u) {
    // Hiển thị info account box
    acctBox && (acctBox.style.display = 'block');
    // Tải số dư + profile
    try {
      const userRef = doc(db, 'users', u.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        state.balance = Number(data.balance || 0);
        $('#meEmail') && ($('#meEmail').textContent = u.email || data.email || '—');
        $('#meName') && ($('#meName').textContent = data.name || '—');
        $('#meBalance') && ($('#meBalance').textContent = money(state.balance));
      }
    } catch {}
    state.profile = await loadUserProfile(u.uid) || {};
    // Ưu tiên email từ Auth
    state.profile.email = u.email || state.profile.email || '';
    applyProfileToForm(state.profile);
    setFormRequiredByAuth(true);
  } else {
    acctBox && (acctBox.style.display = 'none');
    setFormRequiredByAuth(false);
  }
});

// ===== Init UI =====
document.addEventListener('DOMContentLoaded', ()=>{
  const { cart, total } = renderCart();
  const form = $('#payForm');
  const guide = $('#guide');
  const payment = $('#payment');
  const qrBox = $('#qrBox');
  const qrImg = $('#vietqrImg');
  const qrNote = $('#qrNote');

  function syncGuide(){
    const v = payment.value;
    guide.textContent = v==='WALLET' ? 'Ví tiền: cần đăng nhập và đủ số dư. Có thể bị admin xác nhận.'
                    : v==='BANK' ? 'Chuyển khoản qua VietQR theo mã hiển thị. Ghi đúng nội dung để đối soát.'
                    : v==='MOMO' ? 'MoMo: sẽ gửi số khi xác nhận.'
                    : 'COD: thanh toán khi nhận hàng.';
    qrBox.style.display = (v==='BANK') ? 'block' : 'none';
    if (v==='BANK'){
      const data = Object.fromEntries(new FormData(form));
      const add = (data.name?data.name:'') + (data.phone?` ${data.phone}`:'');
      qrImg.src = vietqrUrl({ amount: total, addInfo: add || 'Thanh toan don hang' });
      qrNote.textContent = `Chủ TK: ${BANK.accountName} — Ghi chú: ${add || 'Thanh toan don hang'}`;
    }
  }
  payment.addEventListener('change', syncGuide);
  syncGuide();

  form.addEventListener('input', ()=>{
    if (payment.value !== 'BANK') return;
    const data = Object.fromEntries(new FormData(form));
    const add = (data.name?data.name:'') + (data.phone?` ${data.phone}`:'');
    qrImg.src = vietqrUrl({ amount: total, addInfo: add || 'Thanh toan don hang' });
    qrNote.textContent = `Chủ TK: ${BANK.accountName} — Ghi chú: ${add || 'Thanh toan don hang'}`;
  });

  // ===== Submit =====
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const ok = $('#ok'), err = $('#err'); ok.style.display='none'; err.style.display='none';

    const data = Object.fromEntries(new FormData(form));
    const { cart: cartNow, total: totalNow } = renderCart(); // re-calc

    // Nếu đã đăng nhập: lưu lại profile vừa sửa (nếu khác)
    if (state.user) {
      try {
        const userRef = doc(db, 'users', state.user.uid);
        await setDoc(userRef, {
          name: data.name || '',
          phone: data.phone || '',
          address: data.address || '',
          email: state.user.email || data.email || '',
          updatedAt: serverTimestamp()
        }, { merge: true });
        state.profile = { ...state.profile, name: data.name, phone: data.phone, address: data.address, email: state.user.email || data.email };
      } catch (e) { console.warn('update profile failed', e); }
    }

    const payloadBase = {
      items: cartNow,
      total: totalNow,
      address: data.address,
      note: data.note||'',
      userId: state.user?.uid || null,
      customer: { // lưu rõ vào đơn để xem nhanh
        name: data.name, phone: data.phone, email: state.user?.email || data.email, address: data.address
      },
      user: state.user ? { email: state.user.email } : { email: data.email, name: data.name, phone: data.phone },
      createdAt: serverTimestamp(),
    };

    try{
      if (data.payment_method==='WALLET'){
        const u = state.user || getAuth().currentUser;
        if (!u){ alert('Vui lòng đăng nhập để dùng Ví tiền.'); return; }
        if (state.balance < totalNow){ err.textContent = 'Số dư không đủ để thanh toán bằng Ví tiền.'; err.style.display = 'block'; return; }
        // Nếu bạn không dùng Functions (Spark plan), comment try/catch callable dưới để đi thẳng fallback.
        try{
          const placeOrderWithWallet = httpsCallable(functions, 'placeOrderWithWallet');
          const res = await placeOrderWithWallet({
            items: cartNow, total: totalNow, address: data.address, note: data.note||''
          });
          state.orderId = res.data?.orderId || null;
          ok.textContent = 'Đặt hàng & trừ ví thành công!';
          ok.style.display = 'block';
          await sendOrderEmail({
            id: state.orderId, method: 'WALLET', total: totalNow, items: cartNow,
            customer: { name: data.name, phone: data.phone, email: state.user?.email || data.email, address: data.address }
          });
          localStorage.removeItem('cart');
          return;
        } catch(callErr){
          const odRef = await addDoc(collection(db,'orders'), {
            ...payloadBase,
            paymentMethod: 'WALLET',
            status: 'pending_wallet',
          });
          state.orderId = odRef.id;
          ok.textContent = 'Đặt hàng thành công! Đơn đang chờ admin trừ ví.';
          ok.style.display = 'block';
          await sendOrderEmail({
            id: state.orderId, method: 'WALLET (pending)', total: totalNow, items: cartNow,
            customer: { name: data.name, phone: data.phone, email: state.user?.email || data.email, address: data.address }
          });
          localStorage.removeItem('cart');
          return;
        }
      }
      else if (data.payment_method==='BANK'){
        const odRef = await addDoc(collection(db,'orders'), {
          ...payloadBase,
          paymentMethod: 'BANK',
          status: 'awaiting_bank',
        });
        state.orderId = odRef.id;
        const addInfo = `ORDER-${odRef.id}`;
        const url = vietqrUrl({ amount: totalNow, addInfo });
        $('#qrBox').style.display = 'block';
        $('#vietqrImg').src = url;
        $('#qrNote').textContent = `Nội dung chuyển khoản: ${addInfo}`;
        ok.textContent = 'Đã tạo đơn. Vui lòng quét mã để thanh toán!';
        ok.style.display = 'block';
        await sendOrderEmail({
          id: state.orderId, method: 'BANK', total: totalNow, items: cartNow,
          customer: { name: data.name, phone: data.phone, email: state.user?.email || data.email, address: data.address }
        });
        return;
      }
      else {
        const odRef = await addDoc(collection(db,'orders'), {
          ...payloadBase,
          paymentMethod: data.payment_method,
          status: 'pending',
        });
        state.orderId = odRef.id;
        ok.textContent = 'Đặt hàng thành công!';
        ok.style.display = 'block';
        await sendOrderEmail({
          id: state.orderId, method: data.payment_method, total: totalNow, items: cartNow,
          customer: { name: data.name, phone: data.phone, email: state.user?.email || data.email, address: data.address }
        });
        localStorage.removeItem('cart');
      }
    }catch(ex){
      console.error(ex);
      err.textContent = 'Có lỗi, vui lòng thử lại.';
      err.style.display='block';
    }
  });
});
