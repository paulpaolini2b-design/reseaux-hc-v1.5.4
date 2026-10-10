/* forme-calcul.test.mjs — essais des calculs purs de forme-calcul.js (v1.4.6, rognage v1.4.7).
 * Lancer : node js/forme-calcul.test.mjs   (non précaché par le service worker, comme les autres essais) */
import assert from 'node:assert/strict';
import * as F from './forme-calcul.js';

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };
const proche = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);
const procheP = (p, q, eps = 1e-9) => { proche(p.x, q.x, eps); proche(p.y, q.y, eps); };
const rect = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];

/* Règle v1.4.5 recopiée telle quelle (outils.js, case 'sommet') : référence de non-régression. */
function regleV145(pts, i, p) {
  const o = pts.map((q) => ({ ...q }));
  o[i] = { x: p.x, y: p.y };
  o[i ^ 1] = { x: o[i ^ 1].x, y: p.y };
  o[3 - i] = { x: p.x, y: o[3 - i].y };
  return o;
}

essai('tourner : 90° horaire (y vers le bas)', () => {
  procheP(F.tourner({ x: 10, y: 0 }, { x: 0, y: 0 }, 90), { x: 0, y: 10 });
  procheP(F.tourner({ x: 3, y: 4 }, { x: 1, y: 1 }, 0), { x: 3, y: 4 });
  procheP(F.versLocal(F.tourner({ x: 7, y: -2 }, { x: 1, y: 2 }, 33), { x: 1, y: 2 }, 33), { x: 7, y: -2 });
});

essai('redimensionnerCoin : identique à la v1.4.5 sans rotation ni ratio', () => {
  const pts = rect(10, 20, 50, 60);
  for (let i = 0; i < 4; i++) {
    const p = { x: 5 + i * 7, y: 70 - i * 3 };
    assert.deepEqual(F.redimensionnerCoin(pts, i, p, 0, false), regleV145(pts, i, p));
  }
});

essai('redimensionnerCoin : le coin opposé reste fixe à l’écran (30°)', () => {
  const pts = rect(0, 0, 40, 20);
  for (let i = 0; i < 4; i++) {
    const avant = F.coinsMonde(pts, 30)[(i + 2) % 4];
    const n2 = F.redimensionnerCoin(pts, i, { x: 60, y: 45 }, 30, false);
    procheP(F.coinsMonde(n2, 30)[(i + 2) % 4], avant, 1e-9);
  }
});

essai('redimensionnerCoin : le coin saisi suit le pointeur (rotation, sans ratio)', () => {
  const pts = rect(0, 0, 40, 20);
  const p = { x: 55, y: 38 };
  const n2 = F.redimensionnerCoin(pts, 2, p, 25, false);
  procheP(F.coinsMonde(n2, 25)[2], p, 1e-9);
});

essai('redimensionnerCoin : proportions fixes = carré', () => {
  const n2 = F.redimensionnerCoin(rect(0, 0, 20, 20), 2, { x: 50, y: 30 }, 0, true);
  const l = n2[1].x - n2[0].x, h = n2[3].y - n2[0].y;
  proche(Math.abs(l), Math.abs(h));
  proche(Math.abs(l), 50);
  const t = F.redimensionnerCoin(rect(0, 0, 20, 20), 2, { x: 44, y: 61 }, 45, true);
  proche(Math.abs(t[1].x - t[0].x), Math.abs(t[3].y - t[0].y), 1e-9);
});

essai('contraindreCarre : signe conservé', () => {
  assert.deepEqual(F.contraindreCarre({ x: 0, y: 0 }, { x: -3, y: 10 }), { x: -10, y: 10 });
  assert.deepEqual(F.contraindreCarre({ x: 5, y: 5 }, { x: 9, y: 4 }), { x: 9, y: 1 });
});

essai('coinDepartFleche : coin du côté de la pointe', () => {
  const b = { x: 0, y: 0, l: 40, h: 10 };
  assert.deepEqual(F.coinDepartFleche(b, { x: 60, y: 30 }), { x: 40, y: 10 });
  assert.deepEqual(F.coinDepartFleche(b, { x: -5, y: 30 }), { x: 0, y: 10 });
  assert.deepEqual(F.coinDepartFleche(b, { x: -5, y: -30 }), { x: 0, y: 0 });
  assert.deepEqual(F.coinDepartFleche(b, { x: 25, y: -1 }), { x: 40, y: 0 });
});

