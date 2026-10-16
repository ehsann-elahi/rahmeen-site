const CATEGORIES = ['Ready to Wear', 'Unstitched', 'Festive'];
const ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const MAX_OPTIONS = 20, MAX_VARIANTS = 200;
const app = document.getElementById('admin-app');
const orderDialog = document.getElementById('order-dialog');
const state = { session: null, products: [], orders: [], settings: null, route: '', category: '', productSearch: '', productStatus: '', orderSearch: '', orderStatus: '', editor: null, dirty: false, lastHash: '', routeToken: 0, busy: false };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => `PKR ${Number(value || 0).toLocaleString('en-PK', {maximumFractionDigits: 2})}`;
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const date = value => value ? new Date(value).toLocaleDateString('en-PK', {day:'numeric', month:'short', year:'numeric'}) : '—';
const stock = product => (product.variants || []).reduce((total, variant) => total + numeric(variant.stock), 0);
const hex = value => /^#[\da-f]{6}$/i.test(value || '') ? value : '#c5c5b5';
const paths = {
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  box:'<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5.8l9 5"/>',
  bag:'<path d="M5 7h14l2 14H3zM8 8V6a4 4 0 0 1 8 0v2"/>',
  settings:'<path d="m9 3-.5 3-2 1.2L3.7 6l-2 3.5L4 11v2l-2.3 1.5 2 3.5 2.8-1.2 2 1.2.5 3h4l.5-3 2-1.2 2.8 1.2 2-3.5L18 13v-2l2.3-1.5-2-3.5-2.8 1.2-2-1.2L13 3z"/><circle cx="11" cy="12" r="3"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external:'<path d="M14 3h7v7m-1-6L10 14M10 3H3v18h18v-7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  edit:'<path d="m15 3 6 6-12 12H3v-6zM12 6l6 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  revenue:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  flower:'<path d="M12 9C5-3 0 8 9 12c-12 7-1 12 3 3 7 12 12 1 3-3C27 5 16 0 12 9Z"/>',
  layers:'<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>',
  fabric:'<path d="M5 3h14v18H5zM5 7h14M5 12h14M5 17h14M9 3v18M15 3v18"/>',
  logout:'<path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.box}</svg>`;
const badge = status => `<span class="badge ${esc(ORDER_STATUSES.includes(status) || ['active','draft','archived','paid','unpaid','refunded','demo'].includes(status) ? status : '')}">${esc(status || 'pending')}</span>`;
const imageUrl = url => {
  const value = String(url || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(?:\.\/)?(?:assets|uploads)\//.test(value)) return `../${value.replace(/^\.\//, '')}`;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return '';
};
const thumbnail = (product, className = 'product-thumb') => imageUrl(product.image) ? `<img class="${className}" src="${esc(imageUrl(product.image))}" alt="" loading="lazy">` : `<span class="${className}" aria-hidden="true"></span>`;
const button = (label, attributes = '', style = '', symbol = '') => `<button type="button" class="button ${style}" ${attributes}>${symbol ? icon(symbol) : ''}${label}</button>`;
const empty = (title, description, action = '', symbol = 'box') => `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h3>${title}</h3><p>${description}</p>${action}</div>`;
const loading = (label = 'Loading your store…') => `<div class="loading-block"><span class="spinner" aria-hidden="true"></span>${label}</div>`;
const options = (values, selected) => values.map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value.charAt(0).toUpperCase() + value.slice(1))}</option>`).join('');
const notice = (message, type = '') => `<div class="notice ${type}">${icon('info')}<p>${message}</p></div>`;

async function api(route, method = 'GET', body, retried = false) {
  const headers = {Accept: 'application/json'};
  if (method !== 'GET') headers['X-CSRF-Token'] = state.session?.csrf || '';
  const multipart = body instanceof FormData;
  if (body && !multipart) headers['Content-Type'] = 'application/json';
  let response;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),45000);
  try {
    response = await fetch(`../api/index.php?route=${encodeURIComponent(route)}`, {method, credentials:'same-origin', headers, cache:'no-store', signal:controller.signal, body:body ? (multipart ? body : JSON.stringify(body)) : undefined});
  } catch (error) {
    throw new Error(error.name === 'AbortError' ? 'The request timed out. Reload this view to check whether the change was saved before retrying.' : 'The store server could not be reached. Check your connection and try again.');
  } finally {clearTimeout(timeout);}
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error('The store API is not running here. Open the admin using the PHP server, or your configured Hostinger domain.');
  const data = await response.json().catch(() => null);
  if (!data) throw new Error('The server returned an incomplete response. Reload this view to check the latest saved details.');
  if (!response.ok) {
    if (response.status === 403 && !retried && method !== 'GET') {
      const previous = state.session?.csrf;
      state.session = await api('session');
      if (route.startsWith('admin/') && !state.session.authenticated) {
        state.dirty = false; orderDialog.close(); renderAuth('Your session has expired. Sign in again to continue.');
        throw new Error('Your session has expired. Sign in again to continue.');
      }
      if (state.session.csrf && state.session.csrf !== previous) return api(route,method,body,true);
    }
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.fields = data.fields;
    error.status = response.status;
    if (response.status === 401 && route !== 'login' && state.session?.authenticated) {
      state.session.authenticated = false;
      state.dirty = false;
      orderDialog.close();
      orderDialog.innerHTML = '';
      renderAuth('Your session has expired. Sign in again to continue.');
    }
    throw error;
  }
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.className = `toast visible${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {element.className = 'toast';}, 4500);
}

function fieldError(target, error) {
  target.innerHTML = `<p class="inline-error" role="alert">${esc(error.message)}</p>${error.fields ? `<ul class="inline-error">${Object.entries(error.fields).map(([key,value]) => `<li>${esc(key)}: ${esc(Array.isArray(value) ? value.join(', ') : value)}</li>`).join('')}</ul>` : ''}`;
}

