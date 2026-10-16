import { products, categories, formatPrice, storeSettings, loadCatalogue, escapeHTML as esc, safeImage, safePosition, safeColor } from './catalogue.js';
import { apiRequest, getSession } from './store-api.js';

const findProduct = id => products.find(product => product.id === id);
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
let bag = [], wishlist = new Set(), initialized = false, hydrated = false;
let toastTimer, searchTimer, returnFocus, checkoutDraft, checkoutBusy = false, checkoutOpening = false;
let shopState;
const heart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7"/></svg>';
export const bagIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 7.5h14l1 13H4l1-13Z"/><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" stroke-linecap="round"/></svg>';
const bagKey = item => JSON.stringify([item.id,item.size,item.color]);
const MAX_QUANTITY = 20;
const MAX_BAG_ITEMS = 50;
const CHECKOUT_KEY = 'rahmeen-pending-checkout-v1';
function persistCheckout() {
  try {
    if (checkoutDraft?.pending) {
      const {requestId,items,quote,checkoutScope} = checkoutDraft;
      sessionStorage.setItem(CHECKOUT_KEY,JSON.stringify({requestId,items,quote,checkoutScope,pending:true}));
    } else sessionStorage.removeItem(CHECKOUT_KEY);
  } catch {}
}
function restoreCheckout() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY));
    if (saved?.pending && /^[a-zA-Z0-9_-]{16,100}$/.test(saved.requestId) && Array.isArray(saved.items) && saved.items.length > 0 && saved.items.length <= MAX_BAG_ITEMS && Array.isArray(saved.quote?.items) && Number.isFinite(saved.quote.total)) checkoutDraft=saved;
  } catch {}
}
const variantStock = (p,size,color) => Math.max(0, Number(p?.variants?.find(v=>v.size===size&&v.color===color)?.stock) || 0);
const inBag = (id,size,color) => bag.find(item=>bagKey(item)===bagKey({id,size,color}))?.quantity || 0;
const productStock = p => (p.variants || []).reduce((sum,v)=>sum+v.stock,0);
const orderingAvailable = () => storeSettings.available && storeSettings.orderingEnabled && storeSettings.codEnabled;
const priceCeiling = () => Math.max(100,Math.ceil(Math.max(0,...products.map(p=>p.price))/100)*100);
const initialFilters = (category='All') => ({category:categories.includes(category)?category:'All',size:'All',color:'All',fabric:'All',max:priceCeiling(),sort:'featured'});
const imageAttrs = p => `src="${esc(safeImage(p.image))}" style="object-position:${esc(safePosition(p.position))}"`;
const priceMarkup = p => `${Number(p.compareAtPrice)>p.price?`<del class="c-compare-price"><span class="sr-only">Original price </span>${formatPrice(p.compareAtPrice)}</del><span class="sr-only"> Sale price </span>`:''}${formatPrice(p.price)}`;
const galleryImages = p => [...new Set([p.image,p.imageAlt,...(p.images||[])].filter(Boolean).map(safeImage))];
function renderGallery(p){const images=galleryImages(p);return `<div class="c-gallery"><div class="c-gallery-main"><img id="c-main-photo" ${imageAttrs(p)} alt="${esc(p.name)} — full view" width="900" height="1200"><span id="c-gallery-caption">Full view</span></div><div class="c-gallery-thumbs">${images.map((source,index)=>`<button class="${index===0?'is-active':''}" data-commerce-action="gallery" data-image-index="${index}" aria-label="Show ${index===0?'full view':`image ${index+1}`}" aria-pressed="${index===0}"><img src="${esc(source)}" style="object-position:${esc(safePosition(p.position))}" alt=""></button>`).join('')}${images.length===1?`<button data-commerce-action="gallery" data-view="detail" aria-label="Show closer crop of the same photograph" aria-pressed="false"><img class="c-detail-crop" ${imageAttrs(p)} alt=""></button>`:''}<span>${images.length===1?'Full view & a closer look':`${images.length} views · Find every detail`}</span></div></div>`;}
const save = () => { try { localStorage.setItem('rahmeen-bag-v1',JSON.stringify(bag)); localStorage.setItem('rahmeen-wishlist-v1',JSON.stringify([...wishlist])); } catch {} updateCounters(); };

function reconcileBag() {
  const before=JSON.stringify(bag), valid=[];
  for(const item of bag) {
    const p=findProduct(item?.id);
    if(!item || typeof item.id!=='string' || typeof item.size!=='string' || typeof item.color!=='string' || !Number.isInteger(item.quantity) || item.quantity<1) continue;
    if(storeSettings.available && (!p || !p.sizes.includes(item.size) || !p.colors.some(c=>c.name===item.color))) continue;
    const maximum=storeSettings.available ? Math.min(MAX_QUANTITY,variantStock(p,item.size,item.color)) : MAX_QUANTITY;
    if(!maximum) continue;
    const existing=valid.find(row=>bagKey(row)===bagKey(item));
    if(existing) existing.quantity=Math.min(maximum,existing.quantity+item.quantity);
    else if(valid.length<MAX_BAG_ITEMS)valid.push({id:item.id,size:item.size,color:item.color,quantity:Math.min(maximum,item.quantity)});
  }
  bag=valid; if(storeSettings.available)wishlist=new Set([...wishlist].filter(id=>findProduct(id))); save();
  return before!==JSON.stringify(bag);
}
function hydrate() {
  if(hydrated)return; hydrated=true;
  const storedBag=readStore('rahmeen-bag-v1',[]),storedWishlist=readStore('rahmeen-wishlist-v1',[]);
  bag=Array.isArray(storedBag)?storedBag:[];
  wishlist=new Set(Array.isArray(storedWishlist)?storedWishlist.filter(id=>typeof id==='string'):[]);
  restoreCheckout();
  reconcileBag();
}
function unavailableNote() {
  if(!storeSettings.available) return '<p class="c-store-notice" role="status">Ordering is temporarily unavailable. These pieces are available to browse; reconnect to the store before placing an order.</p>';
  if(!orderingAvailable()) return '<p class="c-store-notice" role="status">Ordering is currently paused. You can continue browsing and saving your favourite pieces.</p>';
  return storeSettings.demoMode?'<p class="c-store-notice c-demo-banner">Preview mode · Test orders are saved in the dashboard. They are not fulfilled or charged.</p>':'';
}

