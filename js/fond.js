/* fond.js — fond de plan : PDF (pdf.js), image ou photo de l'appareil.
 *
 * Le fond est dessiné dans un <canvas> qui couvre la zone de plan. Pendant un
 * geste (zoom, déplacement) le canvas est simplement transformé en CSS, puis le
 * fond est re-rendu à la résolution réelle de l'écran 180 ms après le dernier
 * mouvement : le zoom est net (pas d'agrandissement bitmap).
 *
 * v1.4.5 — PDF multi-pages, un plan par page :
 * - un fichier n'est stocké qu'une fois (magasin `fonds`) ; plusieurs plans peuvent partager son `fond_id`, chacun
 *   avec sa page, ses dimensions, sa matrice et ses calibrations ;
 * - l'import se fait en deux temps : analyserFichier() lit le fichier sans rien écrire (nombre de pages), puis
 *   enregistrerAnalyse() écrit le blob une seule fois, après les choix de l'utilisateur ;
 * - le changement de plan prépare le fond du nouveau plan SANS toucher à l'affichage (preparerFondPlan), puis le
 *   bascule d'un bloc, de façon synchrone (appliquerFondPrepare) : les objets d'un plan ne s'affichent jamais sur le
 *   fond d'un autre. Un plan qui partage le document pdf.js déjà ouvert ne recharge que sa page ;
 * - changerPage() et nombrePages() sont supprimés : changer la page d'un plan sans déplacer ses objets produisait
 *   le défaut corrigé par cette version (objets de la page 1 affichés sur la page 2).
 */
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { etat, emettre, notifier } from './etat.js';
import { vue, tailleEcran } from './vue.js';
import { bd } from './bd.js';
import { genererId } from './modele.js';
import { CHARTE } from './charte.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const URL_POLICES = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href;
const URL_WASM = new URL('../vendor/pdfjs/wasm/', import.meta.url).href;

let canvas, ctx;
let docPdf = null;        // PDFDocumentProxy du fond affiché
let pagePdf = null;       // PDFPageProxy affichée
let imageBitmap = null;   // ImageBitmap du fond affiché
let fondIdOuvert = null;  // fond_id du document (ou de l'image) actuellement en mémoire
let tacheRendu = null;    // RenderTask pdf.js en cours
let minuterie = null;
let dernierRendu = null;  // { k, tx, ty, dpr } du dernier rendu abouti
let jeton = 0;
let enAttente = null;     // analyse d'import enregistrée, pas encore affichée : son document est adopté sans relecture

export function initialiserFond() {
  canvas = document.getElementById('fond-canvas');
  ctx = canvas.getContext('2d', { alpha: false });
  window.addEventListener('resize', () => { tailleEcran(); programmerRendu(0); });
}

/* Détecte le type de fichier. */
function typeFichier(fichier) {
  if (fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name || '')) return 'pdf';
  if ((fichier.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(fichier.name || '')) return 'image';
  return null;
}

async function ouvrirDocument(blob) {
  const donnees = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data: donnees, standardFontDataUrl: URL_POLICES, wasmUrl: URL_WASM, isEvalSupported: false }).promise;
}

async function decoderBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) { return createImageBitmap(blob); }
}

/* Dimensions d'une page PDF en unités plan (points), rotation et matrice espace utilisateur PDF → plan. */
async function infosPageDoc(doc, k) {
  const pg = await doc.getPage(k);
  const vp = pg.getViewport({ scale: 1 });
  return { page: k, largeur: vp.width, hauteur: vp.height, rotation: pg.rotate || 0, transform_pdf: Array.from(vp.transform) };
}

/* Image normalisée : le grand côté vaut 1190 unités plan (long côté A3 en points), pour que les symboles gardent
 * une taille « papier » quelle que soit la résolution. */
function infosImage(bitmap) {
  const s = 1190 / Math.max(bitmap.width, bitmap.height);
  return { page: 1, largeur: bitmap.width * s, hauteur: bitmap.height * s, rotation: 0, transform_pdf: null, echelle_image: s };
}

/* ---------- Import en deux temps ---------- */

