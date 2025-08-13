
import { auth, db, functions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
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

let currentUser = null;
let currentBalance = 0;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Vui lòng đăng nhập trước khi thanh toán.");
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  document.getElementById("meEmail").textContent = user.email;
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const data = snap.data();
    document.getElementById("meName").textContent = data.name || "";
    document.getElementById("meBalance").textContent = money(data.balance || 0);
    currentBalance = data.balance || 0;
  }
  renderSummary();
});

function renderSummary(){
  const cart = loadCart();
  const wrap = document.getElementById('summary');
  if (!cart.length) {
    wrap.innerHTML = '<p>Giỏ hàng trống.</p>';
    return;
  }
  let sum = 0;
  wrap.innerHTML = cart.map(i=>{
    sum += (i.price||0) * (i.qty||1);
    return `<div>${i.name} × ${i.qty}</div>`;
  }).join('');
  document.getElementById('total').textContent = money(sum);
}

document.getElementById("btnCheckout").addEventListener("click", async ()=>{
  const cart = loadCart();
  if (!cart.length) {
    alert("Giỏ hàng trống.");
    return;
  }
  const payMethod = document.querySelector('input[name=payment]:checked')?.value;
  let sum = cart.reduce((t,i)=> t+(i.price||0)*(i.qty||1),0);
  if (payMethod === "wallet") {
    if (currentBalance < sum) {
      alert("Số dư không đủ.");
      return;
    }
  }
  const order = {
    userId: currentUser.uid,
    items: cart,
    total: sum,
    payment: payMethod,
    status: payMethod==="wallet" ? "chờ admin" : "chưa thanh toán",
    createdAt: serverTimestamp()
  };
  await addDoc(collection(db,"orders"), order);
  localStorage.removeItem("cart");
  alert("Đặt hàng thành công!");
  window.location.href = "index.html";
});