function renderAuth(message = '') {
  const setup = state.session?.setupRequired;
  app.innerHTML = `<main class="auth-page" id="main-content"><div class="auth-brand-side"><div class="auth-wordmark">RAHMEEN</div><h1>A little care.<br>A beautiful business.</h1><p>Your collections, your customers, your next chapter. Everything you need to look after your store, in one considered space.</p><div class="auth-privacy">PRIVATE STORE WORKSPACE · PAKISTAN / PKR</div><img class="auth-flower" src="../assets/flower.svg" alt=""></div><div class="auth-form-side"><form id="auth-form" class="auth-form"><div class="eyebrow">The RAHMEEN workspace</div><h2>${setup ? 'Make yourself at home.' : 'Welcome back.'}</h2><p>${setup ? 'Create the first store owner account. Local setup is available only on this computer.' : 'Sign in to manage your collections and orders.'}</p>${message ? notice(esc(message), 'error') : ''}${setup ? `<label class="field"><span>Your name</span><input name="name" autocomplete="name" required maxlength="100" placeholder="Store owner"></label>` : ''}<label class="field"><span>Email address</span><input type="email" name="email" autocomplete="username" required maxlength="254" placeholder="you@example.com"></label><label class="field"><span>Password</span><input type="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}" ${setup ? 'minlength="12"' : ''} required maxlength="200" placeholder="${setup ? 'At least 12 characters' : 'Enter your password'}">${setup ? '<small>Use a unique password with at least 12 characters.</small>' : ''}</label>${setup ? `<label class="field"><span>Confirm password</span><input type="password" name="confirmPassword" autocomplete="new-password" minlength="12" maxlength="200" required placeholder="Enter your password again"></label>` : ''}<div id="auth-error"></div><button class="button primary" type="submit">${setup ? 'Create owner account' : 'Sign in'} ${icon('arrow')}</button><p class="auth-footer"><a href="../">Back to the storefront</a>${setup ? '' : '<br>Need access? Ask the store owner to configure your account.'}</p></form></div></main>`;
}

function renderShell(title) {
  const admin = state.session.admin || {};
  const active = page => state.route === page ? 'active' : '';
  app.innerHTML = `<div class="admin-shell"><button type="button" class="mobile-scrim" aria-label="Close navigation" data-close-menu></button><aside class="sidebar" aria-label="Store navigation"><a class="brand-lockup" href="#/overview"><span class="brand-mark"><img src="../assets/logo.png" alt=""></span><div><div class="brand-word">RAHMEEN</div><small>STORE WORKSPACE</small></div></a><div class="nav-caption">Your store</div><nav><a href="#/overview" class="nav-item ${active('overview')}">${icon('home')}Overview</a><a href="#/orders" class="nav-item ${active('orders')}">${icon('bag')}Orders</a><a href="#/products" class="nav-item ${state.route === 'products' && !state.category ? 'active' : ''}">${icon('box')}All products</a>${CATEGORIES.map(category => `<a class="nav-item category ${state.category === category ? 'active' : ''}" href="#/products/category/${encodeURIComponent(category)}"><span class="nav-dot"></span>${category}</a>`).join('')}<div class="nav-caption">Preferences</div><a href="#/settings" class="nav-item ${active('settings')}">${icon('settings')}Store settings</a></nav><div class="sidebar-bottom"><a class="store-link" href="../" target="_blank" rel="noopener">View your store ${icon('external')}</a><p class="sidebar-note">A wardrobe in bloom.<br>A business in your hands.</p></div></aside><div class="admin-main"><header class="topbar"><button class="mobile-menu" type="button" data-toggle-menu aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button><div class="breadcrumb"><span>Workspace</span><span>/</span><strong>${esc(title)}</strong></div><div class="account"><span class="account-avatar">${esc((admin.name || admin.email || 'R').charAt(0).toUpperCase())}</span><div class="account-label">${esc(admin.name || 'Store owner')}<small>Store owner</small></div><button class="signout" type="button" data-logout>Sign out</button></div></header><main class="workspace" id="main-content" tabindex="-1">${loading()}</main></div></div>`;
}

const heading = (eyebrow, title, description, action = '') => `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
const addProductButton = category => `<a class="button primary" href="#/products/new${category ? `?category=${encodeURIComponent(category)}` : ''}">${icon('plus')}Add product</a>`;

async function showOverview(token) {
  const [{stats = {}, recentOrders = [], lowStockProducts = []}, {products = []}, {settings = {}}] = await Promise.all([api('admin/dashboard'), api('admin/products'), api('admin/settings')]);
  if (token !== state.routeToken) return;
  state.products = products; state.settings = settings;
  const metrics = [
    ['Revenue', money(stats.revenue), 'Paid orders, excluding cancellations', 'revenue'],
    ['Total orders', numeric(stats.orders), 'All orders received by your store', 'bag'],
    ['Awaiting attention', numeric(stats.pendingOrders), 'Pending, confirmed or packed orders', 'clock'],
    ['Active products', numeric(stats.activeProducts), 'Published in your collections', 'box']
  ];
  main().innerHTML = `${heading('A little care. Every day.', 'Your store, at a glance.', 'A clear view of what is growing, and what needs you next.', addProductButton())}${settings.demoMode ? notice('Test mode is on. Orders are marked as tests. Turn off test mode in Store settings when you are ready to accept real orders.') : ''}<div class="welcome-banner"><div><h2>Good things are taking shape.</h2><p>Your three collections. Beautifully organized, ready for their next chapter.</p></div><img class="welcome-bloom" src="../assets/flower.svg" alt=""></div><div class="stats-grid">${metrics.map(([title,value,note,symbol]) => `<div class="card stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon(symbol)}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`).join('')}</div>${categoryCards()}<div class="dashboard-grid"><section class="card"><div class="card-heading"><div><h2>Recent orders</h2><p>A little attention goes a long way.</p></div><a class="text-button" href="#/orders">View all ${icon('arrow')}</a></div>${recentOrders.length ? orderTable(recentOrders.slice(0,6), true) : empty('Your first order starts here.', 'New customer orders will appear here with all the details you need.', '<a class="button small" href="../" target="_blank" rel="noopener">Visit your store</a>', 'bag')}</section><div><section class="card"><div class="card-heading"><div><h2>Keep an eye on stock</h2><p>${numeric(stats.lowStock)} variants running low</p></div>${icon('box')}</div>${lowStockProducts.length ? lowStockProducts.slice(0,5).map(product => `<a class="low-stock-item" href="#/products/${encodeURIComponent(product.id)}">${thumbnail(product)}<div><h3>${esc(product.name)}</h3><small>${esc(product.color || product.category)}${product.size ? ` / ${esc(product.size)}` : ''}</small></div><div class="stock-number">${numeric(product.totalStock ?? product.stock ?? stock(product))}<small>units left</small></div></a>`).join('') : empty('All caught up.', 'Low stock products will appear here so you can replenish them in time.', '', 'check')}</section><div class="card intro-card">${icon('flower')}<h3>Three collections. One point of view.</h3><p>Ready to Wear, Unstitched, and Festive — the heart of your store. Add and arrange products within each collection.</p><a class="text-button" href="#/products">Manage your collections →</a></div></div></div>`;
}

function categoryCards() {
  return `<div class="category-summary">${CATEGORIES.map((category,index) => {
    const products = state.products.filter(product => product.category === category && product.status !== 'archived');
    return `<a class="category-card ${state.category === category ? 'selected' : ''}" href="#/products/category/${encodeURIComponent(category)}"><span class="category-symbol">${icon(['layers','fabric','flower'][index])}</span><div><h3>${category}</h3><small>${products.length} products · ${products.filter(product => product.status === 'active').length} active</small></div>${icon('arrow')}</a>`;
  }).join('')}</div>`;
}

async function showProducts(token) {
  const {products = []} = await api('admin/products');
  if (token !== state.routeToken) return;
  state.products = products;
  main().innerHTML = `${heading('Collections & catalogue', esc(state.category || 'Your products.'), state.category ? 'Every piece in this collection, thoughtfully managed.' : 'Build your collections. Give every piece a place to belong.', addProductButton(state.category))}${categoryCards()}<section class="card"><div class="toolbar"><label class="search-field">${icon('search')}<span class="screen-reader">Search products</span><input type="search" id="product-search" placeholder="Search by name or SKU" value="${esc(state.productSearch)}"></label>${!state.category ? `<label><span class="screen-reader">Filter category</span><select id="product-category"><option value="">All categories</option>${options(CATEGORIES,'')}</select></label>` : ''}<label><span class="screen-reader">Filter product status</span><select id="product-status"><option value="">All statuses</option>${options(['active','draft','archived'],state.productStatus)}</select></label></div><div id="product-results"></div></section>`;
  renderProductResults();
}

function renderProductResults() {
  const target = document.getElementById('product-results');
  if (!target) return;
  const category = state.category || document.getElementById('product-category')?.value || '';
  const query = state.productSearch.toLowerCase().trim();
  const products = state.products.filter(product => (!category || category === product.category) && (!state.productStatus || product.status === state.productStatus) && (!query || [product.name, product.sku, product.fabric, ...(product.variants || []).map(variant => variant.sku)].join(' ').toLowerCase().includes(query)));
  target.innerHTML = products.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Inventory</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col"><span class="screen-reader">Edit product</span></th></tr></thead><tbody>${products.map(product => `<tr><td><a class="product-cell" href="#/products/${encodeURIComponent(product.id)}">${thumbnail(product)}<div><strong>${esc(product.name)}</strong><small>${esc(product.sku || product.subtitle || 'No SKU assigned')}</small></div></a></td><td>${badge(product.status)}</td><td><span class="${stock(product) < 6 ? 'danger-text' : ''}">${stock(product)} in stock</span><br><small>${(product.variants || []).length} variants</small></td><td>${esc(product.category)}</td><td>${money(product.price)}</td><td><a class="button small ghost" href="#/products/${encodeURIComponent(product.id)}" aria-label="Edit ${esc(product.name)}">${icon('edit')}Edit</a></td></tr>`).join('')}</tbody></table></div><div class="table-footer">${products.length} ${products.length === 1 ? 'product' : 'products'}${query || state.productStatus ? ' matching your filters' : ' in this view'} · Prices in PKR</div>` : empty('No products found.', query || state.productStatus ? 'Try a different search or status filter.' : 'Add your first piece to this collection.', addProductButton(state.category));
}

