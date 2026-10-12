import { products } from './catalogue.js';
import { productCard, renderShop, renderProduct, renderWishlist, initCommerce } from './commerce.js';

const flower = (className = '') => `<img class="${className}" src="./assets/flower.svg" alt="" width="100" height="100">`;
const arrow = '<span aria-hidden="true">↗</span>';
const page = document.querySelector('#page-content');
const commerce = initCommerce();
let revealObserver;

function homePage() {
  return `
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy"><div class="hero-kicker"><span class="eyebrow">THE BLOOM EDIT</span><span class="edition-mark">VOL. 01 / 2026</span></div><h1 id="hero-title">Wear your<br>own <em>story.</em></h1><p>For the everyday. For the extraordinary.<br>For every version of you.</p><a class="button coral-button" href="#/shop">Explore the Collection ${arrow}</a><div class="hero-bottom"><span class="eyebrow">ROOTED IN CRAFT. MADE FOR YOU.</span><a href="#expression" class="scroll-cue" aria-label="Scroll to collections">↓</a></div></div>
    <div class="hero-visual"><img class="hero-photo" src="./assets/hero.webp" alt="Woman in a flowing coral embroidered Pakistani ensemble in sunlit ivory architecture" width="1024" height="1536" fetchpriority="high"><span class="campaign-caption">IN FULL BLOOM</span><span class="image-index">01 — 03</span><a class="hero-detail" href="#/product/meher-bloom"><img src="./assets/textile.webp" alt="A closer look at coral floral embroidery" width="600" height="700"><span>Beauty is in the details ${arrow}</span></a></div>
    ${flower('hero-flower')}
  </section>
  <div class="brand-strip"><span>CONTEMPORARY SILHOUETTES</span>${flower()}<span>COLOUR WITH CHARACTER</span>${flower()}<span>DETAILS TO FALL FOR</span>${flower()}<span>A WARDROBE IN BLOOM</span></div>
  <section class="expression section-space" id="expression" aria-labelledby="expression-title"><div class="section-heading reveal"><div><span class="eyebrow">DIFFERENT MOODS. ALWAYS YOU.</span><h2 id="expression-title">Find your <em>expression.</em></h2></div><p>A little soft. A little bold.<br>A whole lot of you.</p></div>
    <div class="collection-grid">
      <a href="#/shop/Ready%20to%20Wear" class="collection-card collection-everyday reveal"><div class="collection-image"><img src="./assets/everyday.webp" alt="An ivory Pakistani outfit in soft architectural light" width="1024" height="1536" loading="lazy"><span class="collection-number">01</span></div><div class="collection-label"><div><span class="eyebrow">EFFORTLESS, BY NATURE</span><h3>Everyday</h3></div><span class="circle-arrow">↗</span></div></a>
      <a href="#/shop/Unstitched" class="collection-card collection-unstitched reveal"><div class="collection-image"><img src="./assets/unstitched.webp" alt="Soft folds of coral, blush and ivory embroidered fabric" width="1024" height="1536" loading="lazy"><span class="collection-number">02</span></div><div class="collection-label"><div><span class="eyebrow">A CANVAS FOR YOUR CREATIVITY</span><h3>Unstitched</h3></div><span class="circle-arrow">↗</span></div><span class="collection-footnote">Your imagination. Beautifully woven.</span></a>
      <a href="#/shop/Festive" class="collection-card collection-occasion reveal"><div class="collection-image"><img src="./assets/occasion.webp" alt="A black embroidered occasion ensemble with delicate gold details" width="1024" height="1536" loading="lazy"><span class="collection-number">03</span></div><div class="collection-label"><div><span class="eyebrow">FOR MOMENTS THAT MATTER</span><h3>Occasion</h3></div><span class="circle-arrow">↗</span></div></a>
    </div>
  </section>
  <section class="arrivals section-space" aria-labelledby="arrivals-title"><div class="section-heading reveal"><div><span class="eyebrow">FRESH PERSPECTIVES</span><h2 id="arrivals-title">The latest <em>chapter.</em></h2></div><a class="text-link" href="#/shop">Discover all new arrivals ${arrow}</a></div><div class="home-products">${products.slice(0, 4).map(productCard).join('')}</div><p class="catalogue-note">An imagined collection. Explore our demonstration pieces.</p></section>
  <section class="editorial section-space" id="editorial" aria-labelledby="editorial-title"><div class="editorial-intro reveal"><span class="eyebrow">THE RAHMEEN NOTEBOOK / NO. 01</span><h2 id="editorial-title">The art of<br>getting <em>dressed.</em></h2><p>A silhouette that moves with you. A colour that feels like you. Sometimes, the smallest detail tells the most beautiful story.</p><a class="text-link" href="#/story">Inside our world ${arrow}</a>${flower('editorial-flower')}</div><div class="editorial-collage"><div class="editorial-main reveal"><img src="./assets/sage.webp" alt="A softly sculpted sage outfit with a flowing dupatta" width="1024" height="1536" loading="lazy"><span class="vertical-caption">01 / THE LANGUAGE OF SILHOUETTE</span></div><div class="editorial-detail reveal"><img src="./assets/textile.webp" alt="Fine floral stitching across a sunlit coral textile" width="700" height="700" loading="lazy"><span>02 / A CLOSER FEELING</span></div><span class="editorial-handwritten">Made of little things.</span></div></section>
  <section class="bloom-interlude" aria-label="Colour in full bloom"><div class="bloom-mask"><img src="./assets/hero.webp" alt="Coral fabric, expressive movement and warm afternoon light" width="1536" height="1024" loading="lazy"></div><div class="bloom-words"><span class="eyebrow">COLOUR OUTSIDE THE LINES.</span><p>Come into <em>bloom.</em></p></div></section>
  <section class="shop-look section-space" aria-labelledby="look-title"><div class="look-image reveal"><img src="./assets/hero.webp" alt="The complete Meher coral look with an embroidered kurta and sheer dupatta" width="1024" height="1536" loading="lazy"><button class="look-hotspot hotspot-one" data-look="meher-bloom" aria-label="Shop the coral embroidered ensemble"><span>+</span></button><button class="look-hotspot hotspot-two" data-look="petal-dupatta" aria-label="Shop the coral dupatta"><span>+</span></button><span class="look-hint">TAP A DETAIL. MAKE IT YOURS.</span></div><div class="look-copy reveal"><span class="eyebrow">AN OUTFIT. ENDLESS POSSIBILITIES.</span><h2 id="look-title">One look.<br><em>Your way.</em></h2><p>Light layers. Thoughtful details.<br>A little room for your own signature.</p><div id="look-selection" aria-live="polite"></div><a href="#/shop" class="text-link">Meet the whole collection ${arrow}</a></div></section>
  <section class="story-note section-space reveal" id="our-story">${flower('story-flower')}<span class="eyebrow">A NOTE FROM RAHMEEN</span><h2>Clothes are the beginning.<br><em>You are the story.</em></h2><p>Contemporary Pakistani expression, seen through a softer lens. We imagine a wardrobe where craft meets colour, familiar silhouettes find new energy, and getting dressed feels a little more like you.</p><a href="#/story" class="text-link">Get to know us ${arrow}</a></section>`;
}