essai('image : rectangle tourné et dimensions', () => {
  const c = F.coinsRectangleTourne(0, 0, 20, 10, 90);
  procheP(c[0], { x: 5, y: -10 });
  assert.ok(F.dansRectangleTourne({ x: 0, y: 9 }, 0, 0, 20, 10, 90));
  assert.ok(!F.dansRectangleTourne({ x: 9, y: 0 }, 0, 0, 20, 10, 90));
  assert.deepEqual(F.dimensionsImage(4000, 3000, 200), { largeur: 200, hauteur: 150 });
  assert.deepEqual(F.reduirePixels(4000, 3000, 2400), { largeur: 2400, hauteur: 1800, reduit: true });
  assert.deepEqual(F.reduirePixels(800, 600, 2400), { largeur: 800, hauteur: 600, reduit: false });
});

essai('segments : texte, normalisation, mise en forme', () => {
  const l = [[{ t: 'Bon' }, { t: 'jour', g: true }, { t: '' }], [{ t: 'a', g: false }, { t: 'b' }], [], []];
  const n2 = F.normaliserSegments(l);
  assert.equal(n2.length, 2);
  assert.deepEqual(n2[1], [{ t: 'ab', g: false, i: false, s: false }]);
  assert.equal(F.texteDesSegments(n2), 'Bonjour\nab');
  assert.ok(F.segmentsMisEnForme(n2));
  assert.ok(!F.segmentsMisEnForme([[{ t: 'x' }]]));
});

essai('disposerLignes : alignements (1 unité par caractère, gras ×2)', () => {
  const mesurer = (t, st) => t.length * (st.g ? 2 : 1);
  const lignes = [[{ t: 'aa bb cc' }], [{ t: 'dd' }]];
  const g = F.disposerLignes(lignes, { alignement: 'gauche', mesurer });
  proche(g.largeur, 8);
  proche(g.lignes[1].morceaux[0].x, 0);
  const c = F.disposerLignes(lignes, { alignement: 'centre', mesurer });
  proche(c.lignes[1].morceaux[0].x, 3);
  const d = F.disposerLignes(lignes, { alignement: 'droite', mesurer });
  proche(d.lignes[1].morceaux[0].x, 6);
  const b = F.disposerLignes([[{ t: 'x' }, { t: 'yy', g: true }]], { alignement: 'gauche', mesurer });
  proche(b.lignes[0].morceaux[1].x, 1);
  proche(b.largeur, 5);
});

essai('disposerLignes : justifié (dernière ligne et mot seul non étirés)', () => {
  const mesurer = (t) => t.length;
  const r = F.disposerLignes([[{ t: 'aaaa bbbb cc' }], [{ t: 'a b' }], [{ t: 'seul' }], [{ t: 'x y' }]], { alignement: 'justifie', mesurer });
  proche(r.largeur, 12);
  const l2 = r.lignes[1].morceaux;           // « a b » étirée à 12 : un seul espace intérieur de 1 + 9
  proche(l2[2].x + l2[2].l, 12);
  proche(r.lignes[2].largeur, 4);            // un seul mot : non étiré
  proche(r.lignes[3].morceaux[2].x, 2);      // dernière ligne : non étirée
});

essai('disposerLignes : espaces de fin ignorés pour l’alignement', () => {
  const r = F.disposerLignes([[{ t: 'abcd' }], [{ t: 'ab   ' }]], { alignement: 'droite', mesurer: (t) => t.length });
  proche(r.lignes[1].morceaux[0].x, 2);
});