function orderTable(orders, compact = false) {
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Status</th>${compact ? '' : '<th scope="col">Payment</th>'}<th scope="col">Total</th>${compact ? '' : '<th scope="col">Date</th>'}</tr></thead><tbody>${orders.map(order => `<tr><td><button type="button" class="text-button order-number" data-order="${esc(order.id)}">${esc(order.number || order.id)}</button>${order.demoMode ? '<br><span class="badge demo">Test</span>' : ''}</td><td>${esc(order.customer?.name || 'Customer')}<br><small>${esc(compact ? date(order.createdAt) : (order.customer?.city || ''))}</small></td><td>${badge(order.status)}</td>${compact ? '' : `<td>${badge(order.paymentStatus || 'unpaid')}<br><small>Cash on delivery</small></td>`}<td>${money(order.total)}</td>${compact ? '' : `<td>${esc(date(order.createdAt))}</td>`}</tr>`).join('')}</tbody></table></div>`;
}

async function showOrders(token) {
  const {orders = []} = await api('admin/orders');
  if (token !== state.routeToken) return;
  state.orders = orders;
  main().innerHTML = `${heading('Customer care', 'Every order matters.', 'From the first click to the doorstep. Keep every detail in view.', button('Refresh','data-refresh','','clock'))}<section class="card"><div class="toolbar"><label class="search-field">${icon('search')}<span class="screen-reader">Search orders</span><input id="order-search" type="search" placeholder="Search order, customer or phone" value="${esc(state.orderSearch)}"></label><label><span class="screen-reader">Filter order status</span><select id="order-status"><option value="">All statuses</option>${options(ORDER_STATUSES,state.orderStatus)}</select></label></div><div id="order-results"></div></section>`;
  renderOrderResults();
}

function renderOrderResults() {
  const query = state.orderSearch.toLowerCase().trim();
  const orders = state.orders.filter(order => (!state.orderStatus || state.orderStatus === order.status) && (!query || [order.number,order.id,order.customer?.name,order.customer?.email,order.customer?.phone,order.customer?.city].join(' ').toLowerCase().includes(query)));
  document.getElementById('order-results').innerHTML = orders.length ? `${orderTable(orders)}<div class="table-footer">${orders.length} ${orders.length === 1 ? 'order' : 'orders'} · Open an order to view details and update fulfilment</div>` : empty('A little quiet, for now.', query || state.orderStatus ? 'No orders match these filters. Try a different search.' : 'Your customer orders will appear here, ready for you to take care of.', '', 'bag');
}

async function openOrder(id) {
  orderDialog.innerHTML = `<div class="drawer-header"><h2 id="order-detail-title">Order details</h2>${button('','data-close-order','ghost','close')}</div>${loading('Loading order…')}`;
  orderDialog.querySelector('[data-close-order]').setAttribute('aria-label','Close order details');
  if (!orderDialog.open) orderDialog.showModal();
  try {
    const {order} = await api(`admin/orders/${encodeURIComponent(id)}`);
    renderOrderDetail(order);
  } catch (error) {
    orderDialog.innerHTML = `<div class="drawer-header"><h2 id="order-detail-title">Order details</h2><button type="button" class="icon-button" data-close-order aria-label="Close order details">${icon('close')}</button></div><div class="drawer-body">${notice(esc(error.message),'error')}</div>`;
  }
}

function renderOrderDetail(order) {
  const customer = order.customer || {};
  orderDialog.innerHTML = `<div class="drawer-header"><div><div class="eyebrow">Order details</div><h2 id="order-detail-title">${esc(order.number || order.id)}</h2><small>Placed ${esc(date(order.createdAt))} · ${esc(order.items?.length || 0)} items</small></div><button class="icon-button" type="button" data-close-order aria-label="Close order details">${icon('close')}</button></div><div class="drawer-body">${order.demoMode ? notice('This is a test order. It is labelled as a demonstration and must not be fulfilled.') : ''}<section class="card"><div class="card-heading"><h2>Items in this order</h2>${badge(order.status)}</div><div class="card-body">${(order.items || []).map(item => `<div class="order-line">${thumbnail(item)}<div><h3>${esc(item.name)}</h3><p>${esc(item.color)} / ${esc(item.size)}</p><small>${esc(item.sku || '')}</small></div><div class="order-line-total">${money(item.lineTotal ?? item.price * item.quantity)}<small>${item.quantity} × ${money(item.price)}</small></div></div>`).join('')}<div class="totals"><div><span>Subtotal</span><span>${money(order.subtotal)}</span></div><div><span>Delivery</span><span>${money(order.shippingFee)}</span></div><div class="total"><span>Total</span><span>${money(order.total)}</span></div></div><small>Payment method: Cash on delivery</small></div></section><section class="card"><div class="card-heading"><h2>Customer & delivery</h2></div><div class="card-body"><div class="customer-details"><div><h3>Contact</h3><p><strong>${esc(customer.name)}</strong><br>${esc(customer.phone)}<br>${esc(customer.email || 'No email provided')}</p></div><div><h3>Shipping address</h3><p>${esc(customer.address)}<br>${esc(customer.city)}${customer.province ? `, ${esc(customer.province)}` : ''}<br>${esc(customer.postalCode || '')} Pakistan</p></div></div>${customer.notes ? `<div class="customer-note"><small>Customer note</small><br>${esc(customer.notes)}</div>` : ''}</div></section><section class="card"><div class="card-heading"><h2>Manage this order</h2></div><form id="order-status-form" class="card-body order-status-form" data-id="${esc(order.id)}" data-original-status="${esc(order.status)}"><div class="field-row"><label class="field"><span>Fulfilment status</span><select name="status">${options(['cancelled','delivered'].includes(order.status) ? [order.status] : ORDER_STATUSES,order.status)}</select></label><label class="field"><span>Payment status</span><select name="paymentStatus">${options(['unpaid','paid','refunded'],order.paymentStatus || 'unpaid')}</select></label></div><div id="cancel-notice" ${order.status === 'cancelled' ? '' : 'hidden'}>${notice('Cancelling an order returns its reserved stock once. Cancelled orders cannot be reopened; create a new order if the customer changes their mind.')}</div><label class="field"><span>Tracking number <small>(optional)</small></span><input name="trackingNumber" maxlength="150" value="${esc(order.trackingNumber || '')}" placeholder="Courier tracking reference"></label><label class="field"><span>Private admin notes</span><textarea name="notes" maxlength="5000" placeholder="Packing instructions, courier details, or follow-up notes…">${esc(order.notes || '')}</textarea><small>Only store administrators can see these notes. Saving does not send an email or SMS.</small></label><div id="order-save-error"></div><button type="submit" class="button primary">${icon('check')}Save order updates</button></form></section></div>`;
}

function newProduct(category) {
  const selected = CATEGORIES.includes(category) ? category : CATEGORIES[0];
  return {id:'',name:'',category:selected,subtitle:'',price:'',compareAtPrice:'',fabric:'',colors:[{name:'Ivory',hex:'#e8dfcc'}],sizes:selected === 'Unstitched' ? ['Unstitched'] : ['XS','S','M','L','XL'],image:'',imageAlt:'',images:[],position:'50% 40%',description:'',details:[],care:'',sku:'',status:'draft',featured:false,variants:[]};
}

async function showEditor(id, category, token) {
  const data = await api('admin/products'); state.products = data.products || [];
  if (token !== state.routeToken) return;
  const product = id === 'new' ? newProduct(category) : state.products.find(item => item.id === id);
  if (!product) throw new Error('This product could not be found. Return to All products to select another piece.');
  state.editor = structuredClone(product);
  state.editor.images = [...new Set([product.image, ...(product.images || []), product.imageAlt].filter(Boolean))];
  state.editor.variants ||= [];
  regenerateVariants();
  state.dirty = false;
  const p = state.editor;
  main().innerHTML = `<a class="back-link" href="#/products${p.category ? `/category/${encodeURIComponent(p.category)}` : ''}">${icon('back')}Back to ${esc(p.category || 'products')}</a><div class="page-heading editor-heading"><div><div class="eyebrow">Your next beautiful piece</div><h1>${esc(p.id ? p.name : 'Add a product.')}</h1><p>${p.id ? 'Refine the details. Keep your collection looking its best.' : 'A thoughtful product page begins with the little details.'}</p></div><span id="editor-status">${badge(p.status)}</span></div><nav class="section-nav" aria-label="Product form sections"><a href="#" data-jump="product-basics">01 Basics</a><a href="#" data-jump="product-images">02 Images</a><a href="#" data-jump="product-variants">03 Variants</a><a href="#" data-jump="product-organization">04 Organization</a></nav><form id="product-form"><div class="editor-grid"><div class="editor-main"><section class="card" id="product-basics"><div class="card-heading"><div class="section-title"><span class="section-number">01</span><div><h2>The essentials</h2><p>The story your customers see first.</p></div></div></div><div class="card-body"><label class="field"><span>Product name <span class="required">*</span></span><input name="name" required maxlength="160" value="${esc(p.name)}" placeholder="e.g. Noor Ivory"></label><label class="field"><span>Short description</span><input name="subtitle" maxlength="200" value="${esc(p.subtitle)}" placeholder="e.g. Embroidered cotton · 2 piece"><small>A brief fabric and set description, shown below the name.</small></label><label class="field"><span>Description</span><textarea name="description" maxlength="8000" rows="4" placeholder="The details that make this piece special…">${esc(p.description)}</textarea></label><div class="field-row"><label class="field"><span>Price <span class="required">*</span></span><div class="input-prefix"><span>PKR</span><input type="number" name="price" min="1" step="1" required value="${esc(p.price)}" placeholder="8,450"></div></label><label class="field"><span>Compare-at price</span><div class="input-prefix"><span>PKR</span><input type="number" name="compareAtPrice" min="1" step="1" value="${esc(p.compareAtPrice || '')}" placeholder="Optional"></div><small>Use a higher original price to show a sale.</small></label></div><div class="field-row"><label class="field"><span>Fabric</span><input name="fabric" maxlength="100" value="${esc(p.fabric)}" placeholder="e.g. Cotton"></label><label class="field"><span>Product SKU</span><input name="sku" maxlength="100" value="${esc(p.sku)}" placeholder="e.g. RAH-NOOR-001"><small>Your internal reference. Generated automatically if blank.</small></label></div><label class="field"><span>Product details</span><textarea name="details" maxlength="4000" rows="3" placeholder="Two-piece set: shirt and trousers&#10;Breathable cotton&#10;Delicate embroidery">${esc((p.details || []).join('\n'))}</textarea><small>One detail per line. Shown as a list on the product page.</small></label><label class="field"><span>Care instructions</span><textarea name="care" maxlength="2000" rows="2" placeholder="How should this piece be cared for?">${esc(p.care)}</textarea></label></div></section><section class="card" id="product-images"><div class="card-heading"><div class="section-title"><span class="section-number">02</span><div><h2>Show every beautiful detail</h2><p>The first image becomes the product cover.</p></div></div></div><div class="card-body"><label class="upload-area field">${icon('upload')}<strong>Make room for your product images</strong><input type="file" id="product-upload" accept="image/jpeg,image/png,image/webp" multiple><p>Up to 12 JPG, PNG or WebP images. 8 MB per image, up to 6000 px per side and 24 megapixels.</p></label><div id="upload-status" role="status"></div><div id="image-gallery" class="image-gallery"></div><label class="field" style="margin-top:18px"><span>Image focus</span><select name="position"><option value="50% 25%" ${p.position === '50% 25%' ? 'selected' : ''}>Upper part of the photograph</option><option value="${esc(p.position || '50% 40%')}" selected>Current / balanced focus</option><option value="50% 50%">Centre</option><option value="50% 70%">Lower part of the photograph</option></select><small>Controls the crop on collection cards.</small></label></div></section><section class="card" id="product-variants"><div class="card-heading"><div class="section-title"><span class="section-number">03</span><div><h2>Sizes, colours & stock</h2><p>Every combination, clearly accounted for.</p></div></div></div><div class="card-body"><label class="field"><span>Available sizes <span class="required">*</span></span><input name="sizes" required value="${esc(p.sizes.join(', '))}" placeholder="XS, S, M, L, XL"><small>Separate sizes with commas. Use “Unstitched” or “One Size” when appropriate.</small></label><span class="field-label">Colour options</span><div id="color-list" class="color-list"></div>${button('Add colour','data-add-color','small','plus')}<div id="variant-table"></div><p class="inventory-help">Stock is tracked separately for each size and colour. New combinations begin at zero. Only available variants can be ordered.</p></div></section></div><aside class="editor-aside"><section class="card" id="product-organization"><div class="card-heading"><div class="section-title"><span class="section-number">04</span><h2>Organization</h2></div></div><div class="card-body"><label class="field"><span>Collection <span class="required">*</span></span><select name="category" required>${options(CATEGORIES,p.category)}</select><small>Choose one of your three established collections.</small></label><label class="check-field"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}><span>Feature this product<small>Include this piece in the homepage edit.</small></span></label><p class="side-note">Your collection names stay consistent across the storefront and this workspace.</p></div></section><section class="card"><div class="card-heading"><h2>Publishing</h2></div><div class="card-body"><p class="status-explain">Save as a draft while you prepare the details. Publish when the product is ready to appear in your store.</p><p class="status-explain">Published products need an image, a price, and at least one size and colour.</p>${p.id && p.status === 'active' ? `<a class="preview-link" href="../#/product/${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View on your storefront ${icon('external')}</a>` : ''}${p.id ? `<p class="product-id">Product ID: ${esc(p.id)}</p>` : ''}</div></section>${p.id ? `<section class="card"><div class="card-body"><h3>Keep your catalogue tidy</h3><p class="side-note">Archive a piece to hide it from the storefront. Existing orders and product details remain available.</p>${p.status !== 'archived' ? button('Archive product','data-archive-product','small danger') : '<p class="status-explain">This product is archived. Publish it or save it as a draft to restore it.</p>'}</div></section>` : ''}</aside></div><div id="product-save-error"></div><div class="editor-actions"><span class="muted" id="save-indicator">${p.id ? 'All changes saved' : 'New product'}</span><a class="button" href="#/products">Cancel</a><button type="submit" class="button" name="saveAction" value="draft">Save draft</button><button type="submit" class="button primary" name="saveAction" value="active">${icon('check')}${p.status === 'active' ? 'Save changes' : 'Publish product'}</button></div></form>`;
  renderImages(); renderColors(); renderVariants();
}

function renderImages() {
  document.getElementById('image-gallery').innerHTML = state.editor.images.map((url,index) => `<div class="gallery-item"><img src="${esc(imageUrl(url))}" alt="Product image ${index + 1}"><div class="gallery-controls"><button class="icon-button" type="button" data-image-left="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Move image ${index + 1} earlier">${icon('back')}</button><button class="icon-button" type="button" data-image-right="${index}" ${index === state.editor.images.length - 1 ? 'disabled' : ''} aria-label="Move image ${index + 1} later">${icon('arrow')}</button><button class="icon-button danger" type="button" data-image-remove="${index}" aria-label="Remove image ${index + 1}">${icon('trash')}</button></div></div>`).join('');
}

function renderColors() {
  document.getElementById('color-list').innerHTML = state.editor.colors.map((color,index) => `<div class="color-row"><input type="color" value="${hex(color.hex)}" data-color-hex="${index}" aria-label="Colour ${index + 1} swatch"><input type="text" value="${esc(color.name)}" data-color-name="${index}" maxlength="60" required placeholder="Colour name" aria-label="Colour ${index + 1} name"><button type="button" class="icon-button danger" data-remove-color="${index}" ${state.editor.colors.length < 2 ? 'disabled' : ''} aria-label="Remove ${esc(color.name)} colour">${icon('trash')}</button></div>`).join('');
  const add = document.querySelector('[data-add-color]');
  if (add) add.disabled = state.editor.colors.length >= MAX_OPTIONS || (state.editor.colors.length + 1) * state.editor.sizes.length > MAX_VARIANTS;
}

function regenerateVariants() {
  const previous = new Map((state.editor.variants || []).map(variant => [`${variant.color}\u0000${variant.size}`,variant]));
  state.editor.variants = state.editor.colors.flatMap(color => state.editor.sizes.map(size => previous.get(`${color.name}\u0000${size}`) || {color:color.name,size,sku:'',stock:0}));
}

function captureVariantInputs() {
  document.querySelectorAll('[data-variant-stock]').forEach(input => {const variant = state.editor.variants[Number(input.dataset.variantStock)]; if (variant) variant.stock = input.value === '' ? 0 : numeric(input.value);});
  document.querySelectorAll('[data-variant-sku]').forEach(input => {const variant = state.editor.variants[Number(input.dataset.variantSku)]; if (variant) variant.sku = input.value.trim();});
}

function renderVariants() {
  document.getElementById('variant-table').innerHTML = state.editor.variants.length ? `<div class="variant-table"><table><thead><tr><th scope="col">Variant</th><th scope="col">SKU</th><th scope="col">Stock</th></tr></thead><tbody>${state.editor.variants.map((variant,index) => `<tr><td><span class="swatch" style="background:${hex(state.editor.colors.find(color => color.name === variant.color)?.hex)}"></span>${esc(variant.color)} / ${esc(variant.size)}</td><td><input data-variant-sku="${index}" value="${esc(variant.sku)}" maxlength="100" placeholder="Auto-generated" aria-label="SKU for ${esc(variant.color)} ${esc(variant.size)}"></td><td><input data-variant-stock="${index}" type="number" min="0" max="1000000" step="1" required value="${numeric(variant.stock)}" aria-label="Stock for ${esc(variant.color)} ${esc(variant.size)}"></td></tr>`).join('')}</tbody></table></div>` : notice('Add at least one size and colour to create inventory variants.');
}

function markDirty() {
  state.dirty = true;
  const indicator = document.getElementById('save-indicator');
  if (indicator) indicator.textContent = 'Unsaved changes';
}

function collectProduct(form, status) {
  captureVariantInputs();
  const fields = new FormData(form);
  const product = {...state.editor};
  for (const name of ['name','category','subtitle','fabric','description','care','sku','position']) product[name] = String(fields.get(name) || '').trim();
  product.price = numeric(fields.get('price'));
  product.compareAtPrice = fields.get('compareAtPrice') ? numeric(fields.get('compareAtPrice')) : null;
  product.details = String(fields.get('details') || '').split('\n').map(line => line.trim()).filter(Boolean);
  product.featured = fields.has('featured');
  product.status = status;
  product.image = product.images[0] || '';
  product.imageAlt = product.images[1] || '';
  const skuPart = value => String(value).toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35);
  product.sku ||= `RAH-${skuPart(product.name) || 'PRODUCT'}`;
  product.variants = product.variants.map(variant => ({...variant,sku:variant.sku || `${product.sku}-${skuPart(variant.size)}-${skuPart(variant.color)}`.slice(0,100)}));
  return product;
}

async function saveProduct(form, status) {
  if (state.busy || !form.reportValidity()) return;
  const target = document.getElementById('product-save-error'); target.innerHTML = '';
  const product = collectProduct(form, status);
  if (!product.sizes.length) return fieldError(target,new Error('Add at least one size.'));
  if (!product.colors.length || product.sizes.length > MAX_OPTIONS || product.colors.length > MAX_OPTIONS || product.variants.length > MAX_VARIANTS) return fieldError(target,new Error(`Use up to ${MAX_OPTIONS} sizes, ${MAX_OPTIONS} colours, and ${MAX_VARIANTS} total size/colour combinations.`));
  if (product.colors.some(color => !color.name.trim())) return fieldError(target,new Error('Every colour needs a name.'));
  if (new Set(product.colors.map(color => color.name.toLowerCase().trim())).size !== product.colors.length) return fieldError(target,new Error('Each colour must have a different name.'));
  if (status === 'active' && !product.images.length) return fieldError(target,new Error('Add at least one product image before publishing.'));
  if (product.compareAtPrice !== null && product.compareAtPrice <= product.price) return fieldError(target,new Error('The compare-at price must be higher than the selling price.'));
  setFormBusy(form,true);
  try {
    const {product:saved} = await api(product.id ? `admin/products/${encodeURIComponent(product.id)}` : 'admin/products',product.id ? 'PUT' : 'POST',product);
    state.products = state.products.filter(item => item.id !== saved.id).concat(saved);
    state.dirty = false;
    toast(status === 'active' ? 'Product saved and published.' : 'Draft saved.');
    location.hash = `#/products/${encodeURIComponent(saved.id)}`;
    if (state.editor.id === saved.id) await route(true);
  } catch (error) {fieldError(target,error); if (error.status === 409 && product.id) target.insertAdjacentHTML('beforeend',button('Reload latest product','data-reload-product','small')); target.scrollIntoView({block:'center',behavior:'smooth'});}
  finally {setFormBusy(form,false);}
}

