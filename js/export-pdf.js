/* export-pdf.js — export PDF vectoriel (pdf-lib).
 *
 * - Fond PDF : la page d'origine est copiée telle quelle (format, contenu), les
 *   objets sont dessinés par-dessus en vectoriel dans l'espace utilisateur PDF.
 * - Fond image / photo : page aux dimensions du plan, image embarquée.
 * - Les mêmes primitives que l'écran (symboles.js / legende.js) sont projetées ;
 *   le texte reste sélectionnable ; police DejaVu Sans embarquée (sous-ensemble).
 *
 * v1.3.5 — fiabilisation de l'export (correctif « The source image could not be decoded ») :
 *   1. le fond est relu depuis IndexedDB, jamais depuis le File du sélecteur Android,
 *      qui peut être devenu illisible après une veille ou un changement d'application ;
 *   2. le format d'image est reconnu par ses octets d'en-tête, pas par `blob.type`
 *      (un fichier venu du gestionnaire Android arrive souvent avec un type vide) ;
 *   3. si un décodage est malgré tout nécessaire, il utilise d'abord le bitmap
 *      déjà décodé par fond.js, puis trois replis successifs ;
 *   4. si la copie de la page PDF échoue, le fond est rastérisé par pdf.js et
 *      embarqué en JPEG : l'export produit toujours un fichier ;
 *   5. toute erreur résiduelle nomme l'étape fautive entre crochets.
 *
 * v1.4.0 — export découplé du projet ouvert (v14 §5.3) : primitivesExport(ctx) et exporterPdf(ctx, opts) lisent un
 * contexte (contexte-export.js) et plus jamais etat.projet / etat.plan / objets() / le fond de fond.js. Le bouton
 * Exporter du plan passe contexteCourant() : un seul chemin de code pour les deux usages.
 *
 * v1.4.5 — PDF multi-pages : exporterPdf(contextes, opts) accepte une LISTE de contextes (un par plan, même projet)
 * et produit un seul PDF, une page par plan, dans l'ordre. Un contexte seul reste accepté. Mutualisé sur tout le
 * document : création, police DejaVu (un seul sous-ensemble), mesureur ; chaque PDF source (fond_id) est lu et
 * analysé UNE fois, et ses pages sont copiées en un seul appel copyPages (ressources communes mutualisées par
 * pdf-lib). Par page : copie de la page source (ou repli rastérisé, v1.3.5), matrice, états de transparence,
 * primitives, textes. Une erreur nomme l'étape et, s'il y a plusieurs pages, la page : « [Tracé vectoriel — page 2/3] ».
 * Un projet d'un seul plan produit le même PDF qu'en v1.4.4.
 *
 * v1.4.6 — gras / italique des notes (§1) : DejaVu Sans Bold, Oblique et BoldOblique (même version 2.37 que la police
 * régulière) sont embarquées SEULEMENT si une note du document les utilise ; sans mise en forme, le PDF est produit
 * comme en v1.4.5. Le soulignement et la justification arrivent déjà sous forme de primitives. Images libres (§2) :
 * chaque fichier est embarqué une fois (JPEG / PNG tels quels, autre format via un canvas), dessiné en XObject dans
 * l'ordre des primitives, avec sa rotation et son opacité (ExtGState).
 *
 * v1.5.0 — descriptif des travaux (§2.11) : bloc sur la page du plan (entre les objets et la légende), ou page(s)
 * annexe(s) ajoutée(s) juste après la page du plan, au format A4 portrait (v1.5.1), marges 10 mm. Le tracé des primitives est mis en
 * commun (tracerPrimitives) entre la page du plan et les pages annexes, sans changement pour la page du plan. Gras et
 * italique embarqués aussi quand un descriptif les emploie.
 */
