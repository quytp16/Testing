// auth.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = s => document.querySelector(s);
const money = n => (n||0).toLocaleString('vi-VN') + '₫';

function openAuth(){ document.querySelector('.modal')?.classList.add('open'); }
function closeAuth(){ document.querySelector('.modal')?.classList.remove('open'); }

(function mountAuthModal(){
  const html = `
  <div class="modal" id="authModal">
    <div class="modal__panel">
      <div class="modal__head">
        <strong>Tài khoản</strong>
        <button class="icon-btn" id="xAuth">×</button>
      </div>
      <div class="modal__body">
        <div class="tabs"><button id="tabLogin" class="active">Đăng nhập</button><button id="tabSignup">Đăng ký</button></div>
        <form id="formLogin" class="form-grid">
          <div><label>Email</label><input id="li_email" type="email" required></div>
          <div><label>Mật khẩu</label><input id="li_pass" type="password" required></div>
          <button class="btn" style="grid-column:1/-1" type="submit">Đăng nhập</button>
        </form>
        <form id="formSignup" class="form-grid" style="display:none">
          <div><label>Họ tên</label><input id="su_name" required></div>
          <div><label>Email</label><input id="su_email" type="email" required></div>
          <div><label>Mật khẩu</label><input id="su_pass" type="password" required minlength="6"></div>
          <button class="btn" style="grid-column:1/-1" type="submit">Tạo tài khoản</button>
        </form>
        <div id="authErr" class="alert error">Lỗi xác thực</div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  // Tab switch
  $('#tabLogin').onclick = ()=>{ $('#tabLogin').classList.add('active'); $('#tabSignup').classList.remove('active'); $('#formLogin').style.display='grid'; $('#formSignup').style.display='none'; };
  $('#tabSignup').onclick = ()=>{ $('#tabSignup').classList.add('active'); $('#tabLogin').classList.remove('active'); $('#formLogin').style.display='none'; $('#formSignup').style.display='grid'; };
  $('#xAuth').onclick = closeAuth;
})();

const btnAccount = $('#btnAccount');
btnAccount?.addEventListener('click', ()=>{
  const me = auth.currentUser;
  if (me) {
    if (confirm('Đăng xuất tài khoản hiện tại?')) signOut(auth);
  } else {
    openAuth();
  }
});

$('#formLogin')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  $('#authErr').style.display='none';
  try{
    await signInWithEmailAndPassword(auth, $('#li_email').value.trim(), $('#li_pass').value);
    closeAuth();
  }catch(ex){ $('#authErr').textContent = ex.message; $('#authErr').style.display='block'; }
});

$('#formSignup')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  $('#authErr').style.display='none';
  try{
    const email = $('#su_email').value.trim();
    const pass = $('#su_pass').value;
    const name = $('#su_name').value.trim();
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (name) await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      email,
      displayName: name || '',
      role: 'user',
      balance: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    closeAuth();
  }catch(ex){ $('#authErr').textContent = ex.message; $('#authErr').style.display='block'; }
});

onAuthStateChanged(auth, async (user)=>{
  const badge = $('#badgeRole');
  const wallet = $('#wallet');
  if (!user){
    btnAccount.textContent = 'Đăng nhập';
    badge.style.display='none';
    wallet.style.display='none';
    const ap = document.getElementById('adminPanel'); if (ap) ap.style.display='none';
    return;
  }
  btnAccount.textContent = user.email + ' (Đăng xuất)';
  wallet.style.display='block';

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, { email: user.email, displayName: user.displayName||'', role:'user', balance:0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }

  onSnapshot(ref, (s)=>{
    const u = s.data()||{};
    $('#meEmail').textContent = u.email||user.email;
    $('#meName').textContent = u.displayName||user.displayName||'-';
    $('#meBalance').textContent = money(u.balance||0);
    if (u.role === 'admin'){
      badge.textContent = 'Admin';
      badge.style.display='inline-block';
      const ap = document.getElementById('adminPanel'); if (ap) ap.style.display='block';
    } else {
      badge.textContent = 'User';
      badge.style.display='inline-block';
      const ap = document.getElementById('adminPanel'); if (ap) ap.style.display='none';
    }
  });
});
