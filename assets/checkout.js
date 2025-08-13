// assets/checkout.js — ultra-safe DOM + autofill + email + invoice
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { BANK } from './app-config.js';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/meozvdoo';
const BCC_EMAILS = [];

// ===== Utils =====
const $ = (s)=>document.querySelector(s);
const moneyVN = n => (Number(n)||0).toLocaleString('vi-VN') + '₫';

function whenDomReady() {
  return new Promise((res)=>{
    if (document.readyState === 'complete' || document.readyState === 'interactive') return res();
    document.addEventListener('DOMContentLoaded', res, { once: true });
  });
}
function setTextAny(selectors, text) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) { el.textContent = text; return true; }
  }
  return false;
}
function setValSafely(sel, val) {
  const el = document.querySelector(sel);
  if (el && 'value' in el && !el.value) el.value = val;
}
function loadCart(){ try { return JSON.parse(localStorage.getItem('cart')||'[]'); } catch { return []; } }

function renderCartSummary() {
  const list = $('#summary');
  const totalEl = $('#sumTotal');
  const cart = loadCart();
  let total = 0;
  if (list) list.innerHTML = '';
  if (!cart.length) {
    if (list) list.innerHTML = '<div class="muted">Giỏ hàng trống. <a href="index.html">Quay lại mua hàng</a>.</div>';
  } else {
    cart.forEach(i => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      const qty = Number(i.qty||1), price = Number(i.price||0);
      row.innerHTML = `<div>${i.name} <span class="muted">x${qty}</span></div><div><strong>${moneyVN(qty*price)}</strong></div>`;
      list && list.appendChild(row);
      total += qty*price;
    });
  }
  if (totalEl) totalEl.textContent = moneyVN(total);
  return { cart, total };
}

function vietqrUrl({amount, addInfo}){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK || {};
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const params = new URLSearchParams();
  if (amount) params.append('amount', Math.round(amount));
  if (addInfo) params.append('addInfo', addInfo);
  if (accountName) params.append('accountName', accountName);
  return `${base}?${params.toString()}`;
}

// ===== Auth: autofill + account box =====
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try{
    await whenDomReady();
    const snap = await getDoc(doc(db, 'users', user.uid));
    const d = snap.exists() ? (snap.data()||{}) : {};

    // Account box (try multiple IDs)
    const acctBox = $('#acctBox') || $('#wallet');
    if (acctBox) acctBox.style.display = 'block';
    setTextAny(['#meEmail', '#accountEmail'], user.email || d.email || '—');
    setTextAny(['#meName', '#accountName'], d.name || '—');
    setTextAny(['#meBalance', '#walletBalance', '#balance'], moneyVN(Number(d.balance || 0)));

    // Autofill form
    setValSafely('input[name="name"]', d.name || '');
    setValSafely('input[name="phone"]', d.phone || '');
    setValSafely('input[name="email"]', user.email || d.email || '');
    setValSafely('input[name="address"]', d.address || '');
  }catch(e){ console.warn('Autofill failed:', e); }
});

// ===== Email (text) =====
function buildEmailText({ id, method, total, items, customer }){
  const productsLine = (items||[]).map(i => `${i.name} x${Number(i.qty||1)}`).join(', ') || '(trống)';
  return `ĐƠN HÀNG #${id||'N/A'}
Phương thức: ${method}
Tổng: ${moneyVN(total)}

Khách hàng:
- Họ tên: ${customer.name||'-'}
- Email: ${customer.email||'-'}
- SĐT: ${customer.phone||'-'}
- Địa chỉ: ${customer.address||'-'}

Sản phẩm:
${productsLine}`;
}
async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const text = buildEmailText({ id, method, total, items, customer });
    const body = new FormData();
    body.append('subject', subject);
    body.append('message', text);
    body.append('order_id', id || 'N/A');
    body.append('payment_method', method || '');
    body.append('total', String(total || 0));
    body.append('customer_name', customer?.name || '');
    body.append('customer_email', customer?.email || '');
    body.append('customer_phone', customer?.phone || '');
    body.append('customer_address', customer?.address || '');
    body.append('products', (items||[]).map(i => `${i.name} x${Number(i.qty||1)}`).join(', ') || '(trống)');
    if (customer?.email) { body.append('email', customer.email); body.append('_replyto', customer.email); }
    if (Array.isArray(BCC_EMAILS)) BCC_EMAILS.forEach(e => e && body.append('_bcc', e));
    await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body, headers: { 'Accept':'application/json' } });
  } catch (e) { console.warn('Send mail failed:', e); }
}