/* ---------- Rognage (v1.4.7) ---------- */
const img = (extra = {}) => ({ x: 100, y: 50, largeur: 80, hauteur: 40, rotation: 0, recadrage: { g: 0, h: 0, d: 0, b: 0 }, ...extra });
/* Bord visible d'une image : milieu du côté demandé, dans le repère du plan. */
function bordVisible(o, cote) {
  const v = F.rectangleVisible(o);
  const c = F.coinsRectangleTourne(v.cx, v.cy, v.l, v.h, o.rotation || 0);   // hg, hd, bd, bg
  const mil = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return { g: mil(c[3], c[0]), d: mil(c[1], c[2]), h: mil(c[0], c[1]), b: mil(c[2], c[3]) }[cote];
}
/* Point du plan situé à la fraction (u, v) de l'image entière (0,0 = coin haut-gauche avant rotation). */
const pointImage = (o, u, v) => F.tourner({ x: o.x - o.largeur / 2 + u * o.largeur, y: o.y - o.hauteur / 2 + v * o.hauteur }, { x: o.x, y: o.y }, o.rotation || 0);

essai('rognage : sans recadrage, rectangleVisible = rectangle entier', () => {
  for (const deg of [0, 30, 90]) {
    const o = img({ rotation: deg });
    const v = F.rectangleVisible(o);
    proche(v.cx, 100); proche(v.cy, 50); proche(v.l, 80); proche(v.h, 40);
    const sans = F.rectangleVisible({ ...o, recadrage: undefined });
    assert.deepEqual(sans, v);
  }
  assert.ok(F.recadrageNul(undefined) && F.recadrageNul({ g: 0, h: 0, d: 0, b: 0 }) && !F.recadrageNul({ g: 0.1 }));
});

essai('rognage : visible décalé et tourné avec l’image', () => {
  const v = F.rectangleVisible(img({ recadrage: { g: 0.25, h: 0, d: 0, b: 0.5 } }));
  proche(v.l, 60); proche(v.h, 20); proche(v.cx, 110); proche(v.cy, 40);
  const t = F.rectangleVisible(img({ rotation: 90, recadrage: { g: 0.25, h: 0, d: 0, b: 0 } }));
  proche(t.cx, 100); proche(t.cy, 60);   // le décalage de +10 en x local devient +10 en y du plan
});

essai('rognage : rogner à gauche ne déplace pas le bord droit (0° et 30°)', () => {
  for (const deg of [0, 30]) {
    const o = img({ rotation: deg });
    const avant = bordVisible(o, 'd');
    const r = F.rognerParPoignee(o, 'g', pointImage(o, 0.3, 0.5));
    proche(r.g, 0.3, 1e-12); proche(r.d, 0); proche(r.h, 0); proche(r.b, 0);
    procheP(bordVisible({ ...o, recadrage: r }, 'd'), avant, 1e-9);
  }
});

essai('rognage : chaque côté suit le point, le côté opposé reste fixe (30°)', () => {
  const o = img({ rotation: 30, recadrage: { g: 0.1, h: 0.1, d: 0.1, b: 0.1 } });
  const oppose = { g: 'd', d: 'g', h: 'b', b: 'h' };
  const cible = { g: [0.2, 0.5], d: [0.7, 0.5], h: [0.5, 0.3], b: [0.5, 0.6] };
  for (const cote of ['g', 'd', 'h', 'b']) {
    const avant = bordVisible(o, oppose[cote]);
    const [u, v] = cible[cote];
    const r = F.rognerParPoignee(o, cote, pointImage(o, u, v));
    const n2 = { ...o, recadrage: r };
    procheP(bordVisible(n2, oppose[cote]), avant, 1e-9);
    const b = bordVisible(n2, cote), attendu = pointImage(o, cote === 'g' || cote === 'd' ? u : 0.5, cote === 'h' || cote === 'b' ? v : 0.5);
    procheP(b, attendu, 1e-9);
  }
});

essai('rognage : coin opposé à la poignée fixe (4 coins, 30°), sans conserver les proportions', () => {
  const o = img({ rotation: 30, recadrage: { g: 0.05, h: 0.1, d: 0.15, b: 0.2 } });
  const idx = { hg: 0, hd: 1, bd: 2, bg: 3 };
  for (const coin of ['hg', 'hd', 'bd', 'bg']) {
    const v0 = F.rectangleVisible(o);
    const avant = F.coinsRectangleTourne(v0.cx, v0.cy, v0.l, v0.h, 30)[(idx[coin] + 2) % 4];
    const p = pointImage(o, coin.includes('g') ? 0.3 : 0.6, coin.includes('h') ? 0.35 : 0.55);
    const r = F.rognerParPoignee(o, coin, p);
    const v1 = F.rectangleVisible({ ...o, recadrage: r });
    const c1 = F.coinsRectangleTourne(v1.cx, v1.cy, v1.l, v1.h, 30);
    procheP(c1[(idx[coin] + 2) % 4], avant, 1e-9);
    procheP(c1[idx[coin]], p, 1e-9);   // le coin saisi suit le pointeur
  }
});

