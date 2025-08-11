// Utilities
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const money = n => (n||0).toLocaleString('vi-VN') + '₫';
function toast(msg){
  const t = $('#toast'); if (!t) return;
  t.textContent = msg || 'Đã thêm vào giỏ hàng';
  t.style.display = 'block'; t.style.opacity = 1;
  setTimeout(()=>{ t.style.transition='opacity .4s'; t.style.opacity = 0; }, 1200);
  setTimeout(()=>{ t.style.display='none'; t.style.transition='none'; }, 1700);
}

// Cart state
let cart = JSON.parse(localStorage.getItem('cart')||'[]');
function saveCart(){ localStorage.setItem('cart', JSON.stringify(cart)); }
function cartCount(){ return cart.reduce((s,i)=>s+i.qty,0); }
function cartTotal(){ return cart.reduce((s,i)=>s+i.qty*i.price,0); }

function renderCartDrawer(){
  $('#cartCount').textContent = cartCount();
  $('#drawerTotal').textContent = money(cartTotal());
  const cont = $('#drawerItems'); if (!cont) return;
  cont.innerHTML = '';
  if (!cart.length){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Giỏ hàng trống';
    cont.appendChild(empty);
  } else {
    cart.forEach(it=>{
      const row = document.createElement('div');
      row.className = 'cart-item';
      row.style.display='grid'; row.style.gridTemplateColumns='1fr auto'; row.style.gap='8px';
      row.innerHTML = `<div><div><strong>${it.name}</strong></div><div class="muted">x${it.qty} · ${money(it.price)}</div></div>
                       <div><button data-dec="${it.id}" class="btn btn--small">-</button> <button data-inc="${it.id}" class="btn btn--small">+</button></div>`;
      cont.appendChild(row);
    });
  }
}

function openDrawer(){ $('#cartDrawer')?.classList.add('open'); }
function closeDrawer(){ $('#cartDrawer')?.classList.remove('open'); }

document.addEventListener('DOMContentLoaded', function(){
  // Open/Close cart
  $('#openCart')?.addEventListener('click', openDrawer);
  $('#closeCart')?.addEventListener('click', closeDrawer);
  $('#xCart')?.addEventListener('click', closeDrawer);

  // Add to cart buttons
  document.body.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const data = JSON.parse(btn.getAttribute('data-add')||'{}');
    const found = cart.find(i=>i.id===data.id);
    if (found) found.qty+=1; else cart.push({...data, qty:1});
    saveCart(); renderCartDrawer(); toast('Đã thêm vào giỏ'); openDrawer();
  });

  // Click image to add
  document.addEventListener('click', (e)=>{
    const thumb = e.target.closest('.product__thumb');
    if (!thumb) return;
    const card = thumb.closest('.product');
    const btn = card?.querySelector('[data-add]');
    if (btn && !btn.disabled) btn.click();
  });

  // +/- qty
  document.body.addEventListener('click', (e)=>{
    if (e.target.matches('[data-inc]')){
      const id = e.target.getAttribute('data-inc');
      const it = cart.find(i=>i.id===id); if (it){ it.qty+=1; saveCart(); renderCartDrawer(); }
    }
    if (e.target.matches('[data-dec]')){
      const id = e.target.getAttribute('data-dec');
      const it = cart.find(i=>i.id===id); if (it){ it.qty-=1; if (it.qty<=0) cart = cart.filter(x=>x.id!==id); saveCart(); renderCartDrawer(); }
    }
  });

  // initial
  renderCartDrawer();
});