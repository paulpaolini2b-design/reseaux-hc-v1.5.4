/* contexte-export.js — contexte d'export découplé du projet ouvert (lot 1.4, v14 §5.3).
 *
 * Un contexte décrit TOUT ce que lisent les exports (PDF, PNG, .json) pour UN plan :
 *   { projet, plan, objets, fond, estOuvert, etiquettesVisibles,
 *     blobFond(), bitmapDecode(), fondRendable(), rendreFond(ctx2d, k, largeur, hauteur), fermer() }
 *
 * - contexteCourant() : plan affiché du projet ouvert, fond déjà chargé par fond.js (bouton Exporter, PNG).
 * - contextesProjetOuvert() (v1.4.5) : tous les plans du projet ouvert, dans l'ordre ; le plan affiché passe par
 *   contexteCourant(), les autres par des ressources propres. Le masquage des étiquettes (touche E) s'applique à
 *   toutes les pages.
 * - chargerContexteExport(id) : projet lu dans IndexedDB, CLONÉ et MIGRÉ en mémoire, jamais réécrit. Depuis la
 *   v1.4.5, renvoie la LISTE des contextes (un par plan), munie d'une méthode fermer() qui libère tout. Les variables
 *   de module de fond.js ne sont jamais touchées.
 *
 * Ressources partagées (v1.4.5) : les plans qui partagent un même fond_id (pages d'un même PDF) partagent le blob,
 * l'instance pdf.js et l'ImageBitmap — un PDF de 3 pages n'est lu et analysé qu'une fois. fermer() sur n'importe
 * quel contexte de la liste libère l'ensemble (idempotent).
 *
 * Un seul export à la fois (mémoire de la tablette) : reserverExport() / libererExport().
 */
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { etat } from './etat.js';
import { bd } from './bd.js';
import { cloner, migrerProjet } from './modele.js';
import { bitmapFond, pagePdfPrete, rendreDans, detruireDocPdf } from './fond.js';

const URL_POLICES = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href;
const URL_WASM = new URL('../vendor/pdfjs/wasm/', import.meta.url).href;
if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

let exportEnCours = false;

/* Réserve le créneau d'export. Retourne false si un export est déjà en préparation. */
export function reserverExport() {
  if (exportEnCours) return false;
  exportEnCours = true;
  return true;
}
export function libererExport() { exportEnCours = false; }
export function exportOccupe() { return exportEnCours; }

/* Contexte du projet ouvert : mêmes données que l'écran, fond rendu par fond.js. */
export function contexteCourant() {
  if (!etat.projet || !etat.plan) throw new Error('Aucun projet ouvert.');
  const plan = etat.plan;
  return {
    projet: etat.projet,
    plan,
    objets: plan.objets,
    fond: plan.fond || null,
    estOuvert: true,
    etiquettesVisibles: etat.etiquettesVisibles,
    async blobFond() {
      const f = plan.fond;
      if (f && f.fond_id) {
        try { const enreg = await bd.get('fonds', f.fond_id); if (enreg && enreg.blob) return enreg.blob; } catch (e) { /* base indisponible */ }
      }
      return etat.fondBlob || null;
    },
    async bitmapDecode() { const b = bitmapFond(); return b && b.width ? b : null; },
    fondRendable() { return pagePdfPrete() || !!bitmapFond(); },
    rendreFond: (ctx2d, k, largeur, hauteur) => rendreDans(ctx2d, k, largeur, hauteur),
    fermer() { /* rien à libérer : les ressources appartiennent à fond.js */ }
  };
}

/* Ressources partagées entre les contextes d'un même export : une entrée par fond_id. */
function creerRessources() {
  const parFond = new Map();   // fond_id → { blob, doc, bitmap, promesses }
  let ferme = false;
  const entree = (id) => { if (!parFond.has(id)) parFond.set(id, {}); return parFond.get(id); };
  return {
    async blob(fond) {
      if (!fond || !fond.fond_id) return null;
      const e = entree(fond.fond_id);
      if (!e.pBlob) e.pBlob = bd.get('fonds', fond.fond_id).then((f) => (f && f.blob ? f.blob : null));
      return e.pBlob;
    },
    async doc(fond) {
      const e = entree(fond.fond_id);
      if (!e.pDoc) {
        e.pDoc = (async () => {
          const b = await this.blob(fond);
          if (!b) throw new Error('fond de plan absent de la base');
          const donnees = new Uint8Array(await b.arrayBuffer());
          e.doc = await pdfjs.getDocument({ data: donnees, standardFontDataUrl: URL_POLICES, wasmUrl: URL_WASM, isEvalSupported: false }).promise;
          return e.doc;
        })();
      }
      return e.pDoc;
    },
    async bitmap(fond) {
      const e = entree(fond.fond_id);
      if (!e.pBitmap) {
        e.pBitmap = (async () => {
          const b = await this.blob(fond);
          if (!b) throw new Error('fond de plan absent de la base');
          try { e.bitmap = await createImageBitmap(b, { imageOrientation: 'from-image' }); return e.bitmap; } catch (err) { /* repli */ }
          try { e.bitmap = await createImageBitmap(b); return e.bitmap; } catch (err) { /* repli */ }
          // Dernier repli : élément <img>, converti en ImageBitmap pour pouvoir être libéré de la même façon.
          const img = await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(b);
            const el = new Image();
            el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
            el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image du fond illisible (format non pris en charge par la tablette)')); };
            el.src = url;
          });
          try { e.bitmap = await createImageBitmap(img); return e.bitmap; } catch (err) { return img; }
        })();
      }
      return e.pBitmap;
    },
    fermer() {
      if (ferme) return;
      ferme = true;
      for (const e of parFond.values()) {
        if (e.doc) detruireDocPdf(e.doc);
        if (e.bitmap && e.bitmap.close) { try { e.bitmap.close(); } catch (err) { /* ignore */ } }
        e.doc = null; e.bitmap = null; e.pBlob = null; e.pDoc = null; e.pBitmap = null;
      }
      parFond.clear();
    }
  };
}

