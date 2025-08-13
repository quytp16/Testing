// assets/auth.js (enhanced: signup with name/phone/address, save profile)
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

/** Build profile object from a form (gracefully handles missing fields) */
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

/** Write users/{uid} with profile fields (merge) */
async function saveUserDoc(uid, {name, phone, address, email}, extra={}){
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    name: name || '',
    phone: phone || '',
    address: address || '',
    email: email || '',
    role: extra.role || 'user',
    balance: Number(extra.balance ?? 0),
    updatedAt: serverTimestamp(),
    ...(extra.createdAt ? { createdAt: serverTimestamp() } : {})
  }, { merge: true });
}

/* ======= SIGNUP =======
  Expected form markup:
  <form id="formSignup">
    <input name="name" required>
    <input name="phone" required>
    <input name="address" required>
    <input name="email" type="email" required>
    <input name="password" type="password" required>
    <button type="submit">Đăng ký</button>
  </form>
*/
const formSignup = $('#formSignup');
if (formSignup){
  formSignup.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = formSignup.querySelector('[type="submit"]');
    btn && (btn.disabled = true);
    try{
      const { name, phone, address, email, password } = getProfileFromForm(formSignup);
      if (!email || !password) throw new Error('Vui lòng nhập email và mật khẩu');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Update displayName
      await updateProfile(cred.user, { displayName: name || '' });
      // Write Firestore user
      await saveUserDoc(cred.user.uid, { name, phone, address, email }, { role:'user', balance:0, createdAt:true });
      // UX: close modal if any
      closeAnyModal();
    }catch(err){
      alert(err.message || 'Đăng ký thất bại');
    }finally{
      btn && (btn.disabled = false);
    }
  });
}

/* ======= LOGIN =======
  Expected form markup:
  <form id="formLogin">
    <input name="email" type="email" required>
    <input name="password" type="password" required>
    <button type="submit">Đăng nhập</button>
  </form>
*/
const formLogin = $('#formLogin');
if (formLogin){
  formLogin.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = formLogin.querySelector('[type="submit"]');
    btn && (btn.disabled = true);
    try{
      const data = new FormData(formLogin);
      const email = (data.get('email')||'').toString().trim();
      const password = (data.get('password')||'').toString();
      await signInWithEmailAndPassword(auth, email, password);
      closeAnyModal();
    }catch(err){
      alert(err.message || 'Đăng nhập thất bại');
    }finally{
      btn && (btn.disabled = false);
    }
  });
}

/* ======= LOGOUT ======= */
const btnLogout = $('#btnLogout');
btnLogout && btnLogout.addEventListener('click', async ()=>{
  await signOut(auth);
});

/** Optional helper to close modal if your UI uses .modal.open */
function closeAnyModal(){
  const m = document.querySelector('.modal.open');
  if (m) m.classList.remove('open');
}

/* ======= AUTH STATE ======= */
onAuthStateChanged(auth, async (user)=>{
  const acctBox = $('#acctBox');
  const badge = $('#badgeRole');
  if (user){
    // Show wallet/account snippet if exist
    try{
      const snap = await getDoc(doc(db,'users', user.uid));
      const d = snap.exists() ? snap.data() : {};
      $('#meEmail') && ($('#meEmail').textContent = user.email || d.email || '—');
      $('#meName') && ($('#meName').textContent = d.name || user.displayName || '—');
      $('#meBalance') && ($('#meBalance').textContent = money(Number(d.balance || 0)));
      if (badge){ badge.textContent = d.role || 'user'; badge.style.display = 'inline-block'; }
    }catch{}
    acctBox && (acctBox.style.display = 'block');
  } else {
    if (badge){ badge.textContent = ''; badge.style.display = 'none'; }
    acctBox && (acctBox.style.display = 'none');
  }
});