essai('rognage : bornes de 5 % dans chaque sens et fractions ≥ 0', () => {
  const o = img({ rotation: 30, recadrage: { g: 0.5, h: 0.4, d: 0, b: 0 } });
  const r = F.rognerParPoignee(o, 'd', pointImage(o, 0.1, 0.5));
  proche(r.g + r.d, 0.95, 1e-12);
  const r2 = F.rognerParPoignee(o, 'bd', pointImage(o, -3, -3));
  proche(r2.g + r2.d, 0.95, 1e-12); proche(r2.h + r2.b, 0.95, 1e-12);
  const r3 = F.rognerParPoignee(o, 'hg', pointImage(o, -2, -2));
  proche(r3.g, 0); proche(r3.h, 0);
  const r4 = F.rognerParPoignee(o, 'g', pointImage(o, 0.99, 0.5), 0.1);
  proche(r4.g + r4.d, 0.9, 1e-12);
  const b = F.bornerRecadrage({ g: 0.8, d: 0.4, h: -1, b: 'x' });
  proche(b.g + b.d, 0.95, 1e-12); proche(b.g / b.d, 2, 1e-12); assert.equal(b.h, 0); assert.equal(b.b, 0);
});

essai('rognage : fenêtre déplacée sans sortir de l’image, taille conservée', () => {
  const o = img({ rotation: 30, recadrage: { g: 0.2, h: 0.1, d: 0.3, b: 0.4 } });
  const v0 = F.rectangleVisible(o);
  const r = F.deplacerFenetreRognage(o, o.recadrage, 5, 3);
  const v1 = F.rectangleVisible({ ...o, recadrage: r });
  proche(v1.l, v0.l, 1e-12); proche(v1.h, v0.h, 1e-12);
  proche(v1.cx - v0.cx, 5, 1e-9); proche(v1.cy - v0.cy, 3, 1e-9);
  const loin = F.deplacerFenetreRognage(o, o.recadrage, -500, 800);
  proche(loin.g, 0); proche(loin.d, 0.5); proche(loin.b, 0); proche(loin.h, 0.5);
});

essai('rognage : échelle autour du visible, centre visible fixe et recadrage inchangé', () => {
  for (const deg of [0, 30]) {
    const o = img({ rotation: deg, recadrage: { g: 0.1, h: 0.3, d: 0.4, b: 0.05 } });
    const v0 = F.rectangleVisible(o);
    const e = F.echelleAutourDuVisible(o, 1.7);
    const v1 = F.rectangleVisible({ ...o, ...e });
    proche(v1.cx, v0.cx, 1e-9); proche(v1.cy, v0.cy, 1e-9);
    proche(v1.l, v0.l * 1.7, 1e-9); proche(e.hauteur, 40 * 1.7, 1e-12);
    assert.ok(!('recadrage' in e));
  }
  const s = F.echelleAutourDuVisible(img({ rotation: 30 }), 2.5);
  assert.equal(s.x, 100); assert.equal(s.y, 50);   // sans rognage : centre strictement inchangé (v1.4.6)
});

essai('rognage : rotation autour du visible, partie visible sur place', () => {
  const o = img({ rotation: 10, recadrage: { g: 0.5, h: 0, d: 0, b: 0.25 } });
  const v0 = F.rectangleVisible(o);
  const t = F.tournerAutourDuVisible(o, 55);
  const v1 = F.rectangleVisible({ ...o, ...t });
  proche(v1.cx, v0.cx, 1e-9); proche(v1.cy, v0.cy, 1e-9); assert.equal(t.rotation, 55);
  const s = F.tournerAutourDuVisible(img({ rotation: 10 }), 55);
  assert.equal(s.x, 100); assert.equal(s.y, 50);
});

console.log('\n' + n + ' essais réussis');
