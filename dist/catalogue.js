import { apiRequest } from './store-api.js';

// Offline sample records remain browsable, but can never accept an order.
export const categories = ['Ready to Wear', 'Unstitched', 'Festive'];
export const products = [
  { id: 'saffron-muse', name: 'Noor Ivory', category: 'Ready to Wear', subtitle: 'Embroidered cotton · 2 piece', price: 8450, fabric: 'Cotton', colors: [{name:'Ivory',hex:'#e8dfcc'}], sizes: ['XS','S','M','L','XL'], image: './assets/everyday.webp', position:'50% 42%', description: 'An easy silhouette, thoughtful embroidery and a softer shade. Noor Ivory brings a quietly expressive touch to everyday dressing.', details: ['Two-piece set: shirt and straight trousers','Breathable cotton with delicate embroidery','Relaxed silhouette and a clean neckline'], care: 'Gentle hand wash in cool water. Wash colours separately, dry in the shade and press on the reverse.' },
  { id: 'meher-bloom', name: 'Meher Bloom', category: 'Festive', subtitle: 'Embroidered cotton · 3 piece', price: 14950, fabric: 'Cotton', colors: [{name:'Coral',hex:'#ee775f'}], sizes: ['XS','S','M','L','XL'], image: './assets/hero.webp', imageAlt: './assets/hero-detail.webp', position:'50% 35%', description: 'A celebration of colour and the small details. Meher Bloom pairs graceful proportions with expressive embroidery for your brighter occasions.', details: ['Three-piece set: shirt, trousers and dupatta','Embroidered cotton with a lightweight dupatta','A relaxed, occasion-ready silhouette'], care: 'Professional dry clean recommended for embroidered pieces. Press on the reverse with a protective cloth.' },
  { id: 'rose-noor', name: 'Midnight Muse', category: 'Festive', subtitle: 'Embroidered organza · 3 piece', price: 18900, fabric: 'Organza', colors: [{name:'Black',hex:'#25251f'}], sizes: ['XS','S','M','L','XL'], image: './assets/occasion.webp', position:'50% 38%', description: 'For the moments you want to remember. Deep black, warm gold details and airy layers lend Midnight Muse a beautiful sense of occasion.', details: ['Three-piece set: shirt, trousers and dupatta','Sheer organza with a coordinating lining','Detailed embroidery and a softly draped dupatta'], care: 'Professional dry clean recommended. Store folded in a breathable cover and avoid direct contact with perfume.' },
  { id: 'sage-poetry', name: 'Sage Poetry', category: 'Ready to Wear', subtitle: 'Textured linen · 2 piece', price: 9250, fabric: 'Linen', colors: [{name:'Sage',hex:'#9baf98'}], sizes: ['XS','S','M','L','XL'], image: './assets/sage.webp', position:'50% 40%', description: 'A softer rhythm for your wardrobe. Natural texture and a fluid cut make Sage Poetry an effortless companion from slow mornings to evening plans.', details: ['Two-piece set: long shirt and tapered trousers','Lightweight linen with a soft, textured finish','Easy fit with side openings'], care: 'Hand wash gently in cool water with mild detergent. Reshape while damp and press on the reverse.' },
  { id: 'petal-dupatta', name: 'Petal Dupatta', category: 'Festive', subtitle: 'Embroidered organza · Dupatta', price: 3950, fabric: 'Organza', colors: [{name:'Coral',hex:'#ee775f'}], sizes: ['One Size'], image: './assets/dupatta.webp', position:'50% 48%', description: 'A finishing touch with a poetic spirit. Airy coral organza and petal-like embroidery lend a little movement to your favourite silhouette.', details: ['One embroidered dupatta','Length: 2.5 metres · width: 1 metre','A light, embroidered finish for the complete look'], care: 'Professional dry clean recommended. Fold loosely, store away from direct sunlight and protect delicate embroidery.' },
  { id: 'sand-solace', name: 'Ivory Solace', category: 'Ready to Wear', subtitle: 'Textured linen · 2 piece', price: 7950, fabric: 'Linen', colors: [{name:'Ivory',hex:'#e8dfcc'}], sizes: ['XS','S','M','L','XL'], image: './assets/everyday.webp', position:'50% 58%', description: 'Understated by design. A clean, easy shape and tactile linen bring a little calm to the everyday wardrobe.', details: ['Two-piece set: shirt and wide-leg trousers','Naturally textured linen','Relaxed fit designed for everyday comfort'], care: 'Cool hand wash with mild detergent. Dry flat or on a padded hanger and press gently while slightly damp.' },
  { id: 'ivory-reverie', name: 'Ivory Reverie', category: 'Unstitched', subtitle: 'Printed lawn · 3 piece', price: 5950, fabric: 'Lawn', colors: [{name:'Ivory',hex:'#e8dfcc'},{name:'Rose',hex:'#ba766b'}], sizes: ['Unstitched'], image: './assets/unstitched.webp', position:'50% 45%', description: 'A fresh canvas for your own expression. Delicate motifs, soft lawn and a coordinated dupatta, ready to be made your way.', details: ['Unstitched three-piece fabric set','Shirt: 3 metres · trousers: 2.5 metres','Coordinated dupatta: 2.5 metres'], care: 'Soak separately before stitching. Gentle cool wash, dry away from direct sunlight and iron on a low setting.' },
  { id: 'amber-tale', name: 'Coral Dastaan', category: 'Unstitched', subtitle: 'Embroidered cotton · 3 piece', price: 6450, fabric: 'Cotton', colors: [{name:'Coral',hex:'#ee775f'}], sizes: ['Unstitched'], image: './assets/textile.webp', position:'50% 48%', description: 'Warm colour, artful motifs, endless possibilities. Coral Dastaan is a considered fabric pairing for a silhouette that feels entirely yours.', details: ['Unstitched three-piece fabric set','Shirt: 3 metres · trousers: 2.5 metres','Coordinated dupatta: 2.5 metres'], care: 'Soak separately before stitching. Hand wash in cool water and dry in the shade to preserve the embroidery.' },
  { id: 'gul-dastaan', name: 'Gul Dastaan', category: 'Unstitched', subtitle: 'Botanical lawn · 3 piece', price: 6950, fabric: 'Lawn', colors: [{name:'Rose',hex:'#ba766b'},{name:'Ivory',hex:'#e8dfcc'}], sizes: ['Unstitched'], image: './assets/unstitched.webp', position:'50% 62%', description: 'Botanical touches with a poetic spirit. Soft fabric and harmonious colour leave room for your own tailoring and finishing details.', details: ['Unstitched three-piece fabric set','Shirt: 3 metres · trousers: 2.5 metres','Lightweight printed dupatta: 2.5 metres'], care: 'Pre-soak separately before stitching. Gentle cool wash, shade dry and iron on a low setting.' }
];
export const formatPrice = value => `PKR ${Number(value).toLocaleString('en-PK')}`;

