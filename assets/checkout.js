// assets/checkout.js — send pretty HTML email (Formspree), autofill from profile, VietQR, wallet fallback
import { auth, db, functions } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { BANK } from './app-config.js';

// ===== Config (Formspree) =====
const FORMSPREE_ENDPOINT = "https://formspree.io/f/meozvdoo";
const BCC_EMAILS = []; // thêm email nếu muốn BCC

// ===== Shortcuts =====
const $ = (s)=>document.querySelector(s);
const money = n => (Number(n)||0).toLocaleString('vi-VN') + '₫';

// ===== Cart =====
function loadCart(){ try { return JSON.parse(localStorage.getItem('cart')||'[]'); } catch { return []; } }

function renderCart(){
  const cart = loadCart();
  const sumDiv = $('#summary');
  const totalEl = $('#sumTotal');
  if (sumDiv) sumDiv.innerHTML = '';
  let total = 0;
  if (!cart.length){
    if (sumDiv) sumDiv.innerHTML = '<div class="muted">Giỏ hàng trống. <a href="index.html">Quay lại mua hàng</a>.</div>';
  } else {
    cart.forEach(it=>{
      const row = document.createElement('div');
      row.style.display='flex';
      row.style.justifyContent='space-between';
      row.innerHTML = `<div>${it.name} <span class="muted">x${it.qty||1}</span></div><div><strong>${money((it.qty||1)*(it.price||0))}</strong></div>`;
      sumDiv && sumDiv.appendChild(row);
      total += (it.qty||1)*(it.price||0);
    });
  }
  if (totalEl) totalEl.textContent = money(total);
  return { cart, total };
}

// ===== VietQR =====
function vietqrUrl({amount, addInfo}){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK || {};
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const params = new URLSearchParams();
  if (amount) params.append('amount', Math.round(amount));
  if (addInfo) params.append('addInfo', addInfo);
  if (accountName) params.append('accountName', accountName);
  return `${base}?${params.toString()}`;
}

// ===== State & Profile Autofill =====
const state = { user:null, balance:0, profile:{} };

async function fetchUserProfile(uid){
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data()||{}) : {};
}

function applyProfileToForm(p){
  const form = $('#payForm'); if (!form) return;
  const nameEl = form.querySelector('input[name="name"]');
  const phoneEl = form.querySelector('input[name="phone"]');
  const emailEl = form.querySelector('input[name="email"]');
  const addrEl = form.querySelector('input[name="address"]');
  if (nameEl && !nameEl.value) nameEl.value = p?.name || '';
  if (phoneEl && !phoneEl.value) phoneEl.value = p?.phone || '';
  if (emailEl && !emailEl.value) emailEl.value = p?.email || '';
  if (addrEl && !addrEl.value) addrEl.value = p?.address || '';
}

function enforceRequired(){
  const form = $('#payForm'); if (!form) return;
  ['name','phone','email','address'].forEach(k=>{
    const el = form.querySelector(`input[name="${k}"]`);
    if (el) el.required = true;
  });
}

// ===== Customer & Email helpers =====
const moneyVN = n => (n||0).toLocaleString('vi-VN') + '₫';

/** Lấy thông tin khách: ưu tiên profile khi đã đăng nhập, form có thì ghi đè */
function getCustomerPayload(state, formData) {
  const data = formData ? Object.fromEntries(formData) : {};
  const p = state?.profile || {};
  const isSignedIn = !!state?.user;
  return {
    name:    (data.name    || p.name    || '').trim(),
    email:   (isSignedIn ? (state.user?.email || p.email || data.email || '') : (data.email || '')).trim(),
    phone:   (data.phone   || p.phone   || '').trim(),
    address: (data.address || p.address || '').trim(),
  };
}

function buildEmailHTML({ id, method, total, items, customer }) {
  const lines = (items||[]).map(i =>
    `<tr>
      <td style="padding:6px 8px;border:1px solid #eee">${i.name||'SP'}</td>
      <td style="padding:6px 8px;border:1px solid #eee;text-align:center">${Number(i.qty||1)}</td>
      <td style="padding:6px 8px;border:1px solid #eee;text-align:right">${moneyVN(Number(i.price||0))}</td>
    </tr>`
  ).join('');

  return `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
    <h2 style="margin:0 0 12px">🛒 Đơn hàng mới #${id||'N/A'}</h2>
    <p style="margin:0 0 8px">
      <b>Phương thức:</b> ${method} &nbsp;•&nbsp; <b>Tổng:</b> ${moneyVN(total)}
    </p>

    <h3 style="margin:16px 0 8px">Thông tin khách hàng</h3>
    <table style="border-collapse:collapse">
      <tr><td style="padding:4px 8px;color:#555">Họ tên</td><td style="padding:4px 8px"><b>${customer.name||'-'}</b></td></tr>
      <tr><td style="padding:4px 8px;color:#555">Email</td><td style="padding:4px 8px">${customer.email||'-'}</td></tr>
      <tr><td style="padding:4px 8px;color:#555">SĐT</td><td style="padding:4px 8px">${customer.phone||'-'}</td></tr>
      <tr><td style="padding:4px 8px;color:#555">Địa chỉ</td><td style="padding:4px 8px">${customer.address||'-'}</td></tr>
    </table>

    <h3 style="margin:16px 0 8px">Sản phẩm</h3>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:left;background:#fafafa">Tên</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:center;background:#fafafa">SL</th>
          <th style="padding:6px 8px;border:1px solid #eee;text-align:right;background:#fafafa">Giá</th>
        </tr>
      </thead>
      <tbody>${lines || ''}</tbody>
    </table>

    <p style="margin-top:12px"><b>Tổng cộng:</b> ${moneyVN(total)}</p>
  </div>`;
}