/* Contexte d'un plan dont le fond est lu par des ressources propres à l'export. */
function contextePlan(projet, plan, ressources, { estOuvert = false, etiquettesVisibles = true } = {}) {
  const fond = plan.fond || null;
  let pagePdf = null;
  const page = async () => {
    if (pagePdf) return pagePdf;
    const doc = await ressources.doc(fond);
    const n = Math.min(Math.max(1, fond.page || 1), doc.numPages);
    pagePdf = await doc.getPage(n);
    return pagePdf;
  };
  return {
    projet,
    plan,
    objets: plan.objets,
    fond,
    estOuvert,
    etiquettesVisibles,
    blobFond: () => ressources.blob(fond),
    bitmapDecode: async () => (fond && fond.type === 'image' ? ressources.bitmap(fond) : null),
    fondRendable() { return !!(fond && fond.fond_id); },
    async rendreFond(ctx2d, k, largeur, hauteur) {
      ctx2d.fillStyle = '#FFFFFF';
      ctx2d.fillRect(0, 0, largeur, hauteur);
      if (!fond) return;
      ctx2d.globalAlpha = fond.opacite ?? 1;
      try {
        if (fond.type === 'pdf') {
          const pg = await page();
          const viewport = pg.getViewport({ scale: k });
          await pg.render({ canvasContext: ctx2d, viewport }).promise;
        } else {
          const src = await ressources.bitmap(fond);
          const lp = src.width || src.naturalWidth, hp = src.height || src.naturalHeight;
          const si = fond.echelle_image || (1190 / Math.max(lp, hp));
          ctx2d.setTransform(k * si, 0, 0, k * si, 0, 0);
          ctx2d.drawImage(src, 0, 0);
          ctx2d.setTransform(1, 0, 0, 1, 0, 0);
        }
      } finally {
        ctx2d.globalAlpha = 1;
      }
    },
    fermer() { pagePdf = null; ressources.fermer(); }
  };
}

/* Liste de contextes munie de fermer() (libère toutes les ressources partagées). */
function liste(contextes, ressources) {
  contextes.fermer = () => { for (const c of contextes) { try { c.fermer(); } catch (e) { /* ignore */ } } ressources.fermer(); };
  return contextes;
}

/* Tous les plans du projet ouvert, dans l'ordre (export PDF du plan ouvert, v1.4.5). Le plan affiché garde le fond
 * déjà chargé par fond.js ; le masquage des étiquettes de la session s'applique à toutes les pages. */
export function contextesProjetOuvert() {
  if (!etat.projet || !etat.plan) throw new Error('Aucun projet ouvert.');
  const ressources = creerRessources();
  const projet = etat.projet;
  const opts = { estOuvert: true, etiquettesVisibles: etat.etiquettesVisibles };
  return liste(projet.plans.map((plan) => (plan === etat.plan ? contexteCourant() : contextePlan(projet, plan, ressources, opts))), ressources);
}

/* Contextes d'un projet quelconque, lu en base (un par plan, dans l'ordre). `idProjet` peut être le projet ouvert :
 * il est alors sauvegardé d'abord par l'appelant, puis relu en base comme les autres. */
export async function chargerContexteExport(idProjet) {
  const enreg = await bd.get('projets', idProjet);
  if (!enreg) throw new Error('Projet introuvable sur la tablette.');
  const projet = migrerProjet(cloner(enreg));
  const ressources = creerRessources();
  // v14 §5.2 : le masquage par E est un réglage de session du plan ouvert ; hors plan ouvert, étiquettes visibles.
  return liste(projet.plans.map((plan) => contextePlan(projet, plan, ressources, { estOuvert: false, etiquettesVisibles: true })), ressources);
}
