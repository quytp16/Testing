// checkout.js (final)
import { auth, db, functions } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { BANK } from './app-config.js';

const money = n => (n||0).toLocaleString('vi-VN') + '₫';
const $ = (s)=>document.querySelector(s);

function loadCart(){ try { return JSON.parse(localStorage.getItem('cart')||'[]'); } catch { return []; } }

function vietqrUrl({amount, addInfo}){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK;
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const params = new URLSearchParams();
  if (amount) params.append('amount', Math.round(amount));
  if (addInfo) params.append('addInfo', addInfo);
  if (accountName) params.append('accountName', accountName);
  return `${base}?${params.toString()}`;
}

const state = { user:null, balance:0, orderId:null };

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

async function loadUserWallet(u){
  try{
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()){
      const data = snap.data();
      state.balance = Number(data.balance || 0);
      $('#meEmail').textContent = u.email || '—';
      $('#meName').textContent = data.name || '—';
      $('#meBalance').textContent = money(state.balance);
      $('#acctBox').style.display = 'block';
    }
  }catch{ /* ignore */ }
}

onAuthStateChanged(auth, async (u)=>{
  state.user = u || null;
  if (u) { await loadUserWallet(u); }
});




// === Formspree email helper (HTML-preferred) ===
// Notes:
// - _cc: Formspree supports CC (free).
// - _bcc: May require a paid plan; kept optional. If not supported on your plan, Formspree ignores it.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/meozvdoo";
const BCC_EMAILS = [];
const moneyVN = n => (n||0).toLocaleString('vi-VN') + '₫';

function buildEmailBoxText({ id, method, total, items, customer }) {
  const L = (s='') => s; // helper
  const lines = (items || []).map(i => `  - ${i.name || 'SP'} x${Number(i.qty||1)} – ${moneyVN(Number(i.price||0))}`).join('\n') || '  (trống)';

  const body =
`ĐƠN HÀNG #${id || 'N/A'}
Phương thức: ${method}
Tổng: ${moneyVN(total)}

Khách hàng:
  - Họ tên: ${customer.name || '-'}
  - Email: ${customer.email || '-'}
  - SĐT: ${customer.phone || '-'}
  - Địa chỉ: ${customer.address || '-'}

Sản phẩm:
${lines}`;

  // bọc “khung” bằng unicode box-drawing
  const box = body.split('\n');
  const width = Math.max(...box.map(l => l.length));
  const top = '┌' + '─'.repeat(width + 2) + '┐';
  const bottom = '└' + '─'.repeat(width + 2) + '┘';
  const middle = box.map(l => '│ ' + l.padEnd(width, ' ') + ' │').join('\n');
  return `${top}\n${middle}\n${bottom}`;
}

async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const text = buildEmailBoxText({ id, method, total, items, customer });

    const body = new FormData();
    body.append('subject', subject);
    body.append('message', text);                 // GỬI TEXT
    body.append('order_id', id || 'N/A');
    body.append('products', (items||[]).map(i => `${i.name||'SP'} x${Number(i.qty||1)}`).join(', ') || '(trống)');
    body.append('total', String(total || 0));
    body.append('payment_method', method || '');
    body.append('customer_name', customer?.name || '');
    body.append('customer_email', customer?.email || '');
    body.append('customer_phone', customer?.phone || '');
    body.append('customer_address', customer?.address || '');

    // giúp trả lời trực tiếp người mua
    if (customer?.email) {
      body.append('email', customer.email);
      body.append('_replyto', customer.email);
    }
    if (Array.isArray(BCC_EMAILS)) BCC_EMAILS.forEach(e => e && body.append('_bcc', e));

    await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body, headers: { 'Accept': 'application/json' } });
  } catch (e) {
    console.warn('Send mail failed:', e);
  }
}