import { contexteCourant } from './contexte-export.js';
import { CHARTE } from './charte.js';
import { primitivesObjet, avecContexteRendu, segmentsNote } from './symboles.js';
import { prechargerImages, imageChargee, formatOctets } from './images.js';
import { cleOrdreZ } from './modele.js';
import { primitivesLegende } from './legende.js';
import { primitivesDescriptifPlan, pagesAnnexe } from './descriptif-rendu.js';
import { mettreAJourDescriptif } from './descriptif.js';
import { definirMesureur, mesurerTexte } from './primitives.js';

const URL_POLICE = new URL('../vendor/fonts/DejaVuSans.ttf', import.meta.url).href;
const URL_POLICES_STYLE = {   // v1.4.6 §1
  gras: new URL('../vendor/fonts/DejaVuSans-Bold.ttf', import.meta.url).href,
  italique: new URL('../vendor/fonts/DejaVuSans-Oblique.ttf', import.meta.url).href,
  gras_italique: new URL('../vendor/fonts/DejaVuSans-BoldOblique.ttf', import.meta.url).href
};

/* Styles de police utilisés par les notes mises en forme des contextes exportés : 'gras' | 'italique' | 'gras_italique'. */
function stylesUtilises(liste) {
  const s = new Set();
  // v1.5.0 : repères et titres du descriptif en gras ; mise en forme des lignes (gras, italique)
  for (const ctx of liste) {
    const d = ctx.plan && ctx.plan.descriptif;
    if (!d || d.visible === false) continue;
    s.add('gras');
    const lignes = [...d.entete.lignes, ...d.sections.flatMap((x) => [{ segments: [x.titre || []] }, ...x.entrees.flatMap((e) => e.lignes)])];
    for (const l of lignes) for (const sl of l.segments || []) for (const m of sl || []) { if (m.g && m.i) s.add('gras_italique'); else if (m.i) s.add('italique'); }
  }
  for (const ctx of liste) for (const o of ctx.objets || []) {
    if (o.type !== 'note') continue;
    const seg = segmentsNote(o);
    if (!seg) continue;
    for (const l of seg) for (const m of l) { if (m.g && m.i) s.add('gras_italique'); else if (m.g) s.add('gras'); else if (m.i) s.add('italique'); }
  }
  return s;
}
function cleStyle(p) { return p && p.gras ? (p.italique ? 'gras_italique' : 'gras') : (p && p.italique ? 'italique' : null); }

/* Côté maximal d'un canvas sur tablette : au-delà, Chrome rend un canvas vide. */
const COTE_MAX_CANVAS = 8192;

/* Couleur CSS → { r, g, b, a } (0..1). L'alpha n'est plus fusionné sur blanc :
 * il est porté par un ExtGState PDF, donc le fond de plan reste visible sous un
 * bloc translucide et sous un surlignage, à l'écran comme au tirage (v1.3.5). */
function couleurRgba(c) {
  if (!c) return null;
  let r = 0, g = 0, b = 0, a = 1;
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (hex) { const v = parseInt(hex[1], 16); r = (v >> 16) & 255; g = (v >> 8) & 255; b = v & 255; }
  else if (rgba) { const p = rgba[1].split(',').map((x) => parseFloat(x)); [r, g, b] = p; if (p.length > 3) a = p[3]; }
  else if (c === 'none') return null;
  if (!isFinite(a)) a = 1;
  return { r: r / 255, g: g / 255, b: b / 255, a: Math.max(0, Math.min(1, a)) };
}

/* États graphiques de transparence (/ExtGState) : un par couple (alpha de
 * remplissage, alpha de trait) rencontré, mutualisé sur toute la page. */
function fabriqueGs(doc, page) {
  const cache = new Map();
  return (aFond, aTrait) => {
    const cle = aFond.toFixed(3) + '/' + aTrait.toFixed(3);
    let nom = cache.get(cle);
    if (!nom) {
      nom = page.node.newExtGState('GStr', doc.context.obj({ Type: 'ExtGState', ca: aFond, CA: aTrait }));
      cache.set(cle, nom);
    }
    return nom;
  };
}