/* Lit un fichier choisi par l'utilisateur, sans rien écrire. Retourne une analyse :
 * { fond_id, type, nom_fichier, nb_pages, blob, photo } (document ou bitmap gardés en mémoire pour la suite).
 * À conclure par enregistrerAnalyse() ou abandonnerAnalyse(). */
export async function analyserFichier(fichier, { photo = false } = {}) {
  const type = typeFichier(fichier);
  if (!type) throw new Error('Format non pris en charge : utilisez un PDF ou une image.');
  const a = { fond_id: genererId('fd'), type, nom_fichier: fichier.name || (photo ? 'photo.jpg' : 'fond'), nb_pages: 1, blob: fichier, photo, doc: null, bitmap: null, adopte: false };
  if (type === 'pdf') {
    a.doc = await ouvrirDocument(fichier);
    a.nb_pages = a.doc.numPages;
  } else {
    a.bitmap = await decoderBitmap(fichier);
  }
  return a;
}

/* Dimensions des pages demandées (liste d'objets prêts pour plans-calcul.js → fondPourPage). */
export async function infosPagesAnalyse(a, pages) {
  if (a.type !== 'pdf') return [infosImage(a.bitmap)];
  const r = [];
  for (const k of pages) r.push(await infosPageDoc(a.doc, k));
  return r;
}

/* Écrit le fichier dans la base (une seule fois, quel que soit le nombre de plans qui l'utiliseront).
 * Son document reste en mémoire : le premier plan affiché l'adopte sans relire le fichier. */
export async function enregistrerAnalyse(a) {
  await bd.put('fonds', { id: a.fond_id, blob: a.blob, type: a.type, nom_fichier: a.nom_fichier });
  if (enAttente && enAttente !== a) abandonnerAnalyse(enAttente);
  enAttente = a;
}

/* Libère les ressources d'une analyse non adoptée (import annulé ou remplacé). */
export function abandonnerAnalyse(a) {
  if (!a || a.adopte) return;
  if (a.doc) detruireDocPdf(a.doc);
  if (a.bitmap && a.bitmap.close) { try { a.bitmap.close(); } catch (e) { /* ignore */ } }
  a.doc = null; a.bitmap = null;
  if (enAttente === a) enAttente = null;
}

/* Dimensions de pages d'un fond PDF déjà enregistré (répartition des pages d'un projet existant).
 * Réutilise le document affiché s'il s'agit du même fichier ; sinon ouvre et libère une instance temporaire. */
export async function infosPagesFond(fond, pages) {
  if (!fond || fond.type !== 'pdf') throw new Error('le fond de ce plan n’est pas un PDF');
  if (docPdf && fondIdOuvert === fond.fond_id) {
    const r = [];
    for (const k of pages) r.push(await infosPageDoc(docPdf, k));
    return r;
  }
  const enreg = await bd.get('fonds', fond.fond_id);
  if (!enreg || !enreg.blob) throw new Error('fond de plan absent de la base');
  const doc = await ouvrirDocument(enreg.blob);
  try {
    const r = [];
    for (const k of pages) r.push(await infosPageDoc(doc, k));
    return r;
  } finally { detruireDocPdf(doc); }
}

/* ---------- Préparation / bascule du fond d'un plan ---------- */