export const storeSettings = {
  available: false, orderingEnabled: false, codEnabled: false,
  demoMode: true, shippingFee: 250, currency: 'PKR',
  deliveryNote: '', returnsNote: '', error: '',
};

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const safeImage = value => {
  const source = String(value || '').trim();
  if (/^https?:\/\//i.test(source)) return source;
  if (/^(?:\.\/|\/)?(?:assets|uploads)\/[a-zA-Z0-9_./% -]+$/.test(source) && !source.includes('..')) return source;
  return './assets/everyday.webp';
};
export const safePosition = value => /^(?:\d{1,3}%|center|top|bottom|left|right)(?:\s+(?:\d{1,3}%|center|top|bottom|left|right))?$/.test(String(value)) ? value : '50% 50%';
export const safeColor = value => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value)) ? value : '#d6cbbf';

function normalizeProduct(p, live = false) {
  if (!p || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(p.id) || !categories.includes(p.category) || (live && p.status && p.status !== 'active')) return null;
  const sizes = Array.isArray(p.sizes) ? [...new Set(p.sizes.filter(s => typeof s === 'string' && s.trim()))] : [];
  const colors = Array.isArray(p.colors) ? p.colors.filter(c => c && typeof c.name === 'string' && c.name.trim()).map(c => ({name: c.name, hex: safeColor(c.hex)})) : [];
  if (!sizes.length || !colors.length || !Number.isFinite(Number(p.price)) || Number(p.price) < 0) return null;
  const variants = Array.isArray(p.variants) ? p.variants.filter(v => sizes.includes(v.size) && colors.some(c => c.name === v.color)).map(v => ({size:v.size,color:v.color,sku:String(v.sku || ''),stock:Math.max(0,Math.floor(Number(v.stock) || 0))})) : [];
  return {...p, name:String(p.name || ''), subtitle:String(p.subtitle || ''), fabric:String(p.fabric || ''), description:String(p.description || ''), care:String(p.care || ''), details:Array.isArray(p.details) ? p.details.map(String) : [], price:Number(p.price), sizes, colors, variants, image:safeImage(p.image), imageAlt:p.imageAlt ? safeImage(p.imageAlt) : '', images:Array.isArray(p.images)?p.images.map(safeImage):[], position:safePosition(p.position)};
}

const samples = products.map(p => normalizeProduct(p)).filter(Boolean);
products.splice(0, products.length, ...samples);

export async function loadCatalogue() {
  try {
    const data = await apiRequest('catalogue');
    if (!Array.isArray(data.products)) throw new Error('The catalogue response is invalid.');
    const settings = data.settings || {};
    const liveProducts = data.products.map(p => normalizeProduct(p, true)).filter(Boolean);
    products.splice(0, products.length, ...liveProducts);
    Object.assign(storeSettings, {
      ...settings, available:true, codEnabled:settings.codEnabled === true,
      orderingEnabled:settings.codEnabled === true && settings.orderingEnabled !== false,
      demoMode:settings.demoMode !== false,
      shippingFee:Math.max(0, Number(settings.shippingFee) || 0), currency:'PKR', error:'',
    });
    return {ok:true};
  } catch (error) {
    Object.assign(storeSettings, {available:false, orderingEnabled:false, codEnabled:false, error:error.message || 'The store service is unavailable.'});
    return {ok:false, error:storeSettings.error};
  }
}