/* Toutes les primitives à exporter (objets visibles, étiquettes, descriptif, légende).
 * `descriptif` (v1.5.0) : 'selon_sortie' (PDF : absent de la page si envoyé en page annexe) | 'sur_plan' (PNG : la
 * page annexe n'existe qu'en PDF, le bloc visible est toujours dessiné sur le plan). */
export function primitivesExport(ctx = contexteCourant(), { descriptif = 'selon_sortie' } = {}) {
  const { plan, projet, objets } = ctx;
  return avecContexteRendu({ projet, objets }, () => {
    const prims = [];
    const tries = objets.map((o, i) => ({ o, i })).sort((a, b) => (CHARTE.ordre_z.indexOf(cleOrdreZ(a.o)) - CHARTE.ordre_z.indexOf(cleOrdreZ(b.o))) || a.i - b.i);
    for (const { o } of tries) {
      const calque = projet.calques[o.calque] || projet.calques.existant;
      if (!calque.visible) continue;
      if (o.type !== 'note' && o.type !== 'masque' && o.type !== 'annotation' && o.type !== 'image' && projet.filtre_domaines[o.domaine] === false) continue;
      const r = primitivesObjet(o, projet.reglages);
      prims.push(...r.corps);
      if (ctx.etiquettesVisibles) { prims.push(...r.etiquette); prims.push(...(r.materiel || [])); prims.push(...(r.cartouche || [])); }
    }
    if (plan.descriptif && plan.descriptif.visible !== false) prims.push(...primitivesDescriptifPlan(plan, projet, { ecran: descriptif === 'sur_plan' }));
    if (plan.legende && plan.legende.visible) prims.push(...primitivesLegende(plan, objets, projet.reglages));
    return prims;
  });
}

/* Inverse d'une matrice affine [a,b,c,d,e,f]. */
function inverser(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det || !isFinite(det)) throw new Error('matrice de page non inversible');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}
function appliquerM(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }

/* Exécute une étape en nommant l'erreur : « [Intégration du fond image] … ». */
async function etape(nom, fn) {
  try { return await fn(); }
  catch (e) {
    const msg = (e && e.message) || String(e);
    const err = new Error('[' + nom + '] ' + msg);
    err.cause = e;
    throw err;
  }
}

/* Blob du fond : la copie de la base fait foi (lu par le contexte). Le File rendu par le sélecteur de
 * fichiers Android pointe sur un content:// que le système peut invalider ; sa
 * lecture échoue alors bien plus tard, à l'export. */

/* Format réel d'une image d'après ses octets d'en-tête (le type MIME déclaré est
 * souvent vide ou faux sur Android). */
function formatImage(o) {
  if (!o || o.length < 12) return null;
  if (o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4E && o[3] === 0x47) return 'png';
  if (o[0] === 0xFF && o[1] === 0xD8 && o[2] === 0xFF) return 'jpeg';
  return null;   // webp, heic, gif, bmp… : passage par le canvas
}

/* Décodage d'un blob image, avec replis successifs. Retourne un ImageBitmap ou
 * un HTMLImageElement, tous deux acceptés par drawImage. */
async function decoderImage(blob, ctx) {
  const enMemoire = await ctx.bitmapDecode().catch(() => null);
  if (enMemoire && (enMemoire.width || enMemoire.naturalWidth)) return enMemoire;   // déjà décodé (plan ouvert) ou décodé par le contexte
  if (!blob) throw new Error('fond de plan absent de la base');
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* repli */ }
  try { return await createImageBitmap(blob); } catch (e) { /* repli */ }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image du fond illisible (format non pris en charge par la tablette)')); };
    img.src = url;
  });
}

/* Canvas → Blob JPEG (plus léger qu'un PNG en base64, qui sature la mémoire de la
 * tablette sur un plan de 5000 px de large). */
function canvasVersJpeg(cv, qualite = 0.92) {
  return new Promise((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('encodage JPEG impossible'))), 'image/jpeg', qualite);
  });
}