/* Prépare le fond de `plan` sans modifier l'affichage. Retourne une préparation à passer à appliquerFondPrepare(). */
export async function preparerFondPlan(plan) {
  const f = plan && plan.fond;
  if (!f || !f.fond_id) return { vide: true };
  // Même fichier que celui affiché : on garde le document, seule la page change.
  if (fondIdOuvert === f.fond_id) {
    if (f.type === 'pdf' && docPdf) {
      const n = Math.min(Math.max(1, f.page || 1), docPdf.numPages);
      return { fond_id: f.fond_id, type: 'pdf', doc: docPdf, page: await docPdf.getPage(n), numPages: docPdf.numPages, blob: etat.fondBlob, reutilise: true };
    }
    if (f.type === 'image' && imageBitmap) return { fond_id: f.fond_id, type: 'image', bitmap: imageBitmap, blob: etat.fondBlob, reutilise: true };
  }
  // Fichier que l'on vient d'importer : document adopté tel quel.
  if (enAttente && enAttente.fond_id === f.fond_id && (enAttente.doc || enAttente.bitmap)) {
    const a = enAttente;
    if (a.type === 'pdf') {
      const n = Math.min(Math.max(1, f.page || 1), a.doc.numPages);
      return { fond_id: f.fond_id, type: 'pdf', doc: a.doc, page: await a.doc.getPage(n), numPages: a.doc.numPages, blob: a.blob, analyse: a };
    }
    return { fond_id: f.fond_id, type: 'image', bitmap: a.bitmap, blob: a.blob, analyse: a };
  }
  // Autre fichier : lecture en base.
  const enreg = await bd.get('fonds', f.fond_id);
  if (!enreg || !enreg.blob) return { vide: true, introuvable: true };
  if (f.type === 'pdf') {
    const doc = await ouvrirDocument(enreg.blob);
    const n = Math.min(Math.max(1, f.page || 1), doc.numPages);
    let page;
    try { page = await doc.getPage(n); } catch (e) { detruireDocPdf(doc); throw e; }
    return { fond_id: f.fond_id, type: 'pdf', doc, page, numPages: doc.numPages, blob: enreg.blob };
  }
  return { fond_id: f.fond_id, type: 'image', bitmap: await decoderBitmap(enreg.blob), blob: enreg.blob };
}

/* Abandonne une préparation qui ne sera pas appliquée (ne libère jamais ce qui est affiché ni une analyse). */
export function abandonnerPreparation(prep) {
  if (!prep || prep.vide || prep.reutilise || prep.analyse) return;
  if (prep.doc) detruireDocPdf(prep.doc);
  if (prep.bitmap && prep.bitmap.close) { try { prep.bitmap.close(); } catch (e) { /* ignore */ } }
}

/* Bascule synchrone de l'affichage sur une préparation. `plan` : plan dont le fond est préparé (ses dimensions sont
 * relues sur la page, comme à l'ouverture d'un projet). Le canvas est effacé et tout rendu en cours est invalidé :
 * l'ancienne page ne peut plus s'afficher sous les objets du nouveau plan. */
export function appliquerFondPrepare(prep, plan) {
  if (tacheRendu) { try { tacheRendu.cancel(); } catch (e) { /* ignore */ } tacheRendu = null; }
  jeton++;
  dernierRendu = null;
  const garderDoc = prep && prep.doc && prep.doc === docPdf;
  const garderImage = prep && prep.bitmap && prep.bitmap === imageBitmap;
  if (docPdf && !garderDoc) detruireDocPdf(docPdf);
  if (imageBitmap && !garderImage && imageBitmap.close) { try { imageBitmap.close(); } catch (e) { /* ignore */ } }
  docPdf = null; pagePdf = null; imageBitmap = null; fondIdOuvert = null;
  if (!prep || prep.vide) {
    etat.fondBlob = null;
    effacer();
    return;
  }
  if (prep.analyse) { prep.analyse.adopte = true; if (enAttente === prep.analyse) enAttente = null; }
  fondIdOuvert = prep.fond_id;
  etat.fondBlob = prep.blob || null;
  const f = plan && plan.fond;
  if (prep.type === 'pdf') {
    docPdf = prep.doc;
    pagePdf = prep.page;
    if (f) {
      const vp = pagePdf.getViewport({ scale: 1 });
      f.nb_pages = prep.numPages;
      f.page = pagePdf.pageNumber || f.page;
      f.largeur = vp.width;
      f.hauteur = vp.height;
      f.rotation = pagePdf.rotate || 0;
      f.transform_pdf = Array.from(vp.transform);   // espace utilisateur PDF → coordonnées plan
    }
  } else {
    imageBitmap = prep.bitmap;
    if (f) {
      const i = infosImage(imageBitmap);
      f.echelle_image = i.echelle_image; f.largeur = i.largeur; f.hauteur = i.hauteur; f.nb_pages = 1;
    }
  }
  effacer();
}

