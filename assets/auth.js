// assets/auth.js — hiển thị ví #wallet & panel admin theo role, lưu hồ sơ khi signup
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

/** Lấy dữ liệu form an toàn */
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

/** Ghi users/{uid} (merge) */
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

/* ======= SIGNUP ======= */
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
    }catch(err){
      alert(err.message || 'Đăng ký thất bại');
    }finally{ btn && (btn.disabled = false); }
  });
}

/* ======= LOGIN ======= */
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
    }catch(err){
      alert(err.message || 'Đăng nhập thất bại');
    }finally{ btn && (btn.disabled = false); }
  });
}

/* ======= LOGOUT (nếu có nút) ======= */
$('#btnLogout')?.addEventListener('click', async ()=>{ await signOut(auth); });

function closeAnyModal(){ document.querySelector('.modal.open')?.classList.remove('open'); }

/* ======= AUTH STATE ======= */
onAuthStateChanged(auth, async (user)=>{
  const walletBox  = $('#wallet');       // đúng id trong index.html
  const badge      = $('#badgeRole');
  const adminPanel = $('#adminPanel');
  const btnAccount = $('#btnAccount');

  if (user){
    // Lấy user doc
    let d = {};
    try {
      const snap = await getDoc(doc(db,'users', user.uid));
      if (snap.exists()) d = snap.data();
    } catch (e) { console.warn('getDoc users/{uid} failed:', e); }

    // Điền ví
    if (walletBox) walletBox.style.display = 'block';
    $('#meEmail')   && ($('#meEmail').textContent   = user.email || d.email || '—');
    $('#meName')    && ($('#meName').textContent    = d.name || user.displayName || '—');
    $('#meBalance') && ($('#meBalance').textContent = money(Number(d.balance || 0)));

    // Role (chấp nhận viết hoa/thường)
    const role = String(d.role || 'user').toLowerCase();
    if (badge){ badge.textContent = role; badge.style.display = 'inline-block'; }
    if (adminPanel) adminPanel.style.display = (role === 'admin') ? 'block' : 'none';

    if (btnAccount) btnAccount.textContent = 'Tài khoản';
  } else {
    if (walletBox) walletBox.style.display = 'none';
    if (badge){ badge.textContent = ''; badge.style.display = 'none'; }
    if (adminPanel) adminPanel.style.display = 'none';
    if (btnAccount) btnAccount.textContent = 'Đăng nhập';
  }
});
