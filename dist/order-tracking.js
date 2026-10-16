import { apiRequest } from './store-api.js';
import { escapeHTML, storeSettings } from './catalogue.js';

export function initOrderTracking() {
  const dialog = document.createElement('dialog');
  dialog.className = 'tracking-dialog';
  dialog.setAttribute('aria-labelledby', 'tracking-title');
  dialog.innerHTML = `<div class="tracking-head"><span class="eyebrow">YOUR RAHMEEN ORDER</span><button class="icon-button" type="button" data-close-track aria-label="Close order tracking">×</button></div><h2 id="tracking-title">On its <em>way.</em></h2><p>Enter your order number and the phone number used at checkout.</p><form id="tracking-form"><label>Order number<input name="number" placeholder="RA-261012-1234ABCD" required maxlength="40" autocomplete="off" spellcheck="false"></label><label>Phone number<input name="phone" type="tel" placeholder="03XX XXXXXXX" autocomplete="tel" required minlength="10" maxlength="24"></label><p class="tracking-error" role="alert"></p><button class="button coral-button" type="submit">Find my order <span aria-hidden="true">↗</span></button></form><div class="tracking-result" aria-live="polite"></div>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const result = dialog.querySelector('.tracking-result');
  const error = dialog.querySelector('.tracking-error');
  let pending = false;
  document.addEventListener('click', event => {
    if (event.target.closest('[data-track-order]')) { error.textContent = ''; result.innerHTML = ''; dialog.showModal(); }
    if (event.target.closest('[data-close-track]')) dialog.close();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    if (!storeSettings.available) { error.textContent = 'The store is temporarily offline. Please try again later.'; return; }
    pending = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Finding your order…';
    error.textContent = '';
    result.innerHTML = '';
    try {
      const fields = new FormData(form);
      const { order } = await apiRequest('orders/track', { method: 'POST', body: { number: fields.get('number').trim(), phone: fields.get('phone').trim() } });
      const steps = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
      const index = steps.indexOf(order.status);
      const status = String(order.status || 'pending');
      result.innerHTML = `<div class="tracking-order"><span class="eyebrow">${escapeHTML(order.number)}</span><h3>${escapeHTML(status.charAt(0).toUpperCase() + status.slice(1))}</h3>${order.demoMode ? '<p class="tracking-demo">Demo order · Saved for testing; no delivery will be made.</p>' : ''}${status === 'cancelled' ? '<p>This order has been cancelled.</p>' : `<ol class="tracking-steps">${steps.map((step, i) => `<li class="${i <= index ? 'complete' : ''}" ${i === index ? 'aria-current="step"' : ''}><span></span>${step.charAt(0).toUpperCase() + step.slice(1)}</li>`).join('')}</ol>`}${order.trackingNumber ? `<p>Courier reference: <strong>${escapeHTML(order.trackingNumber)}</strong></p>` : ''}<ul class="tracking-items">${(order.items || []).map(item => `<li>${escapeHTML(item.name)}<small>${escapeHTML(item.size)} / ${escapeHTML(item.color)} · Qty ${Number(item.quantity)}</small></li>`).join('')}</ul><p class="tracking-total"><span>Order total</span><strong>PKR ${Number(order.total).toLocaleString('en-PK')}</strong></p></div>`;
      result.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
    } catch (failure) { error.textContent = failure.message || 'We could not find that order. Check the details and try again.'; }
    finally { pending = false; button.disabled = false; button.innerHTML = 'Find my order <span aria-hidden="true">↗</span>'; }
  });
}
