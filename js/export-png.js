/* export-png.js — export PNG : fond rendu à la résolution demandée + primitives
 * projetées sur le canvas (même description géométrique que l'écran et le PDF).
 * v1.4.0 : lit un contexte d'export (contexte-export.js) ; le PNG n'est proposé que depuis le plan ouvert (v14 §5.2).
 */
import { CHARTE } from './charte.js';
import { primitivesExport } from './export-pdf.js';
import { contexteCourant } from './contexte-export.js';
import { prechargerImages, imageChargee } from './images.js';
import { mettreAJourDescriptif } from './descriptif.js';

/* Étendue du plan d'un contexte : dimensions du fond, sinon feuille virtuelle A3 paysage (comme vue.js → etenduePlan). */
function etendueContexte(ctx) {
  const plan = ctx.plan;
  if (plan && plan.fond && plan.fond.largeur) return { x: 0, y: 0, l: plan.fond.largeur, h: plan.fond.hauteur };
  return { x: 0, y: 0, l: 1190, h: 842 };
}

/* dpi : résolution équivalente (72 = 1 pixel par unité plan). */
export async function exporterPng(ctx, opts = {}) {
  if (!ctx || !ctx.projet) { opts = ctx || {}; ctx = contexteCourant(); }   // compatibilité : exporterPng({ dpi, progression })
  const { dpi = 200, progression = () => {} } = opts;
  const e = etendueContexte(ctx);
  const k = dpi / 72;
  const MAX = 8192;   // limite de sécurité des canvas sur tablette
  const kEff = Math.min(k, MAX / Math.max(e.l, e.h));
  const l = Math.round(e.l * kEff), h = Math.round(e.h * kEff);
  const cv = document.createElement('canvas');
  cv.width = l; cv.height = h;
  const c2 = cv.getContext('2d');
  progression('Lecture du fond…');
  await ctx.rendreFond(c2, kEff, l, h);
  progression('Tracé des objets…');
  await prechargerImages(ctx.objets);   // v1.4.6 §2 : images libres lues avant le tracé
  c2.setTransform(kEff, 0, 0, kEff, -e.x * kEff, -e.y * kEff);
  try { mettreAJourDescriptif(ctx.plan, ctx.projet); } catch (err) { console.warn('Descriptif non mis à jour', err); }
  dessinerPrimsCanvas(c2, primitivesExport(ctx, { descriptif: 'sur_plan' }));   // v1.5.0 : pas de page annexe en PNG
  c2.setTransform(1, 0, 0, 1, 0, 0);
  progression('Écriture du PNG…');
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('encodage PNG impossible (plan trop grand pour la mémoire de la tablette)');
  return blob;
}

export function dessinerPrimsCanvas(ctx, prims) {
  ctx.lineJoin = 'round';
  for (const p of prims) {
    switch (p.t) {
      case 'ligne':
        if (!p.couleur) break;
        ctx.strokeStyle = p.couleur; ctx.lineWidth = p.epaisseur; ctx.lineCap = p.bout === 'butt' ? 'butt' : 'round';
        ctx.setLineDash(p.tirete || []);
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        break;
      case 'poly':
        if (p.points.length < 2) break;
        ctx.beginPath(); ctx.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
        if (p.ferme) ctx.closePath();
        if (p.remplissage) { ctx.fillStyle = p.remplissage; ctx.fill(); }
        if (p.couleur && p.epaisseur > 0) { ctx.strokeStyle = p.couleur; ctx.lineWidth = p.epaisseur; ctx.lineCap = 'round'; ctx.setLineDash(p.tirete || []); ctx.stroke(); }
        break;
      case 'cercle':
        ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        if (p.remplissage) { ctx.fillStyle = p.remplissage; ctx.fill(); }
        if (p.couleur && p.epaisseur > 0) { ctx.strokeStyle = p.couleur; ctx.lineWidth = p.epaisseur; ctx.setLineDash([]); ctx.stroke(); }
        break;
      case 'texte': {
        ctx.save();
        ctx.font = `${p.italique ? 'italic ' : ''}${p.gras ? 'bold ' : ''}${p.taille}px ${CHARTE.texte.police}`;   // v1.4.6 §1
        ctx.fillStyle = p.couleur;
        ctx.textAlign = p.ancre === 'milieu' ? 'center' : (p.ancre === 'fin' ? 'right' : 'left');
        ctx.textBaseline = 'alphabetic';
        ctx.translate(p.x, p.y);
        if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillText(p.texte, 0, 0);
        ctx.restore();
        break;
      }
      case 'image': {
        // Image libre (v1.4.6 §2) : centre, rotation, opacité ; absente du cache = omise ; rognée : rectangle source (v1.4.7)
        const img = imageChargee(p.fond_id);
        if (!img || !img.bitmap) break;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.opacite ?? 1));
        ctx.translate(p.cx, p.cy);
        if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
        if (!p.recadrage) ctx.drawImage(img.bitmap, -p.largeur / 2, -p.hauteur / 2, p.largeur, p.hauteur);   // v1.4.6, à l'identique
        else {
          // v1.4.7 : rectangle source (pixels du fichier) → partie visible dans le repère de l'image
          const r = p.recadrage;
          const lpx = img.bitmap.width || img.largeurPx, hpx = img.bitmap.height || img.hauteurPx;
          const fl = 1 - r.g - r.d, fh = 1 - r.h - r.b;
          ctx.drawImage(img.bitmap, r.g * lpx, r.h * hpx, fl * lpx, fh * hpx,
            -p.largeur / 2 + r.g * p.largeur, -p.hauteur / 2 + r.h * p.hauteur, fl * p.largeur, fh * p.hauteur);
        }
        ctx.restore();
        break;
      }
      default: break;
    }
  }
}