/* Rastérise le fond du contexte (PDF ou image) à `dpi` et renvoie les octets JPEG. */
async function rasteriserFond(ctxExport, largeurPlan, hauteurPlan, dpi) {
  let k = dpi / 72;
  const grandCote = Math.max(largeurPlan, hauteurPlan);
  if (grandCote * k > COTE_MAX_CANVAS) k = COTE_MAX_CANVAS / grandCote;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(largeurPlan * k));
  cv.height = Math.max(1, Math.round(hauteurPlan * k));
  const ctx = cv.getContext('2d', { alpha: false });
  await ctxExport.rendreFond(ctx, k, cv.width, cv.height);
  const blob = await canvasVersJpeg(cv);
  return new Uint8Array(await blob.arrayBuffer());
}

/* Export PDF d'un ou plusieurs plans (voir en-tête). Retourne un Blob application/pdf. */
export async function exporterPdf(ctxs, opts = {}) {
  // Compatibilité : exporterPdf({ progression }) (plan ouvert), exporterPdf(contexte, opts), exporterPdf([contextes], opts)
  if (!ctxs || (!Array.isArray(ctxs) && !ctxs.projet)) { opts = ctxs || {}; ctxs = [contexteCourant()]; }
  const liste = Array.isArray(ctxs) ? [...ctxs] : [ctxs];
  if (!liste.length) throw new Error('aucun plan à exporter');
  const { progression = () => {} } = opts;
  const L = window.PDFLib;
  if (!L) throw new Error('pdf-lib non chargé.');
  const n = liste.length;
  const nomPage = (i) => (n > 1 ? ' — page ' + (i + 1) + '/' + n : '');
  const prog = (i, m) => progression(n > 1 ? 'Page ' + (i + 1) + ' / ' + n + ' — ' + m : m);

  const doc = await L.PDFDocument.create();
  // v1.5.0 : descriptifs à jour (informations d'affaire, projet relu en base) — mise à jour idempotente
  for (const c of liste) { try { mettreAJourDescriptif(c.plan, c.projet); } catch (e) { console.warn('Descriptif non mis à jour', e); } }

  /* 1. Lecture des fonds, une fois par fichier (fond_id) ; copie des pages PDF, un appel par fichier source. */
  const blobs = new Map();                 // fond_id → Promise<Blob|null>
  const blobDe = (i) => {
    const ctx = liste[i], f = ctx.fond;
    if (!f) return Promise.resolve(null);
    const cle = f.fond_id || ('sans-id-' + i);
    if (!blobs.has(cle)) blobs.set(cle, Promise.resolve().then(() => ctx.blobFond()));
    return blobs.get(cle);
  };
  const copies = new Array(n).fill(null); // page copiée (PDFPage) par plan, null si repli nécessaire
  const parSource = new Map();             // fond_id → [indices de plans]
  liste.forEach((ctx, i) => {
    const f = ctx.fond;
    if (f && f.type === 'pdf' && f.transform_pdf && f.fond_id) {
      if (!parSource.has(f.fond_id)) parSource.set(f.fond_id, []);
      parSource.get(f.fond_id).push(i);
    }
  });
  for (const [, indices] of parSource) {
    prog(indices[0], 'Lecture du fond…');
    const blob = await etape('Lecture du fond' + nomPage(indices[0]), () => blobDe(indices[0]));
    if (!blob) continue;
    try {
      const src = await L.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      const nb = src.getPageCount();
      const pages = indices.map((i) => Math.min(Math.max(0, (liste[i].fond.page || 1) - 1), nb - 1));
      const copiees = await doc.copyPages(src, pages);
      indices.forEach((i, j) => { copies[i] = copiees[j]; });
    } catch (e) {
      console.warn('Copie de la page PDF impossible, repli sur un fond rastérisé :', e);
    }
  }

  /* 2. Police, une fois pour tout le document. */
  prog(0, 'Police et textes…');
  const police = await etape('Police', async () => {
    doc.registerFontkit(window.fontkit);
    const rep = await fetch(URL_POLICE);
    if (!rep.ok) throw new Error('DejaVuSans.ttf introuvable (' + rep.status + ')');
    return doc.embedFont(await rep.arrayBuffer(), { subset: true });
  });

  /* 2 bis (v1.4.6). Polices de style, seulement si des notes mises en forme les emploient ; images libres chargées. */
  const polices = { normal: police };
  for (const st of stylesUtilises(liste)) {
    polices[st] = await etape('Police ' + st.replace('_', ' '), async () => {
      const rep = await fetch(URL_POLICES_STYLE[st]);
      if (!rep.ok) throw new Error('police ' + st + ' introuvable (' + rep.status + ')');
      return doc.embedFont(await rep.arrayBuffer(), { subset: true });
    });
  }
  const policeDe = (p) => polices[cleStyle(p)] || police;
  await etape('Lecture des images', async () => { for (const ctx of liste) await prechargerImages(ctx.objets); });
  const imagesPdf = new Map();   // fond_id → Promise<PDFImage | null>, une fois pour tout le document

  /* 3. Pages, dans l'ordre des plans. */
  definirMesureur((t, taille, st) => policeDe(st).widthOfTextAtSize(nettoyer(t), taille));
  try {
    for (let i = 0; i < n; i++) await exporterPage(doc, L, liste[i], copies[i], police, {
      nomPage: nomPage(i),
      prog: (m) => prog(i, m),
      blob: () => blobDe(i),
      policeDe,
      imagesPdf
    });
  } finally {
    definirMesureur(mesureurCanvas);
  }

  const ctx0 = liste[0];
  doc.setTitle((ctx0.projet.nom || 'Plan') + (ctx0.projet.commune ? ' — ' + ctx0.projet.commune : ''));
  doc.setProducer('Réseaux HC');
  doc.setCreator('Réseaux HC — SIEEP-HC');
  progression('Écriture du PDF…');
  const octets = await etape('Enregistrement', () => doc.save({ useObjectStreams: true }));
  return new Blob([octets], { type: 'application/pdf' });
}