function buildEmailText({ id, method, total, items, customer }) {
  const productsLine = (items||[]).map(i => `${i.name||'SP'} x${Number(i.qty||1)}`).join(', ');
  return (
`Đơn hàng #${id||'N/A'}
Phương thức: ${method}
Tổng: ${moneyVN(total)}

Khách hàng:
- Họ tên: ${customer.name||'-'}
- Email: ${customer.email||'-'}
- SĐT: ${customer.phone||'-'}
- Địa chỉ: ${customer.address||'-'}

Sản phẩm:
${productsLine || '(trống)'}`
  );
}

async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const html = buildEmailHTML({ id, method, total, items, customer });
    const text = buildEmailText({ id, method, total, items, customer });

    // Try HTML first
    let body = new FormData();
    body.append('subject', subject);
    body.append('message', html);
    body.append('_format', 'html');
    body.append('order_id', id || 'N/A');
    body.append('payment_method', method || '');
    body.append('total', String(total || 0));
    body.append('customer_name', customer?.name || '');
    body.append('customer_email', customer?.email || '');
    body.append('customer_phone', customer?.phone || '');
    body.append('customer_address', customer?.address || '');
    if (customer?.email) {
      body.append('email', customer.email);
      body.append('_replyto', customer.email);
      body.append('_cc', customer.email);
    }
    if (Array.isArray(BCC_EMAILS)) BCC_EMAILS.forEach(e => e && body.append('_bcc', e));

    let resp = await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body, headers: { 'Accept': 'application/json' } });

    if (!resp.ok) {
      const fb = new FormData();
      fb.append('subject', subject);
      fb.append('message', text);
      fb.append('order_id', id || 'N/A');
      fb.append('payment_method', method || '');
      fb.append('total', String(total || 0));
      fb.append('customer_email', customer?.email || '');
      if (customer?.email) {
        fb.append('email', customer.email);
        fb.append('_replyto', customer.email);
      }
      await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body: fb, headers: { 'Accept': 'application/json' } });
    }
  } catch (e) { console.warn('Send mail failed:', e); }
}

// ===== Auth listener: load profile & balance and autofill form =====
onAuthStateChanged(auth, async (u)=>{
  state.user = u || null;
  if (u){
    try {
      const data = await fetchUserProfile(u.uid);
      state.profile = {
        name: data.name || '',
        phone: data.phone || '',
        address: data.address || '',
        email: u.email || data.email || ''
      };
      state.balance = Number(data.balance || 0);
      // Autofill checkout form
      applyProfileToForm(state.profile);
      enforceRequired();
      // Show wallet snippet if exists on this page
      const meEmail = $('#meEmail'), meName = $('#meName'), meBalance = $('#meBalance');
      if (meEmail) meEmail.textContent = state.profile.email || '—';
      if (meName) meName.textContent = state.profile.name || '—';
      if (meBalance) meBalance.textContent = money(state.balance);
    } catch(e){ console.warn('load profile failed', e); }
  }
});

