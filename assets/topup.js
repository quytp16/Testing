
// assets/topup.js
import { auth } from "./firebase-config.js";
import { BANK } from "./app-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function vietqrUrl({ amount, addInfo }){
  const { bankCode, accountNumber, accountName, template='compact' } = BANK;
  const base = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-${template}.png`;
  const qs = new URLSearchParams();
  qs.set("amount", Math.max(10000, Math.round(amount||10000)));
  if (addInfo) qs.set("addInfo", addInfo);
  if (accountName) qs.set("accountName", accountName);
  return `${base}?${qs.toString()}`;
}

onAuthStateChanged(auth, (user) => {
  const wallet = document.getElementById("wallet");
  if (!wallet || !user) return;
  if (document.getElementById("topupBtn")) return; // already mounted

  const btn = document.createElement("button");
  btn.id = "topupBtn";
  btn.className = "btn";
  btn.textContent = "Nạp ví";
  wallet.querySelector(".box").appendChild(btn);

  btn.onclick = () => {
    const v = Number(prompt("Nhập số tiền muốn nạp (VND):", "50000")) || 0;
    if (v <= 0) return;
    const addInfo = `TOPUP-${user.uid}`;
    const url = vietqrUrl({ amount: v, addInfo });
    window.open(url, "_blank");
    alert(`Vui lòng quét QR để nạp.\nNội dung chuyển khoản: ${addInfo}\nSau khi bên ngân hàng gửi webhook về, số dư sẽ tự cộng.`);
  };
});
