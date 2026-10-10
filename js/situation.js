/* situation.js — plan de situation (v1.5.4, H-305).
 *
 * Carte « Plan IGN » (IGN Géoplateforme, service WMTS « découverte », gratuit et sans clé, Licence Ouverte Etalab)
 * centrée sur le point GPS de l'affaire, composée une fois à partir des tuiles 256 px du système Web Mercator (PM),
 * puis enregistrée comme une image libre (magasin `fonds`, voir images.js) : elle reste disponible hors ligne et sort
 * à l'export PDF / PNG comme toute image. Seules la création et le changement d'échelle demandent une connexion.
 *
 * L'objet est une image (`type: 'image'`) portant `situation { lat, lon, zoom, diametre_mm, source, date }` : taille,
 * rotation, opacité, rognage et calque sont ceux des images ; symboles.js ajoute le rond rouge (point GPS, au centre de
 * l'image entière) et le cadre. Le point GPS est au centre exact de l'image entière, quel que soit le rognage.
 */
import { CHARTE } from './charte.js';
import { analyserGps } from './descriptif.js';

const K = () => CHARTE.situation;

/* Coordonnées en pixels « monde » Web Mercator au niveau z (256 px par tuile). */
export function pixelsMonde(lat, lon, z) {
  const n = 256 * Math.pow(2, z);
  const phi = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n
  };
}

/* Tuiles nécessaires pour une fenêtre largeurPx × hauteurPx centrée sur (lat, lon) au niveau z. Module pur. */
export function tuilesFenetre(lat, lon, z, largeurPx, hauteurPx) {
  const c = pixelsMonde(lat, lon, z);
  const x0 = c.x - largeurPx / 2, y0 = c.y - hauteurPx / 2;
  const nb = Math.pow(2, z);
  const res = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + hauteurPx - 1) / 256); ty++) {
    if (ty < 0 || ty >= nb) continue;
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + largeurPx - 1) / 256); tx++) {
      const txn = ((tx % nb) + nb) % nb;
      res.push({ x: txn, y: ty, dx: Math.round(tx * 256 - x0), dy: Math.round(ty * 256 - y0) });
    }
  }
  return res;
}

export function urlTuile(z, x, y) {
  return K().url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/* Mètres par pixel au niveau z à la latitude donnée (pour l'aide de la fiche). */
export function metresParPixel(lat, z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}

async function chargerTuile(url, signal) {
  const rep = await fetch(url, { mode: 'cors', signal, cache: 'default' });
  if (!rep.ok) throw new Error('tuile refusée (' + rep.status + ')');
  const blob = await rep.blob();
  if (!/^image\//.test(blob.type || 'image/')) throw new Error('réponse non image');
  return await createImageBitmap(blob);
}

/* Compose la carte centrée sur le point GPS. Retourne { blob, largeurPx, hauteurPx, nom_fichier, mime, lat, lon, zoom }.
 * Lève une erreur explicite hors connexion ou si le service refuse. */
export async function genererCarteSituation(gps, zoom = null) {
  const g = typeof gps === 'string' ? analyserGps(gps) : gps;
  if (!g) throw new Error('point GPS de l’affaire absent ou illisible (Informations de l’affaire)');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('pas de connexion : la carte IGN se télécharge une fois, puis reste disponible hors ligne');
  const C = K();
  const z = Math.min(C.zoom_max, Math.max(C.zoom_min, Math.round(zoom ?? C.zoom_defaut)));
  const L = C.largeur_px, H = C.hauteur_px;
  const tuiles = tuilesFenetre(g.lat, g.lon, z, L, H);
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), C.delai_ms);
  let images;
  try {
    images = await Promise.all(tuiles.map((t) => chargerTuile(urlTuile(z, t.x, t.y), ctrl.signal)));
  } catch (e) {
    throw new Error('carte IGN inaccessible (' + (e && e.name === 'AbortError' ? 'délai dépassé' : (e && e.message) || e) + ') — vérifier la connexion');
  } finally { clearTimeout(minuterie); }
  const cv = document.createElement('canvas');
  cv.width = L; cv.height = H;
  const c2 = cv.getContext('2d', { alpha: false });
  c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, L, H);
  tuiles.forEach((t, i) => { c2.drawImage(images[i], t.dx, t.dy, 256, 256); if (images[i].close) images[i].close(); });
  // Mention de source obligatoire (Licence Ouverte) : coin bas-droit, sur fond blanc
  const A = C.attribution;
  c2.font = `${A.taille_px}px sans-serif`;
  const lt = c2.measureText(A.texte).width;
  c2.fillStyle = 'rgba(255,255,255,0.85)';
  c2.fillRect(L - lt - 2 * A.marge_px, H - A.taille_px - 2 * A.marge_px, lt + 2 * A.marge_px, A.taille_px + 2 * A.marge_px);
  c2.fillStyle = '#333333'; c2.textBaseline = 'bottom';
  c2.fillText(A.texte, L - lt - A.marge_px, H - A.marge_px);
  const blob = await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage de la carte impossible'))), 'image/jpeg', C.qualite_jpeg));
  return { blob, largeurPx: L, hauteurPx: H, nom_fichier: 'Plan de situation (IGN)', mime: 'image/jpeg', lat: g.lat, lon: g.lon, zoom: z };
}