// ===== Invoice (print / Save as PDF) =====
function openInvoicePDF({ id, method, total, items, customer }){
  const rows = (items||[]).map(i => `
    <tr>
      <td style="padding:6px;border:1px solid #e5e7eb">${i.name}</td>
      <td style="padding:6px;border:1px solid #e5e7eb;text-align:center">${Number(i.qty||1)}</td>
      <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${moneyVN(Number(i.price||0))}</td>
    </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hóa đơn #${id||'N/A'}</title>
  <style>body{font-family:Inter,Arial,sans-serif;color:#111}.wrap{max-width:720px;margin:24px auto;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:6px}th{background:#f8fafc}.tot{font-weight:700}@media print{.no-print{display:none}}</style>
  </head><body><div class="wrap">
    <h2>Hóa đơn bán hàng</h2>
    <div>Mã đơn: <b>#${id||'N/A'}</b></div>
    <div>Phương thức: ${method}</div>
    <div class="tot" style="margin:6px 0">Tổng: ${moneyVN(total)}</div>
    <h3>Khách hàng</h3>
    <div><b>${customer?.name||'-'}</b></div>
    <div>${customer?.email||'-'} — ${customer?.phone||'-'}</div>
    <div>${customer?.address||'-'}</div>
    <h3>Sản phẩm</h3>
    <table><thead><tr><th>Tên</th><th>SL</th><th>Giá</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="no-print" style="margin-top:12px"><button onclick="window.print()">In / Lưu PDF</button></div>
  </div><script>setTimeout(function(){try{window.print()}catch(e){}},300)</script></body></html>`;
  const w = window.open('', '_blank'); if (!w) return;
  w.document.open(); w.document.write(html); w.document.close();
}

// ===== Page wiring =====
document.addEventListener('DOMContentLoaded', ()=>{
  const { cart, total } = renderCartSummary();
  const form = $('#payForm') || $('#formCheckout');
  const paymentSel = $('#payment');
  const qrBox = $('#qrBox');
  const qrImg = $('#vietqrImg');
  const qrNote = $('#qrNote');
  const guide = $('#guide');
  const ok = $('#ok');
  const err = $('#err');

  function syncPaymentGuide(){
    const v = paymentSel ? paymentSel.value : 'COD';
    if (guide){
      guide.textContent = v==='WALLET' ? 'Ví tiền: cần đăng nhập và đủ số dư. Đơn có thể chờ admin xác nhận.'
                      : v==='BANK' ? 'Chuyển khoản VietQR theo mã hiển thị. Ghi đúng nội dung để đối soát.'
                      : v==='MOMO' ? 'MoMo: sẽ gửi số sau khi xác nhận.'
                      : 'COD: thanh toán khi nhận hàng.';
    }
    if (qrBox) qrBox.style.display = (v==='BANK') ? 'block' : 'none';
    if (v==='BANK' && qrImg && qrNote){
      const fd = form ? new FormData(form) : new FormData();
      const add = ((fd.get('name')||'') + (fd.get('phone')?` ${fd.get('phone')}`:'')) || 'Thanh toan don hang';
      qrImg.src = vietqrUrl({ amount: total, addInfo: add });
      qrNote.textContent = `Chủ TK: ${BANK?.accountName||''} — Ghi chú: ${add}`;
    }
  }
  paymentSel?.addEventListener('change', syncPaymentGuide);
  form?.addEventListener('input', ()=>{ if (paymentSel?.value==='BANK') syncPaymentGuide(); });
  syncPaymentGuide();

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    ok && (ok.style.display='none');
    err && (err.style.display='none');

    const fd = new FormData(form);
    const customer = {
      name: (fd.get('name')||'').toString().trim(),
      phone: (fd.get('phone')||'').toString().trim(),
      email: (fd.get('email')||'').toString().trim(),
      address: (fd.get('address')||'').toString().trim(),
    };
    const method = (fd.get('payment_method')||'COD').toString();

    if (!cart.length){ if (err){err.textContent='Giỏ hàng trống';err.style.display='block';} return; }

    try{
      const odRef = await addDoc(collection(db,'orders'), {
        items: cart, total, customer,
        paymentMethod: method,
        status: method==='BANK' ? 'awaiting_bank' : (method==='WALLET' ? 'pending_wallet' : 'pending'),
        createdAt: serverTimestamp()
      });
      const orderId = odRef.id;

      ok && (ok.textContent = (method==='BANK' ? 'Đã tạo đơn. Vui lòng quét mã để thanh toán!' : 'Đặt hàng thành công!'));
      ok && (ok.style.display='block');

      await sendOrderEmail({ id: orderId, method, total, items: cart, customer });
      openInvoicePDF({ id: orderId, method, total, items: cart, customer });

      localStorage.removeItem('cart');
    }catch(ex){
      console.error(ex);
      if (err){ err.textContent = 'Có lỗi, vui lòng thử lại.'; err.style.display='block'; }
    }
  });
});
