// assets/checkout.js — SAFE DOM (no null errors) + autofill + email + invoice PDF
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ===== Config =====
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/meozvdoo';
const BCC_EMAILS = []; // optional BCC

// ===== Utils =====
const $ = (s)=>document.querySelector(s);
const moneyVN = n => (Number(n)||0).toLocaleString('vi-VN') + '₫';
const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
const setVal  = (sel, text) => { const el = $(sel); if (el && 'value' in el) el.value = text; };

function loadCart(){
  try { return JSON.parse(localStorage.getItem('cart')||'[]'); } catch { return []; }
}

// ===== Auto-fill from profile if logged-in =====
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try{
    const snap = await getDoc(doc(db, 'users', user.uid));
    const d = snap.exists() ? (snap.data()||{}) : {};
    // Fill account box (if present on checkout page)
    setText('#meEmail', user.email || d.email || '—');
    setText('#meName', d.name || '—');
    setText('#meBalance', moneyVN(Number(d.balance || 0)));
    const walletBox = $('#wallet'); if (walletBox) walletBox.style.display = 'block';
    // Fill form fields (only if inputs exist)
    setVal('input[name="name"]', d.name || '');
    setVal('input[name="phone"]', d.phone || '');
    setVal('input[name="address"]', d.address || '');
    setVal('input[name="email"]', user.email || d.email || '');
  }catch(e){ console.warn('Autofill failed:', e); }
});

// ===== Email content (HTML for invoice window) =====
function buildEmailHTML({ id, method, total, items, customer }) {
  const lines = (items || []).map(i =>
    `<tr>
       <td style="padding:6px;border:1px solid #e5e7eb">${i.name}</td>
       <td style="padding:6px;border:1px solid #e5e7eb;text-align:center">${Number(i.qty||1)}</td>
       <td style="padding:6px;border:1px solid #e5e7eb;text-align:right">${moneyVN(Number(i.price||0))}</td>
     </tr>`
  ).join('');
  return `
    <div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <h2 style="margin:0 0 8px">🛒 Đơn hàng #${id||'N/A'}</h2>
      <p style="margin:0 0 8px"><b>Phương thức:</b> ${method} &nbsp; • &nbsp; <b>Tổng:</b> ${moneyVN(total)}</p>
      <h3 style="margin:12px 0 6px">Khách hàng</h3>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 8px;color:#555">Họ tên</td><td style="padding:4px 8px"><b>${customer.name||'-'}</b></td></tr>
        <tr><td style="padding:4px 8px;color:#555">Email</td><td style="padding:4px 8px">${customer.email||'-'}</td></tr>
        <tr><td style="padding:4px 8px;color:#555">SĐT</td><td style="padding:4px 8px">${customer.phone||'-'}</td></tr>
        <tr><td style="padding:4px 8px;color:#555">Địa chỉ</td><td style="padding:4px 8px">${customer.address||'-'}</td></tr>
      </table>
      <h3 style="margin:12px 0 6px">Sản phẩm</h3>
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="padding:6px;border:1px solid #e5e7eb;background:#f8fafc;text-align:left">Tên</th>
            <th style="padding:6px;border:1px solid #e5e7eb;background:#f8fafc;text-align:center">SL</th>
            <th style="padding:6px;border:1px solid #e5e7eb;background:#f8fafc;text-align:right">Giá</th>
          </tr>
        </thead>
        <tbody>${lines||''}</tbody>
      </table>
      <p style="margin-top:10px"><b>Tổng cộng:</b> ${moneyVN(total)}</p>
    </div>
  `;
}

// ===== Send email to seller (Formspree) =====
async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const products = (items||[]).map(i => `${i.name} x${Number(i.qty||1)}`).join(', ') || '(trống)';
    const text =
`ĐƠN HÀNG #${id || 'N/A'}
Phương thức: ${method}
Tổng: ${moneyVN(total)}

Khách hàng:
- Họ tên: ${customer.name || '-'}
- Email: ${customer.email || '-'}
- SĐT: ${customer.phone || '-'}
- Địa chỉ: ${customer.address || '-'}

Sản phẩm:
${products}`;

    const html = buildEmailHTML({ id, method, total, items, customer });

    const body = new FormData();
    body.append('subject', subject);
    // Gửi text (chắc chắn hiển thị ở free); đính kèm HTML để tham khảo
    body.append('message', text);
    body.append('html_preview', html);
    body.append('order_id', id || 'N/A');
    body.append('products', products);
    body.append('total', String(total || 0));
    body.append('payment_method', method || '');
    body.append('customer_name', customer?.name || '');
    body.append('customer_email', customer?.email || '');
    body.append('customer_phone', customer?.phone || '');
    body.append('customer_address', customer?.address || '');
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

// ===== Open invoice window (user can Save as PDF) =====
function openInvoicePDF({ id, method, total, items, customer }) {
  const w = window.open('', '_blank');
  if (!w) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hóa đơn #${id||'N/A'}</title></head><body>${buildEmailHTML({id,method,total,items,customer})}<script>setTimeout(()=>{try{window.print()}catch(e){}},300);</script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

// ===== Submit handler =====
const formCheckout = $('#formCheckout') || $('#payForm');
if (formCheckout) {
  formCheckout.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(formCheckout);
    const customer = {
      name: (data.get('name')||'').toString(),
      phone: (data.get('phone')||'').toString(),
      address: (data.get('address')||'').toString(),
      email: (data.get('email')||'').toString(),
    };
    const method = (data.get('payment_method')||'COD').toString();

    const items = loadCart();
    const total = items.reduce((s, i) => s + Number(i.price||0)*Number(i.qty||1), 0);

    // Lưu Firestore
    const ref = await addDoc(collection(db, 'orders'), {
      customer, items, total, paymentMethod: method, status: 'pending', createdAt: serverTimestamp()
    });
    const orderId = ref.id;

    // Gửi email cho người bán
    await sendOrderEmail({ id: orderId, method, total, items, customer });

    // Mở hóa đơn để In/Lưu PDF
    openInvoicePDF({ id: orderId, method, total, items, customer });

    // Clear cart + thông báo
    localStorage.removeItem('cart');
    alert('Đặt hàng thành công!');
  });
}