/* Recharge le fond du plan courant depuis la base (ouverture d'un projet). */
export async function ouvrirFondProjet() {
  const plan = etat.plan;
  let prep;
  try { prep = await preparerFondPlan(plan); }
  catch (e) { console.error('Fond de plan illisible', e); prep = { vide: true, introuvable: true }; }
  appliquerFondPrepare(prep, plan);
  if (prep.introuvable) notifier('Fond de plan introuvable dans la base : à recharger.');
  emettre('fond', prep.vide ? null : plan.fond);
  appliquerVisibiliteCalqueFond();
  programmerRendu(0);
}

/* fond_id du fichier actuellement en mémoire (null sans fond). */
export function fondOuvert() { return fondIdOuvert; }

export function reglerOpacite(v) {
  if (!etat.plan || !etat.plan.fond) return;
  etat.plan.fond.opacite = v;
  canvas.style.opacity = String(v * ((etat.projet && etat.projet.calques.fond.opacite) || 1));
  emettre('fond', etat.plan.fond);
}

export function appliquerVisibiliteCalqueFond() {
  if (!etat.projet) return;
  const c = etat.projet.calques.fond;
  canvas.style.display = c.visible ? '' : 'none';
  const op = etat.plan && etat.plan.fond ? etat.plan.fond.opacite : 1;
  canvas.style.opacity = String(op * c.opacite);
}

/* Libère un document pdf.js. La version embarquée n'expose pas PDFDocumentProxy.destroy() : c'est la tâche de
 * chargement qui se détruit. L'ancien appel direct levait « docPdf.destroy is not a function » et interrompait
 * l'ouverture d'un projet après un projet à fond PDF (défaut v1.3.5, corrigé en v1.4.0, H-160). */
export function detruireDocPdf(doc) {
  if (!doc) return;
  try {
    if (typeof doc.destroy === 'function') doc.destroy();
    else if (doc.loadingTask && typeof doc.loadingTask.destroy === 'function') doc.loadingTask.destroy();
  } catch (e) { console.warn('Libération du PDF', e); }
}

