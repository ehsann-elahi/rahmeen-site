from pathlib import Path
from PIL import Image
import json
assets=[{"name":"hero-detail","transparent_background":False,"prompt":"Use case: identity-preserve. Asset type: second product view for premium Pakistani womenswear ecommerce. Edit the reference campaign photograph to create a closer portrait photograph of exactly the same adult woman wearing exactly the same coral-orange kurta with the same ivory/gold botanical embroidery pattern and the same sheer dupatta. Keep her face, hair, outfit colors, garment construction, sleeves, embroidery and identity unchanged. Change only the camera framing and pose: portrait 2:3 knees-up frame with head fully visible; she is turned slightly in an elegant 3/4 pose to reveal the sleeve and neckline details while lightly holding her flowing dupatta. Keep the same warm sunlit ivory sandstone arched setting and natural high-end fashion photography quality. Authentic fabric weave, realistic thread and skin textures. No text, no watermarks, no logos. A single coherent photograph, not a collage.","source":"C:\\Users\\pc\\.codex\\generated_images\\01a12a44-fec3-76e2-8287-3415efd4a0b9\\exec-ce1e8abd-4914-4826-ab31-3dd508d2a0c4.png"},{"name":"dupatta","transparent_background":True,"prompt":"Use case: product-mockup. Asset type: isolated floating garment cutout for a premium Pakistani fashion website. Use the supplied photograph as garment design and color reference ONLY. Create a single coral-orange translucent dupatta matching the reference's sheer fine fabric, delicate ivory/golden small embroidered botanical motifs and refined embroidered border. The dupatta floats freely in an artful asymmetric long S-shaped flowing ripple, like suspended in a gentle breeze, with natural fabric twists and translucent folds. This is a single lightweight rectangular scarf, not a dress. Entire flowing fabric visible with clear space around the edges. Photoreal luxurious textile product photography, soft studio sunlight emphasizes fine threads, soft corally orange color. Isolate on truly transparent background with alpha transparency, no backdrop. No person, no hands, no mannequin, no hanger, no other garments or objects, no text, no logo, no watermark.","source":"C:\\Users\\pc\\.codex\\generated_images\\01a12a44-fec3-76e2-8287-3415efd4a0b9\\exec-7c1c957f-c4c0-4953-86ed-7e36b7d8c1b0.png"}]
dest=Path(r'D:\RahmeenArts\rahmeen-site\dist\assets')
for a in assets:
 im=Image.open(a['source'])
 p=dest/(a['name']+'.webp')
 assert not p.exists(), str(p)
 im.save(p, 'WEBP', quality=89, method=6)
 print(a['name'], im.size, im.mode, im.getextrema()[-1] if im.mode=='RGBA' else 'no alpha', p.stat().st_size)
manifest=Path(r'D:\RahmeenArts\rahmeen-site\asset-prompts.json')
data=json.loads(manifest.read_text())
data['assets'].extend(assets)
manifest.write_text(json.dumps(data,indent=2))