async function uploadImages(input) {
  const files = [...input.files];
  if (!files.length) return;
  const target = document.getElementById('upload-status');
  if (state.editor.images.length + files.length > 12) {
    target.innerHTML = '<p class="inline-error" role="alert">A product can have up to 12 images. Remove an image before adding more.</p>'; input.value = ''; return;
  }
  if (files.some(file => file.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) {
    target.innerHTML = '<p class="inline-error" role="alert">Use JPG, PNG or WebP images smaller than 8 MB each.</p>'; input.value = ''; return;
  }
  const editor = state.editor;
  const token = state.routeToken;
  const form = document.getElementById('product-form');
  setFormBusy(form,true);
  let count = 0;
  try {
    for (const file of files) {
      target.innerHTML = `<p class="muted" style="font-size:11px">Uploading image ${count + 1} of ${files.length}…</p>`;
      const body = new FormData(); body.append('image',file);
      const {url} = await api('admin/upload','POST',body);
      if (editor !== state.editor || token !== state.routeToken) return;
      editor.images.push(url); count++; markDirty(); renderImages();
    }
    target.innerHTML = `<p class="muted" style="font-size:11px">${count} ${count === 1 ? 'image' : 'images'} uploaded. Save the product to keep your gallery changes.</p>`;
  } catch (error) {fieldError(target,error);}
  finally {input.value = ''; setFormBusy(form,false); if (token === state.routeToken) renderColors();}
}

async function showSettings(token) {
  const {settings} = await api('admin/settings');
  if (token !== state.routeToken) return;
  state.settings = settings;
  main().innerHTML = `${heading('The details behind your store', 'Make it yours.', 'Simple settings for a considered shopping experience.')}<form id="settings-form" class="settings-grid"><div class="setting-intro"><h2>Your store</h2><p>The name and announcement your customers see while they browse.</p></div><section class="card"><div class="card-body"><label class="field"><span>Store name</span><input name="storeName" required maxlength="100" value="${esc(settings.storeName || 'RAHMEEN')}"></label><label class="field"><span>Announcement bar</span><input name="announcement" maxlength="240" value="${esc(settings.announcement || '')}" placeholder="A little news for your customers"><small>Leave blank to hide the announcement text.</small></label><label class="field"><span>Currency</span><input value="Pakistani Rupee (PKR)" disabled><small>Your catalogue and orders use PKR.</small></label></div></section><div class="setting-intro"><h2>Delivery & payment</h2><p>Set a flat delivery rate and manage cash on delivery.</p></div><section class="card"><div class="card-body"><label class="field"><span>Delivery fee</span><div class="input-prefix"><span>PKR</span><input name="shippingFee" type="number" required min="0" max="100000" step="1" value="${numeric(settings.shippingFee)}"></div><small>Applied once per order. Set to zero for free delivery.</small></label><label class="check-field"><input type="checkbox" name="codEnabled" ${settings.codEnabled ? 'checked' : ''}><span>Accept cash on delivery<small>Customers pay when their order arrives. If disabled, placing new orders is unavailable until a payment method is connected.</small></span></label></div></section><div class="setting-intro"><h2>Store readiness</h2><p>Keep test orders clearly separate while you prepare to launch.</p></div><section class="card"><div class="card-body"><label class="check-field"><input type="checkbox" name="demoMode" ${settings.demoMode ? 'checked' : ''}><span>Test mode<small>Orders are labelled as demonstrations. Turn this off only when your store, stock and fulfilment are ready for real customers.</small></span></label><p class="side-note">Order updates are recorded in this workspace. Email, SMS and courier integrations are not connected.</p></div></section><div id="settings-error" class="settings-status"></div><div class="settings-save"><button class="button primary" type="submit">${icon('check')}Save settings</button></div></form>`;
}

function main() { return document.getElementById('main-content'); }
function setFormBusy(form,busy) {
  state.busy = busy;
  form.querySelectorAll('button,input,select,textarea').forEach(element => {
    if (busy) {element.dataset.previousDisabled = String(element.disabled); element.disabled = true;}
    else {element.disabled = element.dataset.previousDisabled === 'true'; delete element.dataset.previousDisabled;}
  });
  form.setAttribute('aria-busy',String(busy));
}

async function route(force = false) {
  if (!state.session?.authenticated) return;
  if (state.busy && !force) {history.replaceState(null,'',state.lastHash); toast('Please wait for the current save or upload to finish.'); return;}
  const hash = location.hash || '#/overview';
  if (!force && state.dirty && state.lastHash !== hash && !confirm('You have unsaved changes. Leave this page and discard them?')) {history.replaceState(null,'',state.lastHash); return;}
  state.dirty = false; state.lastHash = hash;
  const token = ++state.routeToken;
  const [path,query] = hash.replace(/^#\/?/,'').split('?');
  const parts = path.split('/').map(part => {try{return decodeURIComponent(part);}catch{return part;}});
  state.route = ['overview','products','orders','settings'].includes(parts[0]) ? parts[0] : 'overview';
  state.category = parts[0] === 'products' && parts[1] === 'category' && CATEGORIES.includes(parts[2]) ? parts[2] : '';
  renderShell(state.route === 'products' && parts[1] && parts[1] !== 'category' ? 'Product details' : {overview:'Overview',products:'Products',orders:'Orders',settings:'Store settings'}[state.route]);
  window.scrollTo(0,0);
  try {
    if (state.route === 'overview') await showOverview(token);
    if (state.route === 'products' && (!parts[1] || parts[1] === 'category')) await showProducts(token);
    else if (state.route === 'products') await showEditor(parts[1],new URLSearchParams(query).get('category'),token);
    if (state.route === 'orders') await showOrders(token);
    if (state.route === 'settings') await showSettings(token);
  } catch (error) {
    if (token === state.routeToken && state.session?.authenticated) main().innerHTML = `${heading('Store workspace', 'Something needs attention.', 'Your work is safe. Try loading this view again.')}${notice(esc(error.message),'error')}<div class="button-row">${button('Try again','data-refresh','primary')}<a class="button" href="#/overview">Back to overview</a></div>`;
  }
}

async function boot() {
  try {
    state.session = await api('session');
    if (state.session.authenticated) await route(true); else renderAuth();
  } catch (error) {
    app.innerHTML = `<main id="main-content" class="card service-error"><div class="eyebrow">RAHMEEN store workspace</div><h1>Your store workspace needs its server.</h1><p>${esc(error.message)}</p><p>This dashboard uses a private PHP and SQLite backend to keep products, inventory and customer orders in one shared store. Follow the hosting setup in the project README before signing in.</p><div class="button-row">${button('Try again','data-retry-boot','primary')}<a class="button" href="../">Back to storefront</a></div></main>`;
  }
}

document.addEventListener('click',async event => {
  const target = event.target.closest('button,a'); if (!target) return;
  if (state.busy) {event.preventDefault(); return;}
  if (target.classList.contains('skip-link')) {event.preventDefault(); main()?.focus(); return;}
  if (target.hasAttribute('data-toggle-menu')) {const open = app.querySelector('.admin-shell').classList.toggle('menu-open'); target.setAttribute('aria-expanded',String(open));}
  if (target.hasAttribute('data-close-menu')) {app.querySelector('.admin-shell')?.classList.remove('menu-open'); app.querySelector('[data-toggle-menu]')?.setAttribute('aria-expanded','false');}
  if (target.hasAttribute('data-retry-boot')) {target.disabled = true; await boot();}
  if (target.hasAttribute('data-refresh')) {await route(true);}
  if (target.hasAttribute('data-reload-product')) {if (confirm('Reload the latest product and discard the unsaved changes in this editor?')) {state.dirty = false; await route(true);}}
  if (target.hasAttribute('data-close-order')) orderDialog.close();
  if (target.hasAttribute('data-order')) await openOrder(target.dataset.order);
  if (target.hasAttribute('data-jump')) {event.preventDefault(); document.getElementById(target.dataset.jump)?.scrollIntoView({behavior:'smooth'});}
  if (target.hasAttribute('data-logout')) {
    if (state.dirty && !confirm('You have unsaved changes. Sign out and discard them?')) return;
    target.disabled = true;
    try {await api('logout','POST',{}); state.dirty = false; state.products = []; state.orders = []; state.editor = null; state.settings = null; orderDialog.close(); await boot();} catch (error) {toast(error.message,true); target.disabled = false;}
  }
  if (target.hasAttribute('data-add-color')) {
    if (state.editor.colors.length >= MAX_OPTIONS || (state.editor.colors.length + 1) * state.editor.sizes.length > MAX_VARIANTS) return;
    captureVariantInputs(); state.editor.colors.push({name:`Colour ${state.editor.colors.length + 1}`,hex:'#c4bdac'}); regenerateVariants(); renderColors(); renderVariants(); markDirty();
  }
  if (target.hasAttribute('data-remove-color')) {
    captureVariantInputs(); state.editor.colors.splice(Number(target.dataset.removeColor),1); regenerateVariants(); renderColors(); renderVariants(); markDirty();
  }
  for (const [attribute,direction] of [['data-image-left',-1],['data-image-right',1]]) {
    if (target.hasAttribute(attribute)) {const index = Number(target.getAttribute(attribute)); const images = state.editor.images; [images[index],images[index + direction]] = [images[index + direction],images[index]]; renderImages(); markDirty();}
  }
  if (target.hasAttribute('data-image-remove')) {state.editor.images.splice(Number(target.dataset.imageRemove),1); renderImages(); markDirty();}
  if (target.hasAttribute('data-archive-product')) {
    if (!confirm('Archive this product? It will be hidden from the storefront. Existing orders will remain available.')) return;
    target.disabled = true;
    try {const {product} = await api(`admin/products/${encodeURIComponent(state.editor.id)}`,'DELETE'); state.products = state.products.map(item => item.id === product.id ? product : item); state.dirty = false; toast('Product archived.'); location.hash = '#/products';} catch (error) {toast(error.message,true); target.disabled = false;}
  }
});

document.addEventListener('input',event => {
  const input = event.target;
  if (input.id === 'product-search') {state.productSearch = input.value; renderProductResults();}
  if (input.id === 'order-search') {state.orderSearch = input.value; renderOrderResults();}
  if (input.closest('#product-form') || input.closest('#settings-form')) markDirty();
});

document.addEventListener('change',async event => {
  const input = event.target;
  if (input.id === 'product-status') {state.productStatus = input.value; renderProductResults();}
  if (input.id === 'product-category') renderProductResults();
  if (input.id === 'order-status') {state.orderStatus = input.value; renderOrderResults();}
  if (input.id === 'product-upload') await uploadImages(input);
  if (input.closest('#product-form')) {
    markDirty();
    if (input.name === 'sizes') {
      const sizes = [...new Set(input.value.split(',').map(size => size.trim()).filter(Boolean))];
      const invalid = sizes.length > MAX_OPTIONS || sizes.some(size => size.length > 80) || sizes.length * state.editor.colors.length > MAX_VARIANTS;
      input.setCustomValidity(invalid ? `Use up to ${MAX_OPTIONS} sizes of 80 characters each, and ${MAX_VARIANTS} total size/colour combinations.` : '');
      if (invalid) {input.reportValidity(); return;}
      captureVariantInputs(); state.editor.sizes = sizes; regenerateVariants(); renderVariants(); renderColors();
    }
    if (input.hasAttribute('data-color-name')) {
      captureVariantInputs(); const color = state.editor.colors[Number(input.dataset.colorName)]; const oldName = color.name; color.name = input.value.trim(); state.editor.variants.forEach(variant => {if (variant.color === oldName) variant.color = color.name;}); regenerateVariants(); renderVariants();
    }
    if (input.hasAttribute('data-color-hex')) {captureVariantInputs(); state.editor.colors[Number(input.dataset.colorHex)].hex = input.value; renderVariants();}
  }
  if (input.closest('#settings-form')) markDirty();
  if (input.name === 'status' && input.closest('#order-status-form')) document.getElementById('cancel-notice').hidden = input.value !== 'cancelled' && input.closest('form').dataset.originalStatus !== 'cancelled';
});

document.addEventListener('submit',async event => {
  const form = event.target;
  if (!['auth-form','product-form','settings-form','order-status-form'].includes(form.id)) return;
  event.preventDefault();
  if (state.busy) return;
  if (form.id === 'product-form') {await saveProduct(form,event.submitter?.value || (state.editor.status === 'active' ? 'active' : 'draft')); return;}
  const data = Object.fromEntries(new FormData(form));
  if (form.id === 'auth-form') {
    const setup = state.session?.setupRequired;
    const errorTarget = document.getElementById('auth-error'); errorTarget.innerHTML = '';
    if (setup && data.password !== data.confirmPassword) return fieldError(errorTarget,new Error('The passwords do not match. Please try again.'));
    if (setup && data.password.length < 12) return fieldError(errorTarget,new Error('Use a password with at least 12 characters.'));
    delete data.confirmPassword; setFormBusy(form,true);
    try {state.session = await api(setup ? 'setup' : 'login','POST',data); state.products = []; state.orders = []; state.dirty = false; await route(true);} catch (error) {fieldError(errorTarget,error);} finally {setFormBusy(form,false);}
  }
  if (form.id === 'settings-form') {
    const target = document.getElementById('settings-error'); target.innerHTML = ''; setFormBusy(form,true);
    try {const {settings} = await api('admin/settings','PUT',{storeName:data.storeName.trim(),announcement:data.announcement.trim(),shippingFee:numeric(data.shippingFee),codEnabled:data.codEnabled === 'on',demoMode:data.demoMode === 'on'}); state.settings = settings; state.dirty = false; toast('Store settings saved.');} catch (error) {fieldError(target,error);} finally {setFormBusy(form,false);}
  }
  if (form.id === 'order-status-form') {
    const target = document.getElementById('order-save-error'); target.innerHTML = ''; setFormBusy(form,true);
    try {const {order} = await api(`admin/orders/${encodeURIComponent(form.dataset.id)}`,'PATCH',data); state.orders = state.orders.map(item => item.id === order.id ? order : item); renderOrderDetail(order); toast('Order updates saved.'); if (document.getElementById('order-results')) renderOrderResults(); else if (state.route === 'overview') await showOverview(state.routeToken);} catch (error) {fieldError(target,error);} finally {setFormBusy(form,false);}
  }
});

orderDialog.addEventListener('click',event => {if (event.target === orderDialog && event.clientX < orderDialog.getBoundingClientRect().left) orderDialog.close();});
window.addEventListener('hashchange',() => route());
window.addEventListener('beforeunload',event => {if (state.dirty) {event.preventDefault(); event.returnValue = '';}});
window.addEventListener('keydown',event => {if (event.key === 'Escape') {app.querySelector('.admin-shell')?.classList.remove('menu-open'); app.querySelector('[data-toggle-menu]')?.setAttribute('aria-expanded','false');}});
boot();
