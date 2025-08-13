// assets/auth.js — hiển thị email trên nút, thêm nút Đăng xuất khi đã đăng nhập
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (s)=>document.querySelector(s);
const money = n => (n||0).toLocaleString('vi-VN') + '₫';

function getProfileFromForm(form){
  const data = new FormData(form);
  return {
    name: (data.get('name')||'').toString().trim(),
    phone: (data.get('phone')||'').toString().trim(),
    address: (data.get('address')||'').toString().trim(),
    email: (data.get('email')||'').toString().trim(),
    password: (data.get('password')||'').toString()
  };
}

async function saveUserDoc(uid, {name, phone, address, email}, extra={}){
  await setDoc(doc(db, 'users', uid), {
    name: name || '',
    phone: phone || '',
    address: address || '',
    email: email || '',
    role: (extra.role || 'user'),
    balance: Number(extra.balance ?? 0),
    updatedAt: serverTimestamp(),
    ...(extra.createdAt ? { createdAt: serverTimestamp() } : {})
  }, { merge: true });
}

/* ===== SIGNUP ===== */
const formSignup = $('#formSignup');
if (formSignup){
  formSignup.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = formSignup.querySelector('[type="submit"]'); btn && (btn.disabled = true);
    try{
      const { name, phone, address, email, password } = getProfileFromForm(formSignup);
      if (!email || !password) throw new Error('Vui lòng nhập email và mật khẩu');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name || '' });
      await saveUserDoc(cred.user.uid, { name, phone, address, email }, { role:'user', balance:0, createdAt:true });
      closeAnyModal();
    }catch(err){ alert(err.message || 'Đăng ký thất bại'); }
    finally{ btn && (btn.disabled = false); }
  });
}

/* ===== LOGIN ===== */
const formLogin = $('#formLogin');
if (formLogin){
  formLogin.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = formLogin.querySelector('[type="submit"]'); btn && (btn.disabled = true);
    try{
      const data = new FormData(formLogin);
      const email = (data.get('email')||'').toString().trim();
      const password = (data.get('password')||'').toString();
      await signInWithEmailAndPassword(auth, email, password);
      closeAnyModal();
    }catch(err){ alert(err.message || 'Đăng nhập thất bại'); }
    finally{ btn && (btn.disabled = false); }
  });
}

/* ===== LOGOUT ===== */
function ensureLogoutButton(){
  const cta = document.querySelector('.header__cta');
  if (!cta) return null;
  let btn = document.getElementById('btnLogout');
  if (!btn){
    btn = document.createElement('button');
    btn.id = 'btnLogout';
    btn.className = 'btn';
    btn.textContent = 'Đăng xuất';
    cta.appendChild(btn);
    btn.addEventListener('click', async ()=>{ await signOut(auth); });
  }
  return btn;
}

function closeAnyModal(){ document.querySelector('.modal.open')?.classList.remove('open'); }

/* ===== AUTH STATE ===== */
onAuthStateChanged(auth, async (user)=>{
  const walletBox  = $('#wallet');
  const badge      = $('#badgeRole');
  const adminPanel = $('#adminPanel');
  const btnAccount = $('#btnAccount');
  const btnLogout  = ensureLogoutButton(); // tạo nếu chưa có

  // Cờ để code ở index.html biết đã đăng nhập hay chưa
  window.__SIGNED_IN = !!user;

  if (user){
    // Lấy doc user
    let d = {};
    try {
      const snap = await getDoc(doc(db,'users', user.uid));
      if (snap.exists()) d = snap.data();
    } catch (e) { console.warn('getDoc users/{uid} failed:', e); }

    // Cập nhật ví
    if (walletBox) walletBox.style.display = 'block';
    $('#meEmail')   && ($('#meEmail').textContent   = user.email || d.email || '—');
    $('#meName')    && ($('#meName').textContent    = d.name || user.displayName || '—');
    $('#meBalance') && ($('#meBalance').textContent = money(Number(d.balance || 0)));

    // Vai trò + admin
    const role = String(d.role || 'user').toLowerCase();
    if (badge){ badge.textContent = role; badge.style.display = 'inline-block'; }
    if (adminPanel) adminPanel.style.display = (role === 'admin') ? 'block' : 'none';

    // Nút tài khoản hiển thị email, không mở modal nữa
    if (btnAccount){
      btnAccount.textContent = user.email || 'Tài khoản';
      // chặn mở modal: gán onclick riêng
      btnAccount.onclick = (e)=>{ e.preventDefault(); /* sau này có thể mở dropdown tài khoản ở đây */ };
    }
    if (btnLogout) btnLogout.style.display = 'inline-block';
  } else {
    if (walletBox) walletBox.style.display = 'none';
    if (badge){ badge.textContent = ''; badge.style.display = 'none'; }
    if (adminPanel) adminPanel.style.display = 'none';

    // Nút tài khoản quay lại "Đăng nhập" và cho phép mở modal
    if (btnAccount){
      btnAccount.textContent = 'Đăng nhập';
      btnAccount.onclick = null; // dùng handler mặc định ở index.html để mở modal
    }
    if (btnLogout) btnLogout.style.display = 'none';
  }
});