const info = {
  contact: ['Let’s stay close.', 'The RAHMEEN contact and social channels will be added when the store launches. This preview does not connect to customer support or official social accounts. In the meantime, discover the collection and save the pieces you love.'],
  shipping: ['Good things take care.', 'This storefront is an interactive demonstration. Checkout, shipping and returns are not yet available. Delivery regions, charges, dispatch times and the final return policy will be published before orders open.'],
  care: ['Love your clothes longer.', 'Use the garment’s sewn-in care label as your first guide. As a general starting point, wash similar colours separately, avoid prolonged direct sunlight when drying, and use a pressing cloth around embroidery. The fabric and care notes on these demonstration products are illustrative and must be confirmed against real stock.'],
  'about-preview': ['A wardrobe, imagined.', 'This is an editable RAHMEEN storefront demonstration. Product names, pricing, fabric details and size measurements are sample data. Campaign and product visuals are AI-generated concepts, not photographs of available inventory. The original RAHMEEN logo is displayed unchanged; the supporting flower graphics are inspired by its petals. Bag and wishlist are saved on your device. No payments, orders or email subscriptions are processed.'],
  'size-guide': ['Find your fit.', 'Our demonstration size guide uses body measurements in inches. XS: bust 32, S: 34, M: 36, L: 38, XL: 40. Measurements are illustrative; a verified size chart must be supplied for each real garment before ordering is enabled. Open any product’s size guide for the complete chart.']
};

function renderStory() { return `<section class="story-page section-space"><span class="eyebrow">THE WORLD OF RAHMEEN</span><h1>Rooted in expression.<br><em>Always becoming.</em></h1><div class="story-page-grid"><img src="./assets/unstitched.webp" width="1024" height="1536" alt="Softly folded embroidered textiles in the RAHMEEN palette"><div><span class="eyebrow">A WARDROBE IN BLOOM</span><h2>Clothes are the beginning.<br>You are the story.</h2><p>There is a kind of beauty that feels instinctive. The colour you reach for. The fabric you keep coming back to. A silhouette that feels entirely your own.</p><p>That is the world we imagine for RAHMEEN: an expressive conversation between contemporary Pakistani dressing and the everyday art of being yourself.</p><p>Softness and strength. Familiarity and possibility. A wardrobe with room to grow.</p><a class="button coral-button" href="#/shop">Find your expression ↗</a></div></div></section>`; }

