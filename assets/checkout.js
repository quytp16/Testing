// checkout.js
import { auth, db, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { BANK } from './app-config.js';

const money = n => (n||0).toLocaleString('vi-VN') + '₫';

function loadCart(){ return JSON.parse(localStorage.getItem('cart')||'[]'); }

function vietqrUrl({amount, addInfo}){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK;
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const params = new URLSearchParams();
  if (amount) params.append('amount', Math.round(amount));
  if (addInfo) params.append('addInfo', addInfo);
  if (accountName) params.append('accountName', accountName);
  return `${base}?${params.toString()}`;
}

function render(){
  const cart = loadCart();
  const sumDiv = document.getElementById('summary');
  sumDiv.innerHTML = '';
  if (!cart.length){ sumDiv.innerHTML = '<div class="muted">Giỏ hàng trống. <a href="index.html">Quay lại mua hàng</a>.</div>'; }
  else { cart.forEach(it=>{ const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.innerHTML = `<div>${it.name} <span class="muted">x${it.qty}</span></div><div><strong>${money(it.qty*it.price)}</strong></div>`; sumDiv.appendChild(row); }); }
  const total = cart.reduce((s,i)=>s+i.qty*i.price,0);
  document.getElementById('sumTotal').textContent = money(total);
  return { cart, total };
}

const state = { user:null, orderId:null };

onAuthStateChanged(auth, (u)=>{ state.user = u; });

document.addEventListener('DOMContentLoaded', ()=>{
  const { cart, total } = render();
  const form = document.getElementById('payForm');
  const guide = document.getElementById('guide');
  const payment = document.getElementById('payment');
  const qrBox = document.getElementById('qrBox');
  const qrImg = document.getElementById('vietqrImg');
  const qrNote = document.getElementById('qrNote');

  function syncGuide(){
    const v = payment.value;
    guide.textContent = v==='WALLET' ? 'Thanh toán bằng ví: hệ thống sẽ tự trừ số dư ngay khi đặt.'
                    : v==='BANK' ? 'Chuyển khoản qua VietQR theo mã hiển thị. Đơn sẽ tự ghi nhận khi bạn thanh toán.'
                    : v==='MOMO' ? 'MoMo: sẽ gửi số khi xác nhận.'
                    : 'COD: thanh toán khi nhận hàng.';
    qrBox.style.display = (v==='BANK') ? 'block' : 'none';
  }
  payment.addEventListener('change', syncGuide); syncGuide();

  form.addEventListener('input', ()=>{
    if (payment.value !== 'BANK') return;
    const data = Object.fromEntries(new FormData(form));
    const add = (data.name?data.name:'') + (data.phone?` ${data.phone}`:'');
    qrImg.src = vietqrUrl({ amount: total, addInfo: add || 'Thanh toan don hang' });
    qrNote.textContent = `Chủ TK: ${BANK.accountName} — Ghi chú: ${add || 'Thanh toan don hang'}`;
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const ok = document.getElementById('ok'), err = document.getElementById('err'); ok.style.display='none'; err.style.display='none';

    const data = Object.fromEntries(new FormData(form));
    const payloadBase = {
      items: cart,
      total,
      address: data.address,
      note: data.note||'',
      userId: state.user?.uid || null,
      user: state.user ? { email: state.user.email } : { email: data.email, name: data.name, phone: data.phone },
      createdAt: serverTimestamp(),
    };

    try{
      if (data.payment_method==='WALLET'){
        if (!state.user){ alert('Vui lòng đăng nhập để dùng Ví tiền.'); return; }
        const placeOrderWithWallet = httpsCallable(functions, 'placeOrderWithWallet');
        const res = await placeOrderWithWallet({
          items: cart,
          total,
          address: data.address,
          note: data.note||'',
        });
        state.orderId = res.data?.orderId || null;
        ok.textContent = 'Đặt hàng & trừ ví thành công!';
        ok.style.display = 'block';
        localStorage.removeItem('cart');
      }
      else if (data.payment_method==='BANK'){
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
        const odRef = await addDoc(collection(db,'orders'), {
          ...payloadBase,
          paymentMethod: 'BANK',
          status: 'awaiting_bank',
        });
        state.orderId = odRef.id;
        const addInfo = `ORDER-${odRef.id}`;
        qrImg.src = vietqrUrl({ amount: total, addInfo });
        qrNote.textContent = `Nội dung chuyển khoản: ${addInfo}`;
        ok.textContent = 'Đã tạo đơn. Vui lòng quét mã để thanh toán!';
        ok.style.display = 'block';
      }
      else {
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
        await addDoc(collection(db,'orders'), {
          ...payloadBase,
          paymentMethod: data.payment_method,
          status: 'pending',
        });
        ok.textContent = 'Đặt hàng thành công!';
        ok.style.display = 'block';
        localStorage.removeItem('cart');
      }
    }catch(ex){ console.error(ex); err.style.display='block'; }
  });
});