export function productCard(product) {
  const saved=wishlist.has(product.id),soldOut=storeSettings.available&&!productStock(product),disabled=!orderingAvailable()||soldOut;
  return `<article class="c-product-card" data-product-card="${esc(product.id)}">
    <div class="c-card-image"><a href="#/product/${encodeURIComponent(product.id)}" aria-label="Explore ${esc(product.name)}"><img ${imageAttrs(product)} alt="${esc(product.name)} — ${esc(product.subtitle)}" loading="lazy" width="600" height="800">${product.imageAlt?`<img class="c-card-alternate" src="${esc(safeImage(product.imageAlt))}" alt="" style="object-position:${esc(safePosition(product.position))}" loading="lazy" width="600" height="800">`:''}</a>
    <button class="c-heart ${saved?'is-saved':''}" data-commerce-action="wishlist" data-id="${esc(product.id)}" aria-label="${saved?'Remove':'Save'} ${esc(product.name)} ${saved?'from':'to'} wishlist" aria-pressed="${saved}">${heart}</button>
    <button class="c-quick-add" data-commerce-action="quick-add" data-id="${esc(product.id)}" ${disabled?'disabled':''}><span>${soldOut?'Sold out':!orderingAvailable()?'Browse only':'Quick add'}</span>${bagIcon}</button></div>
    <div class="c-card-meta"><div><a class="c-product-name" href="#/product/${encodeURIComponent(product.id)}">${esc(product.name)}</a><p>${esc(product.subtitle)}</p></div><span class="c-card-price">${priceMarkup(product)}</span></div>
    <div class="c-swatches" aria-label="Available colours">${product.colors.map((color,i)=>`<button class="c-swatch ${i===0?'is-active':''}" style="--swatch:${safeColor(color.hex)}" title="${esc(color.name)}" aria-pressed="${i===0}" aria-label="View ${esc(product.name)} in ${esc(color.name)}" data-commerce-action="card-color" data-id="${esc(product.id)}" data-color="${esc(color.name)}"></button>`).join('')}<span class="c-color-name">${esc(product.colors[0].name)}</span></div>
  </article>`;
}
const filterOptions = (values,current) => values.map(value=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(value)}</option>`).join('');
function matchingProducts() {
  const result=products.filter(p=>(shopState.category==='All'||p.category===shopState.category)&&(shopState.size==='All'||p.sizes.includes(shopState.size))&&(shopState.color==='All'||p.colors.some(c=>c.name===shopState.color))&&(shopState.fabric==='All'||p.fabric===shopState.fabric)&&p.price<=shopState.max);
  if(shopState.sort==='price-low')result.sort((a,b)=>a.price-b.price);
  if(shopState.sort==='price-high')result.sort((a,b)=>b.price-a.price);
  if(shopState.sort==='name')result.sort((a,b)=>a.name.localeCompare(b.name));
  if(shopState.sort==='featured')result.sort((a,b)=>Number(Boolean(b.featured))-Number(Boolean(a.featured)));
  return result;
}
function shopResults() { const found=matchingProducts();return found.length?found.map(productCard).join(''):`<div class="c-empty"><span class="c-empty-mark">✧</span><h2>No pieces found</h2><p>Try a different colour, size or price range.</p><button class="button c-solid" data-commerce-action="reset-filters">Clear filters</button></div>`; }
export function renderShop(category='All') {
  shopState=initialFilters(category);
  return `<section class="c-shop c-page"><div class="c-page-intro"><p class="eyebrow">THE RAHMEEN WARDROBE</p><h1>${shopState.category==='All'?'Find your <em>everyday extraordinary.</em>':esc(shopState.category)}</h1><p>Pieces to make your own. Discover thoughtful textures, joyful colour and effortless silhouettes.</p></div>${unavailableNote()}
  <div class="c-shop-top"><span id="c-result-count" aria-live="polite">${matchingProducts().length} pieces</span><button class="c-filter-toggle" data-commerce-action="toggle-filters" aria-expanded="false" aria-controls="c-filters">Filters <span aria-hidden="true">+</span></button><label class="c-sort-label">Sort by <select name="sort" data-shop-filter="sort"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A to Z</option></select></label></div>
  <div class="c-shop-layout"><aside class="c-filters" id="c-filters" aria-label="Filter products"><div class="c-filter-heading"><h2>Refine your edit</h2><button data-commerce-action="reset-filters">Clear all</button></div>
  <label>Collection<select data-shop-filter="category">${filterOptions(['All',...categories],shopState.category)}</select></label>
  <label>Size<select data-shop-filter="size">${filterOptions(['All',...new Set(products.flatMap(p=>p.sizes))],'All')}</select></label>
  <label>Colour<select data-shop-filter="color">${filterOptions(['All',...new Set(products.flatMap(p=>p.colors.map(c=>c.name)))],'All')}</select></label>
  <label>Fabric<select data-shop-filter="fabric">${filterOptions(['All',...new Set(products.map(p=>p.fabric).filter(Boolean))],'All')}</select></label>
  <label>Maximum price <output id="c-price-value">${formatPrice(shopState.max)}</output><input type="range" min="0" max="${shopState.max}" step="1" value="${shopState.max}" data-shop-filter="max" aria-label="Maximum price in Pakistani rupees"></label><p class="c-filter-note">A wardrobe for every version of you.</p></aside>
  <div class="c-product-grid c-shop-grid" id="c-shop-results">${shopResults()}</div></div></section>`;
}

export function renderProduct(id) {
  const p=findProduct(id);if(!p)return `<section class="c-page c-empty"><h1>This piece is not in our edit.</h1><p>Explore the collection to find something you love.</p><a class="button c-solid" href="#/shop">Explore the collection ${arrow}</a></section>`;
  const firstColor=p.colors[0].name,disabled=!orderingAvailable()||!productStock(p);
  return `<section class="c-product-page c-page" data-detail-id="${esc(p.id)}"><nav class="c-breadcrumb" aria-label="Breadcrumb"><a href="#/">Home</a><span>/</span><a href="#/shop/${encodeURIComponent(p.category)}">${esc(p.category)}</a><span>/</span><span>${esc(p.name)}</span></nav>${unavailableNote()}
  <div class="c-product-layout">${renderGallery(p)}
  <div class="c-product-info"><p class="eyebrow">${esc(p.category.toUpperCase())}</p><h1>${esc(p.name)}</h1><p class="c-product-subtitle">${esc(p.subtitle)}</p><p class="c-detail-price">${priceMarkup(p)}</p><p class="c-product-description">${esc(p.description)}</p>
  <div class="c-choice"><span>Colour: <strong id="c-selected-color">${esc(firstColor)}</strong></span><div class="c-detail-colors">${p.colors.map((c,i)=>`<button class="c-swatch ${i===0?'is-active':''}" style="--swatch:${safeColor(c.hex)}" aria-label="${esc(c.name)}" aria-pressed="${i===0}" data-commerce-action="detail-color" data-color="${esc(c.name)}"></button>`).join('')}</div>${storeSettings.demoMode?'<small>Preview collection · Photography and sample product details are illustrative.</small>':''}</div>
  <div class="c-choice"><div class="c-choice-heading"><span>${p.sizes.length===1?'Format':'Select size'}</span>${p.sizes.length>1?'<button class="c-text-button" data-commerce-action="size-guide">Size guide ↗</button>':''}</div><div class="c-size-buttons" id="c-size-choice" role="group" aria-label="Choose a size">${p.sizes.map(size=>{const unavailable=storeSettings.available&&!variantStock(p,size,firstColor),selected=p.sizes.length===1&&!unavailable;return `<button data-commerce-action="detail-size" data-size="${esc(size)}" aria-pressed="${selected}" class="${selected?'is-active':''}" ${unavailable?'disabled title="Sold out in this colour"':''}>${esc(size)}</button>`;}).join('')}</div><p class="c-stock-status" id="c-stock-status" aria-live="polite">${disabled?(storeSettings.available?'Currently unavailable':'Ordering unavailable'):'Choose your size to check availability.'}</p><p class="c-form-error" id="c-size-error" role="alert"></p></div>
  <div class="c-add-row"><div class="c-quantity" aria-label="Quantity"><button data-commerce-action="detail-minus" aria-label="Decrease quantity">−</button><output id="c-detail-quantity">1</output><button data-commerce-action="detail-plus" aria-label="Increase quantity">+</button></div><button class="button c-solid c-add-detail" data-commerce-action="add-detail" data-id="${esc(p.id)}" ${disabled?'disabled':''}>${disabled?'Unavailable':'Add to bag'} ${bagIcon}</button><button class="c-detail-heart ${wishlist.has(p.id)?'is-saved':''}" data-commerce-action="wishlist" data-id="${esc(p.id)}" aria-label="Save ${esc(p.name)} to wishlist" aria-pressed="${wishlist.has(p.id)}">${heart}</button></div>
  <p class="c-purchase-note">A considered piece. A wardrobe all your own.</p><div class="c-accordions"><details open><summary>The details <span>+</span></summary><ul>${p.details.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details><details><summary>Care, with love <span>+</span></summary><p>${esc(p.care)}</p></details><details><summary>Delivery & returns <span>+</span></summary><p>${storeSettings.demoMode?'Test orders are recorded in the dashboard for previewing the order process. They are not fulfilled and no payment is collected.':esc(storeSettings.deliveryNote || `Cash on delivery is available when ordering is open. Delivery fee: ${formatPrice(storeSettings.shippingFee)}.`)}</p>${storeSettings.returnsNote?`<p>${esc(storeSettings.returnsNote)}</p>`:''}</details></div></div></div>
  <section class="c-related"><div class="c-related-heading"><div><p class="eyebrow">A LITTLE MORE TO LOVE</p><h2>Beautiful <em>together.</em></h2></div><a href="#/shop" class="c-text-button">Discover all ${arrow}</a></div><div class="c-product-grid">${products.filter(item=>item.id!==p.id).sort((a,b)=>Number(b.category===p.category)-Number(a.category===p.category)).slice(0,4).map(productCard).join('')}</div></section></section>`;
}
export function renderWishlist() {
  const saved=products.filter(p=>wishlist.has(p.id));
  return `<section class="c-page c-wishlist-page"><div class="c-page-intro"><p class="eyebrow">THE PIECES YOU LOVE</p><h1>Your <em>wishlist.</em></h1><p>A little collection of things that feel like you. <span class="c-wishlist-count"><span data-wishlist-count>${saved.length}</span> saved.</span></p></div>${unavailableNote()}<div class="c-product-grid" id="c-wishlist-results">${saved.length?saved.map(productCard).join(''):`<div class="c-empty">${heart}<h2>Make room for a little love.</h2><p>Tap the heart on any piece to save it here for later.</p><a class="button c-solid" href="#/shop">Find your favourites ${arrow}</a></div>`}</div></section>`;
}

function updateCounters() {
  document.querySelectorAll('[data-bag-count]').forEach(el=>el.textContent=bag.reduce((total,item)=>total+item.quantity,0));
  document.querySelectorAll('[data-wishlist-count]').forEach(el=>el.textContent=wishlist.size);
  document.querySelectorAll('[data-commerce-action="wishlist"]').forEach(el=>{const saved=wishlist.has(el.dataset.id);el.classList.toggle('is-saved',saved);el.setAttribute('aria-pressed',String(saved));el.setAttribute('aria-label',`${saved?'Remove':'Save'} ${findProduct(el.dataset.id)?.name||'piece'} ${saved?'from':'to'} wishlist`);});
}
function toast(message) {const el=document.getElementById('c-toast');if(!el)return;el.textContent=message;el.classList.add('is-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('is-visible'),4000);}
function openDialog(id,html,stacked=false) {
  if(checkoutBusy)return;
  if(!document.querySelector('.c-dialog[open]'))returnFocus=document.activeElement;
  if(!stacked)document.querySelectorAll('.c-dialog[open]').forEach(dialog=>dialog.close());
  const dialog=document.getElementById(id);dialog.innerHTML=html;dialog.showModal();document.body.classList.add('c-dialog-open');
}
function closeDialogs(){if(!checkoutBusy)document.querySelectorAll('.c-dialog[open]').forEach(dialog=>dialog.close());}
const dialogHeader = (title,id) => `<div class="c-dialog-heading"><h2 id="${id}">${title}</h2><button class="c-close" data-commerce-action="close" aria-label="Close dialog">×</button></div>`;
const bagSubtotal = () => bag.reduce((sum,item)=>sum+(findProduct(item.id)?.price||0)*item.quantity,0);
function bagContents() {
  return `${dialogHeader(`Your bag <span>(${bag.reduce((sum,item)=>sum+item.quantity,0)})</span>`,'c-bag-title')}${bag.length?`<div class="c-bag-items">${bag.map(item=>{const p=findProduct(item.id);if(!p)return '';return `<article class="c-bag-item"><a href="#/product/${encodeURIComponent(p.id)}" data-commerce-action="dialog-link"><img ${imageAttrs(p)} alt="${esc(p.name)}"></a><div><a href="#/product/${encodeURIComponent(p.id)}" data-commerce-action="dialog-link" class="c-bag-name">${esc(p.name)}</a><p>${esc(item.color)} / ${esc(item.size)}</p><span class="c-bag-item-price">${formatPrice(p.price)}</span><div class="c-bag-item-controls"><div class="c-quantity"><button data-commerce-action="bag-minus" data-key="${esc(bagKey(item))}" aria-label="Decrease ${esc(p.name)} quantity">−</button><span>${item.quantity}</span><button data-commerce-action="bag-plus" data-key="${esc(bagKey(item))}" aria-label="Increase ${esc(p.name)} quantity" ${!orderingAvailable()||item.quantity>=Math.min(MAX_QUANTITY,variantStock(p,item.size,item.color))?'disabled':''}>+</button></div><button class="c-text-button" data-commerce-action="bag-remove" data-key="${esc(bagKey(item))}" aria-label="Remove ${esc(p.name)} from bag">Remove</button></div></div></article>`;}).join('')}</div><div class="c-bag-footer"><div class="c-subtotal"><span>Subtotal</span><strong>${formatPrice(bagSubtotal())}</strong></div><p>Delivery: ${storeSettings.shippingFee?formatPrice(storeSettings.shippingFee):'Complimentary'} · Cash on delivery</p><button class="button c-solid" data-commerce-action="checkout" ${!orderingAvailable()?'disabled':''}>Checkout ${bagIcon}</button><span class="c-demo-note">${!orderingAvailable()?'Ordering is unavailable. Your bag stays saved on this device.':storeSettings.demoMode?'Preview mode · Test orders are saved, not fulfilled.':'Prices and availability are checked before placing your order.'}</span><button class="c-continue" data-commerce-action="close">Continue exploring</button></div>`:`<div class="c-empty c-empty-bag">${bagIcon}<h3>A little room for something lovely.</h3><p>Your bag is waiting for its first piece.</p><a href="#/shop" class="button c-solid" data-commerce-action="dialog-link">Explore the collection ${arrow}</a></div>`}`;
}
function openBag(){if(checkoutDraft?.pending){void openCheckout();return;}reconcileBag();openDialog('c-bag-dialog',bagContents());}
function renderBagPreservingFocus(action,key){const dialog=document.getElementById('c-bag-dialog');dialog.innerHTML=bagContents();const next=[...dialog.querySelectorAll(`[data-commerce-action="${action}"]`)].find(el=>el.dataset.key===key&&!el.disabled);(next||dialog.querySelector('.c-close')).focus();}
function searchResults(query) {
  const q=query.trim().toLocaleLowerCase(),matches=q?products.filter(p=>`${p.name} ${p.category} ${p.fabric} ${p.colors.map(c=>c.name).join(' ')}`.toLocaleLowerCase().includes(q)):products.slice(0,4);
  return `<p class="c-search-count">${q?`${matches.length} ${matches.length===1?'piece':'pieces'} found`:'A few pieces to start with'}</p>${matches.length?matches.map(p=>`<a href="#/product/${encodeURIComponent(p.id)}" class="c-search-result" data-commerce-action="dialog-link"><img ${imageAttrs(p)} alt=""><span><strong>${esc(p.name)}</strong><small>${esc(p.subtitle)}</small><span>${formatPrice(p.price)}</span></span>${arrow}</a>`).join(''):`<div class="c-empty"><h3>No matches just yet.</h3><p>Try a name, fabric or collection.</p></div>`}`;
}
function openSearch(){clearTimeout(searchTimer);openDialog('c-search-dialog',`${dialogHeader('Find something <em>you love.</em>','c-search-title')}<label class="c-search-input"><span class="sr-only">Search the collection</span><input id="c-search-field" type="search" placeholder="Search pieces, colours, fabrics…" autocomplete="off" autofocus><span aria-hidden="true">↗</span></label><div class="c-search-results" id="c-search-results" aria-live="polite">${searchResults('')}</div>`);document.getElementById('c-search-field')?.focus();}
function quickSizes(p,color,current='') {return `${p.sizes.length>1?'<option value="">Choose your size</option>':''}${p.sizes.map(size=>{const stock=variantStock(p,size,color)-inBag(p.id,size,color);return `<option value="${esc(size)}" ${stock<1?'disabled':''} ${size===current?'selected':''}>${esc(size)}${stock<1?' — unavailable':''}</option>`;}).join('')}`;}
function openQuickAdd(id,color) {
  const p=findProduct(id);if(!p||!orderingAvailable())return;const chosen=p.colors.some(c=>c.name===color)?color:p.colors[0].name;
  openDialog('c-quick-dialog',`${dialogHeader('Make it yours','c-quick-title')}<div class="c-quick-product"><img ${imageAttrs(p)} alt="${esc(p.name)}"><div><p class="eyebrow">${esc(p.category)}</p><h3>${esc(p.name)}</h3><p>${formatPrice(p.price)}</p></div></div><form id="c-quick-form" data-id="${esc(p.id)}"><label class="c-field-label">Colour<select name="color">${p.colors.map(c=>`<option value="${esc(c.name)}" ${c.name===chosen?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label class="c-field-label">${p.sizes.length===1?'Format':'Select size'}<select name="size" required>${quickSizes(p,chosen)}</select></label><p class="c-form-error" id="c-quick-error" role="alert"></p>${p.sizes.length>1?'<button type="button" class="c-text-button c-quick-guide" data-commerce-action="size-guide">View size guide ↗</button>':''}<button type="submit" class="button c-solid">Add to bag ${bagIcon}</button></form>`);
}
function addToBag(id,size,color,quantity=1) {
  if(checkoutDraft?.pending)return {ok:false,error:'Please open your bag and confirm the previous order attempt before starting another order.'};
  const p=findProduct(id);if(!orderingAvailable()||!p)return {ok:false,error:'Ordering is currently unavailable.'};
  const maximum=Math.min(MAX_QUANTITY,variantStock(p,size,color)),existing=bag.find(item=>bagKey(item)===bagKey({id,size,color}));
  if(!existing&&bag.length>=MAX_BAG_ITEMS)return {ok:false,error:`Your bag can contain up to ${MAX_BAG_ITEMS} different size and colour combinations. Remove a piece before adding another.`};
  if(!Number.isInteger(quantity)||quantity<1||maximum<(existing?.quantity||0)+quantity)return {ok:false,error:maximum?'The requested quantity exceeds the stock available for this size and colour.':'This size and colour is currently sold out.'};
  if(existing)existing.quantity+=quantity;else bag.push({id,size,color,quantity});save();toast(`${p.name} added to your bag`);return {ok:true};
}
function updateDetailStock() {
  const section=document.querySelector('[data-detail-id]');if(!section)return;
  const p=findProduct(section.dataset.detailId),color=document.getElementById('c-selected-color').textContent;if(!p)return;
  document.querySelectorAll('#c-size-choice button').forEach(button=>{button.disabled=storeSettings.available&&!variantStock(p,button.dataset.size,color);if(button.disabled){button.classList.remove('is-active');button.setAttribute('aria-pressed','false');}});
  const size=document.querySelector('#c-size-choice .is-active')?.dataset.size,available=size?Math.max(0,Math.min(MAX_QUANTITY,variantStock(p,size,color))-inBag(p.id,size,color)):0;
  const output=document.getElementById('c-detail-quantity');output.textContent=Math.max(1,Math.min(Number(output.textContent)||1,available||1));
  document.getElementById('c-stock-status').textContent=!orderingAvailable()?'Ordering unavailable':size?(available?`${available} available in ${size} / ${color}`:'This variant is already at its available quantity in your bag.'):'Choose your size to check availability.';
  const add=section.querySelector('[data-commerce-action="add-detail"]');add.disabled=!orderingAvailable()||!productStock(p)||(Boolean(size)&&!available);
  section.querySelector('[data-commerce-action="detail-plus"]').disabled=Boolean(size)&&Number(output.textContent)>=available;
}
function showSizeGuide(){openDialog('c-guide-dialog',`${dialogHeader('Find your fit','c-guide-title')}<p class="c-guide-intro">An illustrative guide in inches. Confirm garment measurements with the store before placing a live order.</p><div class="c-table-wrap"><table><caption class="sr-only">Illustrative body measurements by clothing size, in inches</caption><thead><tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hip</th></tr></thead><tbody>${[['XS',32,26,35],['S',34,28,37],['M',36,30,39],['L',38,32,41],['XL',40,34,43]].map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${cell}</th>`:`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="c-guide-intro">Measure around the fullest part of your bust and hips, and your natural waist.</p><button class="button c-solid" data-commerce-action="close">Back to your piece</button>`,document.getElementById('c-quick-dialog').open);}
function updateShop(){const results=document.getElementById('c-shop-results');if(!results)return;results.innerHTML=shopResults();document.getElementById('c-result-count').textContent=`${matchingProducts().length} pieces`;document.getElementById('c-price-value').textContent=formatPrice(shopState.max);document.querySelector('.c-shop .c-page-intro h1').innerHTML=shopState.category==='All'?'Find your <em>everyday extraordinary.</em>':esc(shopState.category);history.replaceState(null,'',shopState.category==='All'?'#/shop':`#/shop/${encodeURIComponent(shopState.category)}`);}

const checkoutFields = [
  {name:'name',label:'Full name',auto:'name',min:2,max:120},
  {name:'phone',label:'Mobile number',auto:'tel',type:'tel',min:10,max:30,placeholder:'03XX XXXXXXX'},
  {name:'email',label:'Email (optional)',auto:'email',type:'email',optional:true,max:190},
  {name:'address',label:'House, street and area',auto:'street-address',min:8,max:500,wide:true},
  {name:'city',label:'City',auto:'address-level2',min:2,max:100},
  {name:'postalCode',label:'Postal code (optional)',auto:'postal-code',optional:true,max:20},
];
function checkoutSummary(quote) {
  return `<div class="c-checkout-items">${quote.items.map(item=>`<div class="c-checkout-item"><img src="${esc(safeImage(item.image))}" alt=""><div><strong>${esc(item.name)}</strong><small>${esc(item.color)} / ${esc(item.size)} · Qty ${Number(item.quantity)}</small></div><span>${formatPrice(item.lineTotal)}</span></div>`).join('')}</div>${quoteTotals(quote)}`;
}
function quoteTotals(quote){return `<div class="c-checkout-totals"><div><span>Subtotal</span><span>${formatPrice(quote.subtotal)}</span></div><div><span>Delivery</span><span>${quote.shippingFee?formatPrice(quote.shippingFee):'Complimentary'}</span></div><div class="c-checkout-total"><strong>Total</strong><strong>${formatPrice(quote.total)}</strong></div></div>`;}
function renderCheckout(changed=false) {
  const quote=checkoutDraft.quote;
  return `${dialogHeader('The finishing touch.','c-review-title')}<p class="c-checkout-intro">Your details, your beautiful pieces. Complete your order below.</p>${quote.demoMode?'<div class="c-store-notice c-demo-banner"><strong>Test checkout</strong> · This order will be saved in the admin dashboard for testing. No payment or fulfilment takes place. Please use test details.</div>':''}${changed?'<p class="c-store-notice" role="status">Your bag has been updated to match current stock. Please review the quantities and prices below.</p>':''}
  <div class="c-checkout-layout"><form id="c-checkout-form"><fieldset><legend>01 / Delivery details</legend><p class="c-checkout-required">All fields are required unless marked optional.</p><div class="c-checkout-fields">${checkoutFields.map(f=>`<label class="${f.wide?'c-field-wide':''}">${f.label}<input name="${f.name}" type="${f.type||'text'}" autocomplete="${f.auto}" ${f.optional?'':'required'} ${f.min?`minlength="${f.min}"`:''} maxlength="${f.max}" ${f.placeholder?`placeholder="${f.placeholder}"`:''} ${f.name==='phone'?'inputmode="tel"':''}></label>`).join('')}<label class="c-field-wide">Province / region<select name="province" autocomplete="address-level1" required><option value="">Select your province or region</option>${['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad Capital Territory','Azad Jammu and Kashmir','Gilgit-Baltistan'].map(p=>`<option>${p}</option>`).join('')}</select></label><label class="c-field-wide">Order notes (optional)<textarea name="notes" rows="3" maxlength="1200" placeholder="Any delivery instructions for your order"></textarea></label></div></fieldset><fieldset class="c-payment-section"><legend>02 / Payment method</legend><label class="c-payment-option"><input type="radio" name="paymentMethod" value="cod" checked required><span><strong>Cash on delivery</strong><small>${quote.demoMode?'Test order · no payment collected':'Pay the order total when you receive your parcel.'}</small></span>${bagIcon}</label></fieldset><p class="c-form-error c-checkout-error" id="c-checkout-error" role="alert" tabindex="-1"></p><button class="button c-solid c-place-order" type="submit">${quote.demoMode?'Place test order':'Place order'} ${bagIcon}</button><p class="c-checkout-privacy">Your delivery details are stored with your order and used by the store to manage it. No online payment is collected.</p></form><aside class="c-checkout-summary" aria-label="Order summary"><p class="eyebrow">YOUR SELECTION</p><h3>A little something <em>lovely.</em></h3>${checkoutSummary(quote)}<button class="c-text-button" data-commerce-action="open-bag">Edit your bag</button><p class="c-checkout-summary-note">Prices and stock are verified by the store when you place your order.</p></aside></div>`;
}
function expiredCheckout() {
  openDialog('c-review-dialog',`${dialogHeader('Please check your previous order.','c-review-title')}<p class="c-guide-intro">Your shopping session has expired, so we cannot safely retry its unconfirmed order. If you received an order number, use Track order to check it. Otherwise, contact the store to confirm whether it was received before ordering again.</p><button class="button c-solid" data-commerce-action="close">Keep this attempt for now</button><button class="c-text-button c-refresh-checkout" data-commerce-action="discard-checkout">I have checked — start a new checkout</button>`);
}
async function openCheckout() {
  if(checkoutOpening||checkoutBusy||(!bag.length&&!checkoutDraft?.pending))return;
  if(checkoutDraft?.pending){
    checkoutOpening=true;
    try {
      const session=await getSession(true);
      if(!checkoutDraft.checkoutScope||session.checkoutScope!==checkoutDraft.checkoutScope){expiredCheckout();return;}
    } catch(error) {toast(error.message);return;}
    finally {checkoutOpening=false;}
    openDialog('c-review-dialog',renderCheckout());
    const form=document.getElementById('c-checkout-form');
    for(const [name,value] of Object.entries(checkoutDraft.customer||{})){const field=form.elements.namedItem(name);if(field)field.value=value;}
    const message=document.getElementById('c-checkout-error');
    message.textContent='Your previous order attempt has not been confirmed on this device. Retry below to confirm the same order safely. Your original items and total have been kept.';
    return;
  }
  checkoutOpening=true;
  const button=document.querySelector('[data-commerce-action="checkout"]');if(button){button.disabled=true;button.textContent='Checking availability…';}
  try {
    const result=await loadCatalogue();
    if(!result.ok||!orderingAvailable())throw new Error(result.error||'The store is not accepting cash on delivery orders right now.');
    const changed=reconcileBag();
    if(!bag.length){openBag();toast('The pieces in your bag are no longer available. Please choose another piece.');return;}
    if(!globalThis.crypto?.randomUUID)throw new Error('Secure checkout requires HTTPS. Open the store on its secure address.');
    const items=bag.map(item=>({...item})),quote=await apiRequest('orders/quote',{method:'POST',body:{items,paymentMethod:'cod'}});
    if(!Array.isArray(quote.items)||!Number.isFinite(quote.total))throw new Error('Your order total could not be verified. Please try again.');
    const previous=checkoutDraft,sameItems=JSON.stringify(previous?.items)===JSON.stringify(items);
    const session=await getSession();
    checkoutDraft={requestId:sameItems?previous.requestId:crypto.randomUUID(),items,quote,customer:previous?.customer,checkoutScope:session.checkoutScope};
    openDialog('c-review-dialog',renderCheckout(changed));
    if(checkoutDraft.customer){const form=document.getElementById('c-checkout-form');for(const [name,value] of Object.entries(checkoutDraft.customer)){const field=form.elements.namedItem(name);if(field)field.value=value;}}
  } catch(error) {
    openDialog('c-review-dialog',`${dialogHeader('Let’s review your bag.','c-review-title')}<p class="c-guide-intro">${esc(error.message)} Your bag is saved on this device.</p><button class="button c-solid" data-commerce-action="open-bag">Back to your bag ${bagIcon}</button>`);
  } finally {checkoutOpening=false;if(button?.isConnected){button.disabled=!orderingAvailable();button.innerHTML=`Checkout ${bagIcon}`;}}
}
function confirmation(order) {
  const demo=order.demoMode===true;
  return `${dialogHeader(demo?'Your test order is saved.':'Thank you for your order.','c-review-title')}<div class="c-order-confirmation"><span class="c-order-check" aria-hidden="true">✓</span><p class="eyebrow">${demo?'TEST ORDER RECEIVED':'ORDER RECEIVED'}</p><h3>${esc(order.number||order.id)}</h3><p>${demo?'This is a demonstration order saved in the store dashboard. It will not be shipped and no payment will be collected.':'Your order has been recorded. Please keep your order number for reference. Payment is due on delivery.'}</p><div class="c-review-items">${(order.items||[]).map(item=>`<div><span>${esc(item.name||findProduct(item.id)?.name||'Product')}<small>${esc(item.color)} / ${esc(item.size)} · Qty ${Number(item.quantity)||0}</small></span><strong>${formatPrice(item.lineTotal)}</strong></div>`).join('')}</div>${quoteTotals(order)}<p class="c-order-status">Status: ${esc(order.status||'pending')}</p><button class="button c-solid" data-commerce-action="close">Continue exploring ${arrow}</button></div>`;
}
async function submitCheckout(form) {
  if(checkoutBusy||!checkoutDraft)return;
  if(!form.reportValidity())return;
  const errorElement=document.getElementById('c-checkout-error');errorElement.textContent='';
  form.querySelectorAll('[aria-invalid]').forEach(field=>{field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');});
  const customer=Object.fromEntries(checkoutFields.map(({name})=>[name,form.elements.namedItem(name).value.trim()]));
  customer.province=form.elements.province.value;customer.notes=form.elements.notes.value.trim();
  checkoutDraft.customer={...customer};
  const phoneDigits=customer.phone.replace(/\D/g,'');
  if(customer.name.length<2||customer.address.length<8||customer.city.length<2||phoneDigits.length<10||phoneDigits.length>15||!/^[0-9+() .-]+$/.test(customer.phone)){errorElement.textContent='Please enter your full name, a phone number with 10 to 15 digits, and a complete delivery address.';errorElement.focus();return;}
  checkoutDraft.pending=true;persistCheckout();
  checkoutBusy=true;form.setAttribute('aria-busy','true');
  const dialog=form.closest('dialog'),button=form.querySelector('[type="submit"]'),original=button.innerHTML;
  dialog.querySelectorAll('button,input,select,textarea').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});button.textContent='Placing your order…';
  try {
    const session=await getSession(true);
    if(!checkoutDraft.checkoutScope||session.checkoutScope!==checkoutDraft.checkoutScope){checkoutBusy=false;expiredCheckout();return;}
    const data=await apiRequest('orders',{method:'POST',body:{requestId:checkoutDraft.requestId,customer,items:checkoutDraft.items,paymentMethod:'cod',expectedTotal:checkoutDraft.quote.total,expectedDemoMode:checkoutDraft.quote.demoMode,expectedCheckoutScope:checkoutDraft.checkoutScope}});
    if(!data.order?.id||!data.order?.number)throw new Error('The store did not confirm your order. Please retry; your bag has been kept.');
    bag=[];save();checkoutDraft=null;persistCheckout();checkoutBusy=false;
    dialog.innerHTML=confirmation(data.order);dialog.querySelector('.c-close')?.focus();
    await loadCatalogue();updateCounters();updateDetailStock();
  } catch(error) {
    if(error.details?.checkoutScope){checkoutBusy=false;expiredCheckout();return;}
    if(error.status>=400&&error.status<500){checkoutDraft.pending=false;persistCheckout();}
    errorElement.textContent=error.message||'Your order could not be placed. Please try again.';
    if(checkoutDraft?.pending)errorElement.textContent+=' Retry to confirm this same order safely; do not create a new order.';
    for(const key of Object.keys(error.details||{})){const field=form.elements.namedItem(key.replace(/^customer\./,''));if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','c-checkout-error');}}
    if(error.status===409){let refresh=form.querySelector('[data-commerce-action="refresh-checkout"]');if(!refresh){refresh=document.createElement('button');refresh.type='button';refresh.className='c-text-button c-refresh-checkout';refresh.dataset.commerceAction='refresh-checkout';refresh.textContent='Review updated availability and total';errorElement.after(refresh);}}
    errorElement.focus();
  } finally {
    checkoutBusy=false;form.removeAttribute('aria-busy');
    if(form.isConnected){dialog.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;});button.innerHTML=original;}
  }
}

