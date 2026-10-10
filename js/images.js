/* images.js — images et photos libres posées sur le plan (v1.4.6 §2). Ce n'est PAS le fond de plan (fond.js).
 *
 * Stockage : magasin IndexedDB `fonds` existant ({ id, blob, type: 'image', mime, nom_fichier }), sans changer
 * VERSION_BD. L'objet du plan ne porte que `fond_id` : le binaire n'alourdit ni le projet ni l'historique.
 * ⚠ Un binaire n'est protégé de la purge des orphelins (projet.js → purgerCorbeille) que parce que
 * plans-calcul.js → fondsReferences() lit aussi les objets `image` des plans.
 *
 * Cache de session : fond_id → { url (écran, <image href>), bitmap (PNG), blob (PDF) }. Le calcul des primitives
 * reste synchrone : une image pas encore chargée est dessinée comme un cadre d'attente à l'écran, et les exports
 * attendent prechargerImages() avant de tracer.
 */
import { bd } from './bd.js';
import { emettre } from './etat.js';
import { CHARTE } from './charte.js';
import { genererId } from './modele.js';
import { reduirePixels } from './forme-calcul.js';

const cache = new Map();   // fond_id → { url, bitmap, blob, largeurPx, hauteurPx } | { erreur }
const enCours = new Map(); // fond_id → Promise

/* Entrée chargée du cache, ou null (pas encore lue, absente, illisible). */
export function imageChargee(id) {
  const e = id ? cache.get(id) : null;
  return e && e.url ? e : null;
}

/* Vrai si le binaire a été cherché et n'existe pas ou ne se décode pas. */
export function imageEnErreur(id) {
  const e = id ? cache.get(id) : null;
  return !!(e && e.erreur);
}

async function decoder(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* repli */ }
  try { return await createImageBitmap(blob); } catch (e) { /* repli */ }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image illisible (format non pris en charge par la tablette)')); };
    img.src = url;
  });
}

/* Lit (une fois) le binaire en base et le prépare pour l'écran et les exports. Émet 'images' une fois chargé. */
export function chargerImage(id) {
  if (!id) return Promise.resolve(null);
  if (cache.has(id)) return Promise.resolve(imageChargee(id));
  if (enCours.has(id)) return enCours.get(id);
  const p = (async () => {
    try {
      const enreg = await bd.get('fonds', id);
      if (!enreg || !enreg.blob) throw new Error('image absente de la base');
      const bitmap = await decoder(enreg.blob);
      const entree = { url: URL.createObjectURL(enreg.blob), bitmap, blob: enreg.blob, largeurPx: bitmap.width || bitmap.naturalWidth, hauteurPx: bitmap.height || bitmap.naturalHeight };
      cache.set(id, entree);
      emettre('images', id);
      return entree;
    } catch (e) {
      console.warn('Image ' + id + ' non chargée :', e);
      cache.set(id, { erreur: (e && e.message) || String(e) });
      emettre('images', id);
      return null;
    } finally {
      enCours.delete(id);
    }
  })();
  enCours.set(id, p);
  return p;
}

/* Identifiants des images d'une liste d'objets. */
export function idsImages(objets) {
  return [...new Set((objets || []).filter((o) => o && o.type === 'image' && o.fond_id).map((o) => o.fond_id))];
}

/* Charge toutes les images d'une liste d'objets (avant un export, à l'ouverture d'un plan). */
export async function prechargerImages(objets) {
  await Promise.all(idsImages(objets).map((id) => chargerImage(id)));
}

/* Format réel d'après les octets d'en-tête (le type déclaré est souvent vide sur Android). */
export function formatOctets(o) {
  if (!o || o.length < 12) return null;
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4E && o[3] === 0x47) return 'png';
  if (o[0] === 0xFF && o[1] === 0xD8 && o[2] === 0xFF) return 'jpeg';
  return null;
}

function canvasVersBlob(cv, type, qualite) {
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage de l’image impossible'))), type, qualite));
}

/* Prépare un fichier choisi sur la tablette : orientation EXIF appliquée, côté long ramené à charte.image.cote_max_px,
 * JPEG réencodé (photos) ; PNG, WebP et GIF deviennent PNG (transparence conservée). */
export async function preparerFichierImage(fichier) {
  const K = CHARTE.image;
  const tete = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
  const png = formatOctets(tete) === 'png' || /png|webp|gif/i.test(fichier.type || '');
  let src;
  try { src = await decoder(fichier); }
  catch (e) { throw new Error('image illisible par la tablette' + (/heic|heif/i.test(fichier.type + fichier.name) ? ' (format HEIC : choisir une photo JPEG)' : '')); }
  const lp = src.width || src.naturalWidth, hp = src.height || src.naturalHeight;
  if (!lp || !hp) throw new Error('image vide');
  const d = reduirePixels(lp, hp, K.cote_max_px);
  const cv = document.createElement('canvas');
  cv.width = d.largeur; cv.height = d.hauteur;
  const c2 = cv.getContext('2d', { alpha: png });
  if (!png) { c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, cv.width, cv.height); }
  c2.drawImage(src, 0, 0, cv.width, cv.height);
  if (src.close) { try { src.close(); } catch (e) { /* ignore */ } }
  const blob = png ? await canvasVersBlob(cv, 'image/png') : await canvasVersBlob(cv, 'image/jpeg', K.qualite_jpeg);
  return { blob, largeurPx: cv.width, hauteurPx: cv.height, nom_fichier: fichier.name || (png ? 'image.png' : 'photo.jpg'), mime: blob.type };
}

/* Écrit le binaire préparé dans `fonds` AVANT que l'objet ne soit ajouté au plan, et le met en cache. Retourne l'id. */
export async function enregistrerImage(prep) {
  const id = genererId('fd');
  await bd.put('fonds', { id, blob: prep.blob, type: 'image', mime: prep.mime, nom_fichier: prep.nom_fichier });
  const bitmap = await decoder(prep.blob);
  cache.set(id, { url: URL.createObjectURL(prep.blob), bitmap, blob: prep.blob, largeurPx: prep.largeurPx, hauteurPx: prep.hauteurPx });
  return id;
}