function renderLook(id = 'meher-bloom') {
  const target = document.querySelector('#look-selection');
  if (!target) return;
  const p = products.find(p => p.id === id) || products[0];
  target.innerHTML = `<a class="look-product" href="#/product/${p.id}"><img src="${p.image}" alt="${p.name}" width="100" height="120" loading="lazy"><div><span class="eyebrow">THE BLOOM EDIT</span><h3>${p.name}</h3><span>PKR ${p.price.toLocaleString('en-PK')}</span></div><span class="circle-arrow">↗</span></a>`;
  document.querySelectorAll('[data-look]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.look === id)));
}

function setupReveals() {
  revealObserver?.disconnect();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: 0.09 });
  document.querySelectorAll('.reveal, .footer-flower').forEach(el => revealObserver.observe(el));
}

function route(focusPage = false) {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(p => { try { return decodeURIComponent(p); } catch { return ''; } });
  const type = parts[0];
  const collectionAnchor = location.hash === '#expression';
  if (type === 'shop') page.innerHTML = renderShop(parts[1] || 'All');
  else if (type === 'product') page.innerHTML = renderProduct(parts[1]);
  else if (type === 'wishlist') page.innerHTML = renderWishlist();
  else if (type === 'story') page.innerHTML = renderStory();
  else if (type === 'info') { const entry = info[parts[1]] || info['about-preview']; page.innerHTML = `<section class="info-page section-space"><span class="eyebrow">THE THOUGHTFUL DETAILS</span><h1>${entry[0]}</h1><p>${entry[1]}</p><a class="button coral-button" href="#/shop">Explore the collection ↗</a></section>`; }
  else page.innerHTML = homePage();
  const titles = {shop:'The collection',product:'The details',wishlist:'Your wishlist',story:'Our story',info:'The thoughtful details'};
  document.title = `${type === 'product' ? (products.find(p=>p.id===parts[1])?.name || 'The details') : titles[type] || 'A wardrobe in bloom'} — RAHMEEN`;
  document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === (type === 'wishlist' ? 'wishlist' : ['shop','product'].includes(type) ? 'shop' : !type ? 'home' : ''); el.classList.toggle('active',active); if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  if (document.querySelector('#menu-dialog').open) document.querySelector('#menu-dialog').close();
  commerce.refresh();
  renderLook();
  setupReveals();
  window.scrollTo({top:0,behavior:'instant'});
  if (focusPage) page.focus({preventScroll:true});
  if(collectionAnchor) document.querySelector('#expression')?.scrollIntoView({behavior:'instant'});
}

document.addEventListener('click', event => {
  if(event.target.closest('.skip-link')) { event.preventDefault(); page.focus(); page.scrollIntoView({behavior:'instant'}); return; }
  if(event.target.closest('.scroll-cue')) { event.preventDefault(); document.querySelector('#expression')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}); return; }
  if (event.target.closest('[data-open-menu]')) document.querySelector('#menu-dialog').showModal();
  if (event.target.closest('[data-close-menu]')) document.querySelector('#menu-dialog').close();
  if (event.target.closest('[data-open-search]')) commerce.openSearch();
  if (event.target.closest('[data-open-bag]')) commerce.openBag();
  const hotspot = event.target.closest('[data-look]');
  if (hotspot) renderLook(hotspot.dataset.look);
  const menuLink = event.target.closest('#menu-dialog a');
  if (menuLink) document.querySelector('#menu-dialog').close();
});
document.querySelector('#menu-dialog').addEventListener('click', e => { if(e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close(); }});
document.querySelector('#newsletter-form').addEventListener('submit', event => { event.preventDefault(); const field=document.querySelector('#newsletter-email'); if(!field.checkValidity())return field.reportValidity(); document.querySelector('#newsletter-status').textContent = 'Thank you. This is a preview; you have not been added to a mailing list.'; field.value=''; });
let scrollPending = false;
window.addEventListener('scroll', () => { if(scrollPending)return; scrollPending=true; requestAnimationFrame(() => { const y=scrollY; document.querySelector('#site-header').classList.toggle('compact',y>60); if(!matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches) { const hero=document.querySelector('.hero'); if(hero && y<900) { hero.style.setProperty('--hero-shift',`${Math.min(y*.1,65)}px`); hero.style.setProperty('--detail-shift',`${Math.min(y*.05,32)}px`); } const bloom=document.querySelector('.bloom-interlude'); if(bloom) { const rect=bloom.getBoundingClientRect(); const progress=Math.max(0,Math.min(1,(innerHeight-rect.top)/(innerHeight*.9))); bloom.style.setProperty('--mask-size',`${85+progress*565}%`); } const detail=document.querySelector('.editorial-detail'); if(detail) { const r=detail.getBoundingClientRect(); detail.style.setProperty('--fabric-shift',`${Math.max(-20,Math.min(20,(innerHeight/2-r.top)*.06))}px`); } } scrollPending=false; }); }, {passive:true});
matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',setupReveals);
window.addEventListener('hashchange',()=>route(true));
const footerBreakpoint = matchMedia('(max-width:760px)');
const updateFooter = () => document.querySelectorAll('.footer-links').forEach(el=>el.open=!footerBreakpoint.matches);
footerBreakpoint.addEventListener('change',updateFooter);
updateFooter();
route();