function effacer() {
  if (!canvas) return;
  canvas.style.transform = '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* Appelé à chaque changement de vue : transforme le canvas en CSS puis programme un rendu. */
export function surChangementVue() {
  if (dernierRendu) {
    const f = vue.k / dernierRendu.k;
    const tx = vue.tx - dernierRendu.tx * f;
    const ty = vue.ty - dernierRendu.ty * f;
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${f})`;
  }
  programmerRendu(180);
}

export function programmerRendu(delai) {
  clearTimeout(minuterie);
  minuterie = setTimeout(rendre, delai);
}

/* Rendu du fond à la résolution de l'écran pour la vue courante. */
async function rendre() {
  if (!canvas) return;
  tailleEcran();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const l = Math.round(vue.largeurEcran * dpr), h = Math.round(vue.hauteurEcran * dpr);
  const cible = { k: vue.k, tx: vue.tx, ty: vue.ty, dpr };
  const monJeton = ++jeton;

  if (!docPdf && !imageBitmap) { canvas.width = l; canvas.height = h; effacer(); return; }

  // Rendu hors écran puis copie : évite le scintillement pendant le rendu PDF.
  const hors = document.createElement('canvas');
  hors.width = l; hors.height = h;
  const hctx = hors.getContext('2d', { alpha: false });
  hctx.fillStyle = '#FFFFFF';
  hctx.fillRect(0, 0, l, h);

  if (pagePdf) {
    if (tacheRendu) { try { tacheRendu.cancel(); } catch (e) { /* ignore */ } }
    const viewport = pagePdf.getViewport({ scale: vue.k * dpr, offsetX: vue.tx * dpr, offsetY: vue.ty * dpr });
    try {
      tacheRendu = pagePdf.render({ canvasContext: hctx, viewport, background: 'rgba(255,255,255,1)' });
      await tacheRendu.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      console.error('Rendu PDF :', e);
      return;
    }
    tacheRendu = null;
  } else if (imageBitmap) {
    const si = etat.plan.fond.echelle_image || 1;
    hctx.setTransform(vue.k * dpr * si, 0, 0, vue.k * dpr * si, vue.tx * dpr, vue.ty * dpr);
    hctx.imageSmoothingEnabled = true;
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(imageBitmap, 0, 0);
    hctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (monJeton !== jeton) return;   // une vue plus récente est arrivée entre-temps

  canvas.width = l; canvas.height = h;
  canvas.style.width = vue.largeurEcran + 'px';
  canvas.style.height = vue.hauteurEcran + 'px';
  ctx.drawImage(hors, 0, 0);
  dernierRendu = cible;
  // La vue peut avoir bougé pendant le rendu : on recale en CSS.
  const f = vue.k / cible.k;
  canvas.style.transform = (f === 1 && vue.tx === cible.tx && vue.ty === cible.ty) ? '' :
    `translate(${vue.tx - cible.tx * f}px, ${vue.ty - cible.ty * f}px) scale(${f})`;
}

/* Rendu du fond dans un canvas fourni (export PNG). k : unités plan → pixels. */
export async function rendreDans(ctxCible, k, largeur, hauteur) {
  ctxCible.fillStyle = '#FFFFFF';
  ctxCible.fillRect(0, 0, largeur, hauteur);
  const op = etat.plan && etat.plan.fond ? etat.plan.fond.opacite : 1;
  ctxCible.globalAlpha = op;
  if (pagePdf) {
    const viewport = pagePdf.getViewport({ scale: k });
    await pagePdf.render({ canvasContext: ctxCible, viewport }).promise;
  } else if (imageBitmap) {
    const si = etat.plan.fond.echelle_image || 1;
    ctxCible.setTransform(k * si, 0, 0, k * si, 0, 0);
    ctxCible.drawImage(imageBitmap, 0, 0);
    ctxCible.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctxCible.globalAlpha = 1;
}

export function fondPresent() { return !!(pagePdf || imageBitmap); }

/* Bitmap du fond image déjà décodé en mémoire (null pour un fond PDF).
 * Exposé pour l'export : le blob d'origine peut être devenu indécodable
 * (fichier Android content:// libéré, format exotique), alors que ce bitmap,
 * décodé une seule fois à l'ouverture, reste valide. (v1.3.5) */
export function bitmapFond() { return imageBitmap; }

/* Vrai si la page PDF du fond est chargée et rendable par pdf.js (repli d'export). */
export function pagePdfPrete() { return !!pagePdf; }

/* Pipette (v13.3 §4.3) : couleur du fond de plan sous un point, donné en coordonnées PLAN.
 * La conversion passe par `dernierRendu` (la vue au moment du dernier rendu abouti) et non par la vue courante :
 * pendant un geste le canvas porte encore une transformation CSS, ses pixels correspondent à l'ancienne vue.
 * Moyenne un carré de `charte.masque.pipette.echantillon_px` pixels : sur un PDF cadastral rastérisé, un pixel
 * isolé tombe souvent sur un bord antialiasé et rend une teinte fausse.
 * Retourne { couleur: '#RRGGBB' } ou { erreur: 'absent' | 'illisible' } — jamais d'exception. */
export function couleurAuPoint(pointPlan) {
  if (!canvas || !ctx || !fondPresent() || !dernierRendu || !pointPlan) return { erreur: 'absent' };
  const d0 = dernierRendu;
  const cx = Math.round((pointPlan.x * d0.k + d0.tx) * d0.dpr);
  const cy = Math.round((pointPlan.y * d0.k + d0.ty) * d0.dpr);
  const n = Math.max(1, CHARTE.masque.pipette.echantillon_px);
  if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return { erreur: 'absent' };
  const x0 = Math.max(0, Math.min(canvas.width - n, cx - (n >> 1)));
  const y0 = Math.max(0, Math.min(canvas.height - n, cy - (n >> 1)));
  let d;
  try { d = ctx.getImageData(x0, y0, n, n).data; }
  catch (e) { return { erreur: 'illisible' }; }   // canvas souillé (SecurityError) : fond d'une autre origine
  let r0 = 0, g0 = 0, b0 = 0;
  const px = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; }
  const hex = (v) => Math.round(v / px).toString(16).padStart(2, '0').toUpperCase();
  return { couleur: '#' + hex(r0) + hex(g0) + hex(b0) };
}
