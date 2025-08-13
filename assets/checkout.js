
import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, getDoc, addDoc, collection, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/meozvdoo';
const BCC_EMAILS = []; // Optional BCC list
const moneyVN = n => (n || 0).toLocaleString('vi-VN') + '₫';

// Auto-fill checkout form if logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const d = snap.data();
      document.querySelector('[name="name"]').value = d.name || '';
      document.querySelector('[name="phone"]').value = d.phone || '';
      document.querySelector('[name="address"]').value = d.address || '';
      document.querySelector('[name="email"]').value = d.email || user.email || '';
      document.getElementById('walletBalance').textContent = moneyVN(d.balance || 0);
    }
  }
});

// Build HTML email
function buildEmailHTML({ id, method, total, items, customer }) {
  const lines = (items || []).map(i =>
    `<li><strong>${i.name}</strong> × ${i.qty} — ${moneyVN(i.price || 0)}</li>`
  ).join('');
  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
      <h2 style="margin:0 0 8px">🛒 Đơn hàng #${id || 'N/A'}</h2>
      <p style="margin:0 0 8px"><b>Phương thức:</b> ${method} &nbsp; • &nbsp; <b>Tổng:</b> ${moneyVN(total)}</p>
      <hr style="border:none;border-top:1px solid #eee;margin:12px 0">
      <h3 style="margin:0 0 6px">Khách hàng</h3>
      <p style="margin:0 0 8px">
        <b>Họ tên:</b> ${customer.name || '-'}<br>
        <b>Điện thoại:</b> ${customer.phone || '-'}<br>
        <b>Email:</b> ${customer.email || '-'}<br>
        <b>Địa chỉ:</b> ${customer.address || '-'}
      </p>
      <h3 style="margin:12px 0 6px">Sản phẩm</h3>
      <ul style="margin:0;padding-left:18px">${lines || '<li>(trống)</li>'}</ul>
    </div>
  `;
}

// Send order email via Formspree
async function sendOrderEmail({ id, method, total, items, customer }) {
  if (!FORMSPREE_ENDPOINT) return;
  try {
    const subject = `Đơn hàng mới – ${customer?.email || 'khách'} – ${method}`;
    const html = buildEmailHTML({ id, method, total, items, customer });

    const body = new FormData();
    body.append('subject', subject);
    body.append('message', html);
    body.append('_format', 'html');

    body.append('order_id', id || 'N/A');
    body.append('total', String(total || 0));
    body.append('payment_method', method || '');
    if (customer?.email) {
      body.append('email', customer.email);
      body.append('_replyto', customer.email);
      body.append('_cc', customer.email);
    }
    if (customer?.name) body.append('name', customer.name);
    if (customer?.phone) body.append('phone', customer.phone);
    if (customer?.address) body.append('address', customer.address);

    if (Array.isArray(BCC_EMAILS)) BCC_EMAILS.forEach(e => e && body.append('_bcc', e));
    await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body, headers: { 'Accept': 'application/json' } });
  } catch (e) { console.warn('Send mail failed:', e); }
}

// Print invoice
function openInvoicePDF(order) {
  const w = window.open('', '_blank');
  w.document.write(buildEmailHTML(order));
  w.document.close();
  w.print();
}

// Checkout form submit
const formCheckout = document.getElementById('formCheckout');
if (formCheckout) {
  formCheckout.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(formCheckout);
    const order = {
      name: data.get('name'),
      phone: data.get('phone'),
      address: data.get('address'),
      email: data.get('email'),
      method: data.get('payment_method'),
    };

    const items = JSON.parse(localStorage.getItem('cart') || '[]');
    const total = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const orderDoc = await addDoc(collection(db, 'orders'), {
      customer: order,
      items,
      total,
      method: order.method,
      createdAt: serverTimestamp()
    });
    const orderId = orderDoc.id;

    // Send email to seller
    await sendOrderEmail({ id: orderId, method: order.method, total, items, customer: order });

    // Open invoice for PDF save
    openInvoicePDF({ id: orderId, method: order.method, total, items, customer: order });

    alert('Đặt hàng thành công!');
    localStorage.removeItem('cart');
    window.location.href = '/';
  });
}
