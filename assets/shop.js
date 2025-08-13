
// shop.js — card renderer with 4:3 image ratio classes
function cardHTML(p){
  return `
  <div class="card">
    <div class="product__thumb">
      ${p.is_sale ? `<span class="product__badge">SALE</span>` : ''}
      <img src="${p.image || 'img/logo.jpg'}" alt="${p.name || ''}"/>
    </div>
    <div class="product__body">
      <h3 class="product__title">${p.name || ''}</h3>
      <div class="product__price">
        <span class="price">${money(p.price||0)}</span>
        ${p.original_price ? `<del>${money(p.original_price)}</del>` : ''}
      </div>
      <div class="product__actions">
        <button class="btn buy-now" data-id="${p.id}">Mua ngay</button>
      </div>
    </div>
  </div>`;
}