function handleClick(event) {
  const target=event.target.closest('[data-commerce-action]');if(!target||target.disabled)return;
  if(checkoutBusy){event.preventDefault();return;}
  const action=target.dataset.commerceAction,id=target.dataset.id;
  if(action==='discard-checkout'){checkoutDraft=null;persistCheckout();openBag();return;}
  if(checkoutDraft?.pending&&['bag-plus','bag-minus','bag-remove'].includes(action)){void openCheckout();return;}
  if(action==='close')target.closest('.c-dialog')?.close();
  if(action==='dialog-link')closeDialogs();
  if(action==='open-bag')openBag();
  if(action==='open-search')openSearch();
  if(action==='wishlist'){const p=findProduct(id);if(!p)return;wishlist.has(id)?wishlist.delete(id):wishlist.add(id);save();toast(wishlist.has(id)?`${p.name} saved to your wishlist`:`${p.name} removed from your wishlist`);if(document.getElementById('c-wishlist-results')){document.querySelector('.c-wishlist-page').outerHTML=renderWishlist();document.querySelector('.c-wishlist-page [data-commerce-action="wishlist"],.c-wishlist-page .c-empty a')?.focus();}}
  if(action==='card-color'){const card=target.closest('[data-product-card]');card.dataset.selectedColor=target.dataset.color;card.querySelectorAll('.c-swatch').forEach(el=>{el.classList.toggle('is-active',el===target);el.setAttribute('aria-pressed',String(el===target));});card.querySelector('.c-color-name').textContent=target.dataset.color;}
  if(action==='quick-add')openQuickAdd(id,target.closest('[data-product-card]')?.dataset.selectedColor);
  if(action==='size-guide')showSizeGuide();
  if(action==='detail-color'){document.getElementById('c-selected-color').textContent=target.dataset.color;document.querySelectorAll('.c-detail-colors .c-swatch').forEach(el=>{el.classList.toggle('is-active',el===target);el.setAttribute('aria-pressed',String(el===target));});updateDetailStock();}
  if(action==='detail-size'){document.querySelectorAll('#c-size-choice button').forEach(el=>{el.classList.toggle('is-active',el===target);el.setAttribute('aria-pressed',String(el===target));});document.getElementById('c-size-error').textContent='';updateDetailStock();}
  if(action==='detail-minus'||action==='detail-plus'){const output=document.getElementById('c-detail-quantity');output.textContent=Math.max(1,Math.min(MAX_QUANTITY,Number(output.textContent)+(action==='detail-plus'?1:-1)));updateDetailStock();}
  if(action==='add-detail'){const size=document.querySelector('#c-size-choice .is-active')?.dataset.size;if(!size){document.getElementById('c-size-error').textContent='Please choose your size first.';document.querySelector('#c-size-choice button:not(:disabled)')?.focus();return;}const result=addToBag(id,size,document.getElementById('c-selected-color').textContent,Number(document.getElementById('c-detail-quantity').textContent));document.getElementById('c-size-error').textContent=result.error||'';updateDetailStock();}
  if(action==='gallery'){const detail=target.dataset.view==='detail',photo=document.getElementById('c-main-photo'),p=findProduct(target.closest('[data-detail-id]').dataset.detailId),index=Number(target.dataset.imageIndex)||0;photo.src=galleryImages(p)[index]||p.image;photo.classList.toggle('is-cropped',detail);photo.alt=`${p.name} — ${detail?'closer crop of the same photograph':index?`image ${index+1}`:'full view'}`;document.getElementById('c-gallery-caption').textContent=detail?'Closer look · cropped view':index?`View ${index+1}`:'Full view';document.querySelectorAll('.c-gallery-thumbs button').forEach(el=>{el.classList.toggle('is-active',el===target);el.setAttribute('aria-pressed',String(el===target));});}
  if(action==='bag-plus'||action==='bag-minus'||action==='bag-remove'){const key=target.dataset.key,item=bag.find(item=>bagKey(item)===key);if(!item)return;if(action==='bag-remove'||action==='bag-minus'&&item.quantity===1)bag=bag.filter(row=>bagKey(row)!==key);else item.quantity=Math.max(1,Math.min(MAX_QUANTITY,storeSettings.available?variantStock(findProduct(item.id),item.size,item.color):MAX_QUANTITY,item.quantity+(action==='bag-plus'?1:-1)));save();renderBagPreservingFocus(action,key);}
  if(action==='checkout')void openCheckout();
  if(action==='refresh-checkout')void openCheckout();
  if(action==='toggle-filters'){const filter=document.getElementById('c-filters'),isOpen=filter.classList.toggle('is-open');target.setAttribute('aria-expanded',String(isOpen));}
  if(action==='reset-filters'){shopState=initialFilters();document.querySelectorAll('[data-shop-filter]').forEach(el=>el.value=shopState[el.dataset.shopFilter]);updateShop();}
}
export function initCommerce() {
  hydrate();
  if(!initialized){initialized=true;
    const host=document.createElement('div');host.id='c-commerce-host';host.innerHTML=`<dialog class="commerce-dialog c-dialog c-bag-dialog" id="c-bag-dialog" aria-labelledby="c-bag-title"></dialog><dialog class="commerce-dialog c-dialog c-search-dialog" id="c-search-dialog" aria-labelledby="c-search-title"></dialog><dialog class="commerce-dialog c-dialog c-quick-dialog" id="c-quick-dialog" aria-labelledby="c-quick-title"></dialog><dialog class="commerce-dialog c-dialog c-guide-dialog" id="c-guide-dialog" aria-labelledby="c-guide-title"></dialog><dialog class="commerce-dialog c-dialog c-review-dialog c-checkout-dialog" id="c-review-dialog" aria-labelledby="c-review-title"></dialog><div id="c-toast" class="c-toast" role="status" aria-live="polite"></div>`;document.body.appendChild(host);
    document.addEventListener('click',handleClick);
    document.addEventListener('change',event=>{const field=event.target.closest('[data-shop-filter]');if(field){shopState[field.dataset.shopFilter]=field.dataset.shopFilter==='max'?Number(field.value):field.value;updateShop();}const form=event.target.closest('#c-quick-form');if(form&&event.target.name==='color'){const p=findProduct(form.dataset.id);form.elements.size.innerHTML=quickSizes(p,event.target.value);document.getElementById('c-quick-error').textContent='';}});
    document.addEventListener('input',event=>{if(event.target.id==='c-search-field'){clearTimeout(searchTimer);const query=event.target.value;searchTimer=setTimeout(()=>{const results=document.getElementById('c-search-results');if(results)results.innerHTML=searchResults(query);},180);}if(event.target.dataset.shopFilter==='max'){shopState.max=Number(event.target.value);updateShop();}});
    document.addEventListener('submit',event=>{if(event.target.id==='c-quick-form'){event.preventDefault();const form=event.target;if(!form.reportValidity())return;const result=addToBag(form.dataset.id,form.elements.size.value,form.elements.color.value);if(result.ok)closeDialogs();else document.getElementById('c-quick-error').textContent=result.error;}if(event.target.id==='c-checkout-form'){event.preventDefault();void submitCheckout(event.target);}});
    document.querySelectorAll('.c-dialog').forEach(dialog=>{dialog.addEventListener('cancel',event=>{if(checkoutBusy)event.preventDefault();});dialog.addEventListener('click',event=>{if(!checkoutBusy&&event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});dialog.addEventListener('close',()=>{if(!document.querySelector('.c-dialog[open]')){document.body.classList.remove('c-dialog-open');if(returnFocus?.isConnected)returnFocus.focus();}});});
    window.addEventListener('hashchange',()=>{closeDialogs();requestAnimationFrame(updateCounters);});
  }
  updateCounters();return {openSearch,openBag,refresh:()=>{reconcileBag();updateDetailStock();}};
}
