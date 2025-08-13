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
        localStorage.removeItem('cart');
      }
    }catch(ex){
      console.error(ex);
      err.textContent = 'Có lỗi, vui lòng thử lại.';
      err.style.display='block';
    }
  });
});
