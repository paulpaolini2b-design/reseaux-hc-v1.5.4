/* planche-supports.js — planche de contrôle des symboles de supports (v1.4.8).
 * Toutes les combinaisons type × renforcement × état, à la taille papier réelle (unités plan = points PDF,
 * 1 mm = 2,835 pt), avec une rotation de 30° sur une ligne sur deux. Servie par planche-supports.html (hors cache
 * du service worker, non liée depuis l'interface) ; outil de validation visuelle sur tablette et à l'impression. */
import { echantillonSymbole } from './symboles.js';

export const ETATS = [['existant', 'Existant'], ['a_poser', 'À poser'], ['a_deposer', 'À déposer'], ['a_reprendre', 'À remplacer']];
export const TYPES = [
  ['BETON', 'D', 'Béton D'], ['BETON', 'E', 'Béton E'], ['BOIS', '', 'Bois'], ['ME_TUB', '', 'ME tub'], ['ME_PTR', '', 'ME ptr'],
  ['CONSOLE', '', 'Console'], ['ANCRAGE', '', 'Ancrage'], ['', '', 'Sans matériau']
];
export const RENFORCEMENTS = [['AUCUN', ''], ['JUMELE', 'jumelé'], ['CONTREFICHE', 'contrefiché'], ['HAUBANE', 'haubané'], ['PORTIQUE', 'portique']];

const f = (v) => Number(v).toFixed(2);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Primitive → balise SVG (même traduction que rendu-svg.js, sans DOM). */
export function primVersBalise(p) {
  switch (p.t) {
    case 'ligne':
      return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" stroke="${p.couleur || 'none'}" stroke-width="${f(p.epaisseur)}" stroke-linecap="${p.bout || 'round'}"${p.tirete ? ` stroke-dasharray="${p.tirete.join(' ')}"` : ''}/>`;
    case 'poly': {
      if (!p.points.length) return '';
      const d = 'M' + p.points.map((q) => f(q.x) + ' ' + f(q.y)).join('L') + (p.ferme ? 'Z' : '');
      return `<path d="${d}" fill="${p.remplissage || 'none'}" stroke="${p.couleur || 'none'}" stroke-width="${p.couleur ? f(p.epaisseur) : 0}" stroke-linejoin="${p.joint || 'round'}" stroke-linecap="round"/>`;
    }
    case 'cercle':
      return `<circle cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(p.r)}" fill="${p.remplissage || 'none'}" stroke="${p.couleur || 'none'}" stroke-width="${p.couleur ? f(p.epaisseur) : 0}"/>`;
    case 'texte':
      return `<text x="${f(p.x)}" y="${f(p.y)}" font-size="${f(p.taille)}" fill="${p.couleur}" font-family="DejaVu Sans, Arial, sans-serif" text-anchor="${p.ancre === 'milieu' ? 'middle' : (p.ancre === 'fin' ? 'end' : 'start')}">${esc(p.texte)}</text>`;
    default: return '';
  }
}

/* SVG complet de la planche. `echelle` : 1 = taille papier réelle ; >1 pour une vue agrandie à l'écran. */
export function planche(echelle = 1) {
  const colType = 58, colEtat = 46, ligneH = 34, marge = 10;
  const lignes = [];
  for (const [m, c, lib] of TYPES) {
    const renfs = (m === 'CONSOLE' || m === 'ANCRAGE') ? [RENFORCEMENTS[0]] : RENFORCEMENTS;
    for (const [r, libR] of renfs) lignes.push({ m, c, r, libelle: lib + (libR ? ' ' + libR : '') });
  }
  const L = marge * 2 + colType + ETATS.length * 2 * colEtat;
  const H = marge * 2 + 14 + lignes.length * ligneH;
  const out = [];
  out.push(`<rect x="0" y="0" width="${L}" height="${H}" fill="#FFFFFF"/>`);
  // en-têtes : état, puis « 0° » / « 30° »
  ETATS.forEach(([, lib], i) => {
    const x = marge + colType + i * 2 * colEtat;
    out.push(`<text x="${f(x + colEtat)}" y="${marge + 5}" font-size="6" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif">${esc(lib)}</text>`);
    out.push(`<text x="${f(x + colEtat / 2)}" y="${marge + 11}" font-size="4.5" fill="#666" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif">0°</text>`);
    out.push(`<text x="${f(x + colEtat * 1.5)}" y="${marge + 11}" font-size="4.5" fill="#666" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif">30°</text>`);
  });
  lignes.forEach((l, j) => {
    const y = marge + 14 + j * ligneH + ligneH / 2;
    if (j % 2) out.push(`<rect x="${marge}" y="${f(y - ligneH / 2)}" width="${L - 2 * marge}" height="${ligneH}" fill="#F3F4F6"/>`);
    out.push(`<text x="${marge}" y="${f(y + 2)}" font-size="5.5" font-family="DejaVu Sans, Arial, sans-serif">${esc(l.libelle)}</text>`);
    ETATS.forEach(([e], i) => {
      [0, 30].forEach((rot, k) => {
        const cx = marge + colType + i * 2 * colEtat + (k + 0.5) * colEtat;
        const prims = echantillonSymbole('support', e, { materiau: l.m, classe: l.c, renforcement: l.r, angle_renforcement: 90 });
        out.push(`<g transform="translate(${f(cx)} ${f(y)}) rotate(${rot})">${prims.map(primVersBalise).join('')}</g>`);
      });
    });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(L * echelle)}pt" height="${f(H * echelle)}pt" viewBox="0 0 ${f(L)} ${f(H)}">${out.join('')}</svg>`;
}