/* Une page du PDF pour un plan (contexte `ctx`). `copie` : page source déjà copiée dans `doc`, ou null (fond
 * image, plan sans fond, ou repli rastérisé d'un fond PDF non copiable). */
async function exporterPage(doc, L, ctx, copie, police, { nomPage, prog, blob, policeDe = () => police, imagesPdf = new Map() }) {
  const fond = ctx.fond;
  let page, M;   // M : plan → espace utilisateur PDF

  if (copie) {
    // Chemin normal : la page d'origine est reprise telle quelle, sans perte.
    prog('Préparation de la page…');
    page = doc.addPage(copie);
    M = inverser(fond.transform_pdf);
  } else {
    // Page neuve aux dimensions du plan : fond image, ou repli d'un fond PDF non copiable.
    const l = fond && fond.largeur ? fond.largeur : 1190;
    const h = fond && fond.hauteur ? fond.hauteur : 842;
    page = doc.addPage([l, h]);
    M = [1, 0, 0, -1, 0, h];

    if (fond && fond.type === 'image') {
      prog('Intégration de l’image…');
      const blobFond = await etape('Lecture du fond' + nomPage, blob);
      await etape('Intégration du fond image' + nomPage, async () => {
        let img = null;
        if (blobFond) {
          const octets = new Uint8Array(await blobFond.arrayBuffer());
          const fmt = formatImage(octets);
          if (fmt === 'png') img = await doc.embedPng(octets);
          else if (fmt === 'jpeg') img = await doc.embedJpg(octets);
        }
        if (!img) {
          // Format non reconnu : passage par le bitmap déjà décodé, sans relire le fichier.
          const src = await decoderImage(blobFond, ctx);
          const lp = src.width || src.naturalWidth, hp = src.height || src.naturalHeight;
          const k = Math.min(1, COTE_MAX_CANVAS / Math.max(lp, hp));
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(lp * k));
          cv.height = Math.max(1, Math.round(hp * k));
          const c2 = cv.getContext('2d', { alpha: false });
          c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, cv.width, cv.height);
          c2.drawImage(src, 0, 0, cv.width, cv.height);
          const jpg = await canvasVersJpeg(cv);
          img = await doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
        }
        page.drawImage(img, { x: 0, y: 0, width: l, height: h, opacity: fond.opacite ?? 1 });
      });
    } else if (fond && fond.type === 'pdf' && ctx.fondRendable()) {
      prog('Rendu du fond…');
      await etape('Rendu du fond PDF' + nomPage, async () => {
        const octets = await rasteriserFond(ctx, l, h, 200);
        const img = await doc.embedJpg(octets);
        page.drawImage(img, { x: 0, y: 0, width: l, height: h, opacity: fond.opacite ?? 1 });
      });
    }
  }

  let prims = [];
  await etape('Calcul des symboles' + nomPage, async () => { prims = primitivesExport(ctx); });

  // Images libres (v1.4.6 §2) : embarquées avant le tracé, une fois par fichier pour tout le document
  const xobjets = new Map();   // fond_id → nom de l'XObject sur cette page
  await etape('Intégration des images' + nomPage, async () => {
    for (const p of prims) {
      if (p.t !== 'image' || !p.fond_id || xobjets.has(p.fond_id)) continue;
      if (!imagesPdf.has(p.fond_id)) imagesPdf.set(p.fond_id, embarquerImage(doc, p.fond_id));
      const img = await imagesPdf.get(p.fond_id);
      if (img) xobjets.set(p.fond_id, page.node.newXObject('Image', img.ref));
    }
  });

  prog('Tracé des objets…');
  await tracerPrimitives(doc, L, page, M, prims, { nomPage, policeDe, xobjets });

  // v1.5.0 §2.11 : descriptif en page(s) annexe(s), juste après la page du plan (marges 10 mm) ;
  // v1.5.1 : toujours au format A4 portrait, quel que soit le format du plan (charte : descriptif.annexe.format_pt)
  const [l, h] = CHARTE.descriptif.annexe.format_pt;
  const annexes = pagesAnnexe(ctx.plan, ctx.projet, l, h);
  for (let k = 0; k < annexes.length; k++) {
    prog('Descriptif — page annexe ' + (k + 1) + '…');
    const pa = doc.addPage([l, h]);
    await tracerPrimitives(doc, L, pa, [1, 0, 0, -1, 0, h], annexes[k], { nomPage: nomPage + ' — descriptif', policeDe, xobjets: new Map() });
  }
}