// ===== Page init =====
document.addEventListener('DOMContentLoaded', ()=>{
  const form = $('#payForm');
  const payment = $('#payment');
  const qrBox = $('#qrBox');
  const qrImg = $('#vietqrImg');
  const qrNote = $('#qrNote');
  const ok = $('#ok');
  const err = $('#err');

  const { cart, total } = renderCart();

  function syncGuide(){
    if (!payment) return;
    const v = payment.value;
    const guide = $('#guide');
    if (guide){
      guide.textContent = v==='WALLET' ? 'Ví tiền: cần đăng nhập và đủ số dư. Có thể bị admin xác nhận.'
                      : v==='BANK' ? 'Chuyển khoản qua VietQR theo mã hiển thị. Ghi đúng nội dung để đối soát.'
                      : v==='MOMO' ? 'MoMo: sẽ gửi số khi xác nhận.'
                      : 'COD: thanh toán khi nhận hàng.';
    }
    if (qrBox) qrBox.style.display = (v==='BANK') ? 'block' : 'none';
    if (v==='BANK' && qrImg && qrNote && form){
      const data = Object.fromEntries(new FormData(form));
      const add = (data.name?data.name:'') + (data.phone?` ${data.phone}`:'');
      qrImg.src = vietqrUrl({ amount: total, addInfo: add || 'Thanh toan don hang' });
      qrNote.textContent = `Chủ TK: ${BANK.accountName} — Ghi chú: ${add || 'Thanh toan don hang'}`;
    }
  }
  payment?.addEventListener('change', syncGuide);
  form?.addEventListener('input', ()=>{ if (payment?.value==='BANK') syncGuide(); });
  syncGuide();

  // ===== Submit
  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (ok) ok.style.display='none';
    if (err) err.style.display='none';

    const fd = new FormData(form);
    const data = Object.fromEntries(fd);
    const { cart: cartNow, total: totalNow } = renderCart();
    if (!cartNow.length){ err && (err.textContent='Giỏ hàng trống'); err && (err.style.display='block'); return; }

    // Merge customer info (autofill if logged in)
    const customer = getCustomerPayload(state, fd);

    // Save back profile edits if logged in
    if (state.user){
      try {
        await setDoc(doc(db, 'users', state.user.uid), {
          name: customer.name || '',
          phone: customer.phone || '',
          address: customer.address || '',
          email: state.user.email || customer.email || '',
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch(e){ console.warn('update profile failed', e); }
    }

    try{
      if (data.payment_method === 'WALLET'){
        const u = state.user || getAuth().currentUser;
        if (!u){ err && (err.textContent='Vui lòng đăng nhập để dùng Ví tiền.'); err && (err.style.display='block'); return; }
        // Nếu có Functions (Blaze), thử callable, nếu lỗi => fallback tạo pending_wallet
        let orderId = null;
        try{
          if (functions){
            const placeOrderWithWallet = httpsCallable(functions, 'placeOrderWithWallet');
            const res = await placeOrderWithWallet({ items: cartNow, total: totalNow, address: customer.address, note: data.note||'' });
            orderId = res?.data?.orderId || null;
            ok && (ok.textContent = 'Đặt hàng & trừ ví thành công!'); ok && (ok.style.display='block');
          } else { throw new Error('No functions'); }
        }catch(_){
          const odRef = await addDoc(collection(db,'orders'), {
            items: cartNow,
            total: totalNow,
            address: customer.address,
            note: data.note||'',
            userId: u.uid,
            customer,
            paymentMethod: 'WALLET',
            status: 'pending_wallet',
            createdAt: serverTimestamp()
          });
          orderId = odRef.id;
          ok && (ok.textContent = 'Đặt hàng thành công! Đơn đang chờ admin trừ ví.'); ok && (ok.style.display='block');
        }
        await sendOrderEmail({ id: orderId, method: 'WALLET', total: totalNow, items: cartNow, customer });
        localStorage.removeItem('cart');
        return;
      }

      if (data.payment_method === 'BANK'){
        const odRef = await addDoc(collection(db,'orders'), {
          items: cartNow,
          total: totalNow,
          address: customer.address,
          note: data.note||'',
          userId: state.user?.uid || null,
          customer,
          paymentMethod: 'BANK',
          status: 'awaiting_bank',
          createdAt: serverTimestamp()
        });
        const addInfo = `ORDER-${odRef.id}`;
        if ($('#qrBox')){
          $('#qrBox').style.display = 'block';
          $('#vietqrImg').src = vietqrUrl({ amount: totalNow, addInfo });
          $('#qrNote').textContent = `Nội dung chuyển khoản: ${addInfo}`;
        }
        ok && (ok.textContent = 'Đã tạo đơn. Vui lòng quét mã để thanh toán!'); ok && (ok.style.display='block');
        await sendOrderEmail({ id: odRef.id, method: 'BANK', total: totalNow, items: cartNow, customer });
        return;
      }

      // COD / MOMO / khác
      const odRef = await addDoc(collection(db,'orders'), {
        items: cartNow,
        total: totalNow,
        address: customer.address,
        note: data.note||'',
        userId: state.user?.uid || null,
        customer,
        paymentMethod: data.payment_method || 'COD',
        status: 'pending',
        createdAt: serverTimestamp()
      });
      ok && (ok.textContent = 'Đặt hàng thành công!'); ok && (ok.style.display='block');
      await sendOrderEmail({ id: odRef.id, method: data.payment_method || 'COD', total: totalNow, items: cartNow, customer });
      localStorage.removeItem('cart');
    }catch(ex){
      console.error(ex);
      err && (err.textContent='Có lỗi, vui lòng thử lại.');
      err && (err.style.display='block');
    }
  });
});