function generateInvoiceAndPrint({ id, method, total, items, customer }){
  const rows = (items||[]).map(i => `
    <tr>
      <td style="padding:6px;border:1px solid #e5e7eb">${i.name||'SP'}</td>
      <td style="padding:6px;border:1px solid #e5e7eb;text-align:center">${Number(i.qty||1)}</td>
      <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${moneyVN(Number(i.price||0))}</td>
    </tr>`).join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hóa đơn #${id||'N/A'}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#111}
    .wrap{max-width:720px;margin:24px auto;padding:16px}
    h1,h2,h3{margin:0 0 8px}
    .muted{color:#64748b}
    table{border-collapse:collapse;width:100%}
    .tot{font-size:16px;font-weight:700}
    @media print {.no-print{display:none}}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
    .box{border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:10px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div>
        <h2>Hóa đơn bán hàng</h2>
        <div class="muted">Mã đơn: <b>#${id||'N/A'}</b></div>
      </div>
      <div style="text-align:right">
        <div><b>Phương thức:</b> ${method}</div>
        <div class="tot">Tổng: ${moneyVN(total)}</div>
      </div>
    </div>

    <div class="box">
      <h3>Khách hàng</h3>
      <div><b>${customer?.name||'-'}</b></div>
      <div>${customer?.email||'-'} — ${customer?.phone||'-'}</div>
      <div>${customer?.address||'-'}</div>
    </div>

    <h3>Sản phẩm</h3>
    <table>
      <thead>
        <tr>
          <th style="padding:6px;border:1px solid #e5e7eb;text-align:left;background:#f8fafc">Tên</th>
          <th style="padding:6px;border:1px solid #e5e7eb;text-align:center;background:#f8fafc">SL</th>
          <th style="padding:6px;border:1px solid #e5e7eb;text-align:right;background:#f8fafc">Giá</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="text-align:right;margin-top:10px" class="tot">Tổng cộng: ${moneyVN(total)}</div>

    <div class="no-print" style="margin-top:16px">
      <button onclick="window.print()">In / Lưu PDF</button>
    </div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // auto print after a small delay
  setTimeout(()=>{ try{ w.print(); }catch{} }, 300);
}

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

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const ok = $('#ok'), err = $('#err'); ok.style.display='none'; err.style.display='none';

    const data = Object.fromEntries(new FormData(form));
    const { cart: cartNow, total: totalNow } = renderCart(); // re-calc in case changed
    const payloadBase = {
      items: cartNow,
      total: totalNow,
      address: data.address,
      note: data.note||'',
      userId: state.user?.uid || null,
      user: state.user ? { email: state.user.email } : { email: data.email, name: data.name, phone: data.phone },
      createdAt: serverTimestamp(),
    };

    try{
      if (data.payment_method==='WALLET'){
        // Require login
        const u = state.user || getAuth().currentUser;
        if (!u){ alert('Vui lòng đăng nhập để dùng Ví tiền.'); return; }
        // Optional: balance check before calling function
        if (state.balance < totalNow){
          err.textContent = 'Số dư không đủ để thanh toán bằng Ví tiền.';
          err.style.display = 'block';
          return;
        }
        // Try callable (immediate deduction)
        try{
          const placeOrderWithWallet = httpsCallable(functions, 'placeOrderWithWallet');
          const res = await placeOrderWithWallet({
            items: cartNow, total: totalNow, address: data.address, note: data.note||''
          });
          state.orderId = res.data?.orderId || null;
          ok.textContent = 'Đặt hàng & trừ ví thành công!';
          ok.style.display = 'block';
          await sendOrderEmail({ id: state.orderId, method: 'WALLET', total: totalNow, items: cartNow, customer: { name: data.name, phone: data.phone, email: data.email, address: data.address } });
          localStorage.removeItem('cart');
          return;
        } catch(callErr){
          // Fallback: create order pending wallet (admin will deduct)
          const odRef = await addDoc(collection(db,'orders'), {
            ...payloadBase,
            paymentMethod: 'WALLET',
            status: 'pending_wallet',
          });
          state.orderId = odRef.id;
          ok.textContent = 'Đặt hàng thành công! Đơn đang chờ admin trừ ví.';
          ok.style.display = 'block';
          await sendOrderEmail({ id: state.orderId, method: 'WALLET (pending)', total: totalNow, items: cartNow, customer: { name: data.name, phone: data.phone, email: data.email, address: data.address } });
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
        await sendOrderEmail({ id: state.orderId, method: 'BANK', total: totalNow, items: cartNow, customer: { name: data.name, phone: data.phone, email: data.email, address: data.address } });
        // Giữ cart đến khi người dùng xác nhận đã chuyển tiền
        return;
      }
      else {
        await addDoc(collection(db,'orders'), {
          ...payloadBase,
          paymentMethod: data.payment_method,
          status: 'pending',
        });
        ok.textContent = 'Đặt hàng thành công!';
        ok.style.display = 'block';
        await sendOrderEmail({ id: null, method: data.payment_method, total: totalNow, items: cartNow, customer: { name: data.name, phone: data.phone, email: data.email, address: data.address } });
        localStorage.removeItem('cart');
      }
    }catch(ex){
      console.error(ex);
      err.textContent = 'Có lỗi, vui lòng thử lại.';
      err.style.display='block';
    }
  });
});