/* Tracé vectoriel puis textes sélectionnables d'une liste de primitives sur une page (M : plan → espace PDF). */
async function tracerPrimitives(doc, L, page, M, prims, { nomPage = '', policeDe, xobjets = new Map() }) {
  await etape('Tracé vectoriel' + nomPage, async () => {
    const ops = [];
    const P = (p) => appliquerM(M, p);
    const gs = fabriqueGs(doc, page);
    let aFondCourant = 1, aTraitCourant = 1;
    /* Applique les alphas de la primitive courante ; ne réécrit l'ExtGState que s'ils changent. */
    const setAlpha = (aFond, aTrait) => {
      if (aFond === aFondCourant && aTrait === aTraitCourant) return;
      aFondCourant = aFond; aTraitCourant = aTrait;
      ops.push(L.setGraphicsState(gs(aFond, aTrait)));
    };
    const setCouleurTrait = (c) => { const k = couleurRgba(c); if (k) ops.push(L.setStrokingColor(L.rgb(k.r, k.g, k.b))); };
    const setCouleurFond = (c) => { const k = couleurRgba(c); if (k) ops.push(L.setFillingColor(L.rgb(k.r, k.g, k.b))); };
    const alphaDe = (c) => { const k = couleurRgba(c); return k ? k.a : 1; };
    ops.push(L.pushGraphicsState(), L.setLineJoin(L.LineJoinStyle.Round), L.setLineCap(L.LineCapStyle.Round));

    for (const p of prims) {
      switch (p.t) {
        case 'ligne': {
          const a = P({ x: p.x1, y: p.y1 }), b = P({ x: p.x2, y: p.y2 });
          setAlpha(1, alphaDe(p.couleur));
          setCouleurTrait(p.couleur);
          ops.push(L.setLineWidth(p.epaisseur), L.setDashPattern(p.tirete || [], 0), L.setLineCap(p.bout === 'butt' ? L.LineCapStyle.Butt : L.LineCapStyle.Round));
          ops.push(L.moveTo(a.x, a.y), L.lineTo(b.x, b.y), L.stroke());
          break;
        }
        case 'poly': {
          if (p.points.length < 2) break;
          const pts = p.points.map(P);
          ops.push(L.moveTo(pts[0].x, pts[0].y));
          for (let i = 1; i < pts.length; i++) ops.push(L.lineTo(pts[i].x, pts[i].y));
          if (p.ferme) ops.push(L.closePath());
          const trait = p.couleur && p.epaisseur > 0 && couleurRgba(p.couleur);
          const remplissage = p.remplissage && couleurRgba(p.remplissage);
          setAlpha(remplissage ? remplissage.a : 1, trait ? trait.a : 1);
          if (trait) { setCouleurTrait(p.couleur); ops.push(L.setLineWidth(p.epaisseur), L.setDashPattern(p.tirete || [], 0), L.setLineCap(L.LineCapStyle.Round)); }
          if (remplissage) setCouleurFond(p.remplissage);
          if (trait && remplissage) ops.push(L.fillAndStroke());
          else if (remplissage) ops.push(L.fill());
          else if (trait) ops.push(L.stroke());
          else ops.push(L.endPath());
          break;
        }
        case 'cercle': {
          const c = P({ x: p.cx, y: p.cy });
          const r = p.r * Math.hypot(M[0], M[1]);   // rayon à l'échelle (M est une similitude)
          const k = 0.5523 * r;
          ops.push(L.moveTo(c.x + r, c.y),
            L.appendBezierCurve(c.x + r, c.y + k, c.x + k, c.y + r, c.x, c.y + r),
            L.appendBezierCurve(c.x - k, c.y + r, c.x - r, c.y + k, c.x - r, c.y),
            L.appendBezierCurve(c.x - r, c.y - k, c.x - k, c.y - r, c.x, c.y - r),
            L.appendBezierCurve(c.x + k, c.y - r, c.x + r, c.y - k, c.x + r, c.y), L.closePath());
          const trait = p.couleur && p.epaisseur > 0 && couleurRgba(p.couleur);
          const remplissage = p.remplissage && couleurRgba(p.remplissage);
          setAlpha(remplissage ? remplissage.a : 1, trait ? trait.a : 1);
          if (trait) { setCouleurTrait(p.couleur); ops.push(L.setLineWidth(p.epaisseur), L.setDashPattern([], 0)); }
          if (remplissage) setCouleurFond(p.remplissage);
          if (trait && remplissage) ops.push(L.fillAndStroke()); else if (remplissage) ops.push(L.fill()); else if (trait) ops.push(L.stroke()); else ops.push(L.endPath());
          break;
        }
        case 'image': {
          // Carré unité de l'image (u vers la droite, v vers le haut) → plan (centre, taille, rotation) → page (M)
          const nom = xobjets.get(p.fond_id);
          if (!nom) break;
          const a = ((p.rotation || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
          const versPage = (u, v) => {
            const lx = (u - 0.5) * p.largeur, ly = (0.5 - v) * p.hauteur;
            return P({ x: p.cx + lx * cos - ly * sin, y: p.cy + lx * sin + ly * cos });
          };
          const o0 = versPage(0, 0), o1 = versPage(1, 0), o2 = versPage(0, 1);
          ops.push(L.pushGraphicsState());
          const op = Math.max(0, Math.min(1, p.opacite ?? 1));
          if (op < 1) ops.push(L.setGraphicsState(gs(op, op)));
          ops.push(L.concatTransformationMatrix(o1.x - o0.x, o1.y - o0.y, o2.x - o0.x, o2.y - o0.y, o0.x, o0.y));
          // v1.4.7 : image rognée = découpe `re W n` dans le carré unité de l'image (v vers le haut : le bas retiré b
          // est l'ordonnée de départ), puis XObject ENTIER — fichier embarqué inchangé, aucun réencodage.
          if (p.recadrage) { const r = p.recadrage; ops.push(L.rectangle(r.g, r.b, 1 - r.g - r.d, 1 - r.h - r.b), L.clip(), L.endPath()); }
          ops.push(L.drawObject(nom), L.popGraphicsState());
          break;
        }
        default: break;
      }
    }
    ops.push(L.popGraphicsState());
    page.pushOperators(...ops);
  });

  // Textes (sélectionnables) : direction calculée à travers M pour rester lisibles sur les pages tournées
  await etape('Textes' + nomPage, async () => {
    for (const p of prims) {
      if (p.t !== 'texte' || !p.texte) continue;
      const t = nettoyer(p.texte);
      const policeTexte = policeDe(p);   // v1.4.6 §1 : gras / italique ; régulier sinon (inchangé)
      const larg = policeTexte.widthOfTextAtSize(t, p.taille);
      const a = ((p.rotation || 0) * Math.PI) / 180;
      // ancre → point de départ (gauche de la ligne de base) dans le plan
      let dx = 0;
      if (p.ancre === 'milieu') dx = -larg / 2; else if (p.ancre === 'fin') dx = -larg;
      const depart = { x: p.x + Math.cos(a) * dx, y: p.y + Math.sin(a) * dx };
      const u = appliquerM(M, depart);
      const dir = { x: M[0] * Math.cos(a) + M[2] * Math.sin(a), y: M[1] * Math.cos(a) + M[3] * Math.sin(a) };
      const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
      const k = couleurRgba(p.couleur) || { r: 0, g: 0, b: 0, a: 1 };
      page.drawText(t, { x: u.x, y: u.y, size: p.taille, font: policeTexte, color: L.rgb(k.r, k.g, k.b), rotate: L.degrees(angle), opacity: k.a });
    }
  });
}

/* Image libre → image PDF (v1.4.6 §2). JPEG et PNG embarqués tels quels ; tout autre format repasse par un canvas. */
async function embarquerImage(doc, fond_id) {
  const e = imageChargee(fond_id);
  if (!e || !e.blob) return null;   // binaire absent : l'image est omise, le reste de la page est exporté
  const octets = new Uint8Array(await e.blob.arrayBuffer());
  const fmt = formatOctets(octets);
  if (fmt === 'png') return doc.embedPng(octets);
  if (fmt === 'jpeg') return doc.embedJpg(octets);
  const cv = document.createElement('canvas');
  cv.width = e.largeurPx; cv.height = e.hauteurPx;
  const c2 = cv.getContext('2d', { alpha: false });
  c2.fillStyle = '#FFFFFF'; c2.fillRect(0, 0, cv.width, cv.height);
  c2.drawImage(e.bitmap, 0, 0, cv.width, cv.height);
  const jpg = await canvasVersJpeg(cv);
  return doc.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
}

/* Caractères hors police : remplacés pour éviter une erreur d'encodage. */
function nettoyer(t) {
  return String(t).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').replace(/\t/g, ' ');
}

/* Mesureur écran (canvas + DejaVu Sans), défini par main.js ; conservé ici pour restauration. */
let mesureurCanvas = null;
export function definirMesureurCanvas(fn) { mesureurCanvas = fn; definirMesureur(fn); }
export { mesurerTexte };
