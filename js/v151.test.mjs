/* v151.test.mjs — essais v1.5.1 et v1.5.2 (MALT depuis le centre de l'ouvrage, Ricciata / Bi-couche) : symbole MALT porté par un ouvrage (couleurs, légende), « Confection » au descriptif,
 * fourniture BT souterraine par tronçon, revêtements multiples, point GPS, couleur du texte, page annexe A4, schéma 13.
 * Lancer : node js/v151.test.mjs   (non précaché par le service worker, comme les autres essais) */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { etat } from './etat.js';
import { definirMesureur } from './primitives.js';
import { CHARTE, MM, couleurMalt } from './charte.js';
import { lignesPackage } from './nomenclature.js';
import { nouveauProjet, nouvelObjetPonctuel, nouveauTroncon, migrerProjet, cloner, assurerSymboleMalt, symboleMaltActif, VERSION_SCHEMA } from './modele.js';
import { actualiserDesignation } from './designation.js';
import { primitivesObjet, geometrieSymboleMalt, echantillonSymbole } from './symboles.js';
import { entreesLegende } from './legende.js';
import * as DS from './descriptif.js';
import { pagesAnnexe } from './descriptif-rendu.js';
import { pixelsMonde, tuilesFenetre, urlTuile, metresParPixel } from './situation.js';
import { primitivesSituation } from './symboles.js';
import { nouvelleImage } from './modele.js';

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };
function projet(infos = {}) { const p = nouveauProjet({ nom: 'Affaire test', commune: 'Commune test', ...infos }); etat.projet = p; etat.plan = p.plans[0]; return p; }
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
function ponctuel(p, type, x, y, courant, attributs = {}, extra = {}) { const o = nouvelObjetPonctuel(type, x, y, courant, attributs); Object.assign(o, extra); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
function troncon(p, pts, courant, attributs = {}) { const o = nouveauTroncon(pts, courant, attributs); actualiserDesignation(o); p.plans[0].objets.push(o); return o; }
const pt = (x, y) => ({ x, y });
const generer = (p) => { for (const o of p.plans[0].objets) actualiserDesignation(o); DS.genererDescriptif(p.plans[0], p); return p.plans[0].descriptif; };
const texteEntree = (e) => (DS.texteSegments(e.repere) ? DS.texteSegments(e.repere) + ' ' : '') + e.lignes.filter((l) => !l.supprimee).map((l) => DS.texteLigne(l)).join(' / ');
const entrees = (d, cle) => d.sections.find((s) => s.cle === cle).entrees;
const art = (id, q = 1) => { const a = etat.nomenclature.articles.find((x) => x.id === id); return { source: 'NOMENCLATURE', ref_article: id, libelle: a.libelle, quantite: q, quantite_saisie: false, unite: a.unite, package: null }; };
const couleursLignes = (prims) => [...new Set(prims.filter((x) => x.t === 'ligne').map((x) => String(x.couleur).toUpperCase()))];

/* ---------- MALT ---------- */
essai('1. symbole MALT posé par « MALT ex » (gris) et « Confection MALT » (bleu BT, rouge HTA)', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  const avant = primitivesObjet(s).corps.length;
  s.attributs.malt_ex = true;
  assert.equal(symboleMaltActif(s), false, 'pas de symbole sans la commande');
  assert.equal(assurerSymboleMalt(s), true);
  const r = primitivesObjet(s);
  assert.equal(r.corps.length, avant + 4, 'tige + 3 barres');
  assert.deepEqual(couleursLignes(r.corps.slice(0, 4)), [CHARTE.malt.couleur_existante.toUpperCase()]);
  s.materiel_associe.push(...lignesPackage('MALT'));
  assert.deepEqual(couleursLignes(primitivesObjet(s).corps.slice(0, 4)), [CHARTE.reseaux.BTS.couleur.a_poser.toUpperCase()]);
  s.domaine = 'HTA';
  assert.deepEqual(couleursLignes(primitivesObjet(s).corps.slice(0, 4)), [CHARTE.reseaux.HTA.couleur.a_poser.toUpperCase()]);
  s.materiel_associe = []; s.attributs.malt_ex = false;
  assert.equal(symboleMaltActif(s), false, 'plus de MALT : plus de symbole');
  assert.equal(primitivesObjet(s).corps.length, avant);
});

essai('2. MALT depuis le centre de l\'ouvrage, sous lui, barres hors du symbole, orientable ; rayon inchangé', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 100, 50, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 });
  const r0 = primitivesObjet(s);
  s.attributs.malt_ex = true; assurerSymboleMalt(s);
  assert.deepEqual(s.malt_symbole, { visible: true, angle: 0, longueur_tige: null });
  const r1 = primitivesObjet(s);
  assert.equal(r1.rayon, r0.rayon);
  assert.deepEqual(r1.boiteEtiquette, r0.boiteEtiquette);
  // second plan : les 4 traits de la MALT sont dessinés AVANT le symbole de l'ouvrage
  assert.deepEqual(couleursLignes(r1.corps.slice(0, 4)), [CHARTE.malt.couleur_existante.toUpperCase()]);
  assert.deepEqual(JSON.stringify(r1.corps.slice(4)), JSON.stringify(r0.corps));
  const tigeTrait = r1.corps[0];
  assert.deepEqual([tigeTrait.x1, tigeTrait.y1], [100, 50], 'la tige part du centre');
  const g = geometrieSymboleMalt(s, etat.projet.reglages, r1.rayon);
  assert.ok(g.tige * g.echelle > r1.rayon, 'barres hors du symbole');
  assert.ok(g.pied.y > 50 + r1.rayon && Math.abs(g.pied.x - 100) < 1e-9, 'vers le bas par défaut');
  s.malt_symbole.longueur_tige = 0.5;
  assert.equal(geometrieSymboleMalt(s, etat.projet.reglages, r1.rayon).tige, g.tigeMin, 'jamais sous le symbole');
  s.malt_symbole.longueur_tige = 999;
  assert.equal(geometrieSymboleMalt(s, etat.projet.reglages, r1.rayon).tige, CHARTE.malt.tige_max);
  s.malt_symbole.longueur_tige = 20; s.malt_symbole.angle = 90;   // vers la gauche (sens horaire depuis le bas)
  const g90 = geometrieSymboleMalt(s, etat.projet.reglages, r1.rayon);
  assert.ok(Math.abs(g90.pied.x - (100 - 20 * g90.echelle)) < 1e-9 && Math.abs(g90.pied.y - 50) < 1e-9);
  s.malt_symbole.visible = false;
  assert.equal(symboleMaltActif(s), false);
  assurerSymboleMalt(s);
  assert.equal(s.malt_symbole.angle, 90, 'orientation conservée au réaffichage');
});

essai('2 bis. reprise d\'un symbole MALT au format v1.5.1 (dx, dy) : orientation déduite, longueur automatique', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  s.attributs.malt_ex = true;
  s.malt_symbole = { visible: true, dx: -21, dy: 0, longueur_tige: 22 };
  const m = migrerProjet(cloner(p));
  assert.deepEqual(m.plans[0].objets[0].malt_symbole, { visible: true, angle: 90, longueur_tige: null });
  s.malt_symbole = { visible: true, dx: null, dy: null, longueur_tige: 7 };
  assert.deepEqual(migrerProjet(cloner(p)).plans[0].objets[0].malt_symbole, { visible: true, angle: 0, longueur_tige: null });
});

essai('2 ter. revêtements Ricciata et Bi-couche', () => {
  const p = projet();
  ponctuel(p, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A2', repere_manuel: true });
  ponctuel(p, 'coffret', 200, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A3', repere_manuel: true });
  const c = C('BTS', 'souterrain', 'a_poser');
  troncon(p, [pt(0, 0), pt(100, 0)], c, { section: 'S', longueur_m: 30, revetements: [{ nature: 'RICCIATA', longueur_m: 12 }, { nature: 'BICOUCHE', longueur_m: 18 }] });
  troncon(p, [pt(100, 0), pt(200, 0)], c, { section: 'S', longueur_m: 10, revetements: [{ nature: 'BICOUCHE', longueur_m: null }] });
  const t = texteEntree(entrees(generer(p), 'troncons')[0]);
  assert.match(t, /De A1 à A2 : 30 ml \/ Ricciata : 12 ml \/ Bi-couche : 18 ml \/ De A2 à A3 : 10 ml \(Bi-couche\)/);
});

essai('3. ERAS et objet MALT : jamais de symbole porté ; objet MALT coloré ; légende par catégorie', () => {
  const p = projet();
  const r = ponctuel(p, 'eras', 0, 0, C('BTS', 'aerien', 'a_poser'));
  r.attributs.malt_ex = true;
  assert.equal(assurerSymboleMalt(r), false);
  const m = ponctuel(p, 'malt', 50, 0, C('HTA', 'aerien', 'a_poser'));
  assert.deepEqual(couleursLignes(primitivesObjet(m).corps), [couleurMalt('HTA').toUpperCase()]);
  const mex = ponctuel(p, 'malt', 60, 0, C('BTS', 'aerien', 'existant'));
  assert.deepEqual(couleursLignes(primitivesObjet(mex).corps), [CHARTE.malt.couleur_existante.toUpperCase()]);
  const s = ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM600' });
  s.materiel_associe.push(...lignesPackage('MALT')); assurerSymboleMalt(s);
  const leg = entreesLegende(p.plans[0].objets).map((e) => e.libelle);
  for (const l of ['Confection MALT HTA', 'MALT existante', 'Confection MALT BT']) assert.ok(leg.includes(l), l);
  assert.deepEqual(couleursLignes(echantillonSymbole('malt', 'existant', {}, 'BTS')), [CHARTE.malt.couleur_existante.toUpperCase()]);
});

/* ---------- Descriptif ---------- */
essai('4. « Confection » pour EAJSE, jonctions, dérivations, RAS ; « Pose » pour le reste', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 }, { repere: 'P3', repere_manuel: true });
  s.materiel_associe = [art('a0357'), art('a0353'), art('a0351'), art('a0188'), art('a0377')];
  const t = texteEntree(entrees(generer(p), 'ouvrages')[0]).replace(/\u00A0/g, ' ');
  assert.match(t, /Confection 1 EAJSE T 150\/3x240\+95/);
  assert.match(t, /Confection 1 Jonct\. torsadé\/torsadé DPG4/);
  assert.match(t, /Confection 1 Dériv\. torsadé\/torsadé DPH4/);
  assert.match(t, /Confection 1 Remontée aéro-souterraine de branchement/);
  assert.match(t, /Pose 1 EAS/);
});

essai('5. fourniture BT souterraine + 2 ml par extrémité de tronçon (cas du plan test : 60 + 58 → 126 ml) ; BTA × 1,08', () => {
  const p = projet();
  ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'P2', repere_manuel: true });
  ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM600' }, { repere: 'C1', repere_manuel: true });
  ponctuel(p, 'support', 200, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 }, { repere: 'P3', repere_manuel: true });
  const c = C('BTS', 'souterrain', 'a_poser');
  troncon(p, [pt(0, 0), pt(100, 0)], c, { section: '3x240+115 mm²', longueur_m: 60, revetements: [{ nature: 'TERRE', longueur_m: null }] });
  troncon(p, [pt(100, 0), pt(200, 0)], c, { section: '3x240+115 mm²', longueur_m: 58, revetements: [{ nature: 'ENROBE', longueur_m: null }] });
  troncon(p, [pt(200, 0), pt(300, 0)], C('BTS', 'aerien', 'a_poser'), { section: '3 x 70 + 54,6', longueur_m: 45 });
  const d = generer(p);
  const tr = entrees(d, 'troncons');
  const bts = texteEntree(tr.find((e) => /3x240/.test(texteEntree(e))));
  assert.match(bts, /De P2 à C1 : 60 ml \(Terre\)/);
  assert.match(bts, /De C1 à P3 : 58 ml \(Enrobé\)/);
  assert.match(bts, /Linéaire total : 118 ml/);
  assert.match(bts, /Fourniture 3x240\+115 mm² : 126 ml$/);
  assert.match(texteEntree(tr.find((e) => /3 x 70/.test(texteEntree(e)))), /Fourniture 3 x 70 \+ 54,6 : 49 ml/);   // 45 × 1,08 = 48,6 → 49
});

essai('6. revêtements multiples : une ligne par revêtement, alerte si la somme diffère ; total seul cumulé', () => {
  const p = projet();
  ponctuel(p, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A2', repere_manuel: true });
  ponctuel(p, 'coffret', 200, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A3', repere_manuel: true });
  const c = C('BTS', 'souterrain', 'a_poser');
  const t1 = troncon(p, [pt(0, 0), pt(100, 0)], c, { section: 'S', longueur_m: 100, revetements: [{ nature: 'ENROBE', longueur_m: 60 }, { nature: 'TERRE', longueur_m: 40 }] });
  troncon(p, [pt(100, 0), pt(200, 0)], c, { section: 'S', longueur_m: 30, revetements: [{ nature: 'TERRE', longueur_m: null }] });
  const d = generer(p);
  const e = entrees(d, 'troncons')[0];
  const t = texteEntree(e);
  assert.match(t, /De A1 à A2 : 100 ml \/ Enrobé : 60 ml \/ Terre : 40 ml \/ De A2 à A3 : 30 ml \(Terre\)/);
  assert.deepEqual(e.alertes, []);
  t1.attributs.revetements[1].longueur_m = 35;
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.ok(e.alertes.includes('revetements'));
  t1.attributs.revetements[1].longueur_m = 40;
  e.champs.detail = 'total';
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.match(texteEntree(e), /Linéaire total : 130 ml \/ Enrobé : 60 ml \/ Terre : 70 ml/);
  assert.deepEqual(e.alertes, []);
});

essai('7. migration 12 → 13 : nature unique → revêtement sur toute la longueur ; GPS vide ; aucun symbole MALT ajouté', () => {
  const p = projet();
  const s = ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 });
  s.attributs.malt_ex = true;
  const t = troncon(p, [pt(0, 0), pt(100, 0)], C('BTS', 'souterrain', 'a_poser'), { section: 'S', longueur_m: 10, nature_terrain: 'CHAUSSEE' });
  const v12 = cloner(p);
  v12.version_schema = 12; delete v12.gps;
  delete v12.plans[0].objets.find((o) => o.id === t.id).attributs.revetements;
  const m = migrerProjet(v12);
  assert.equal(VERSION_SCHEMA, 13);
  assert.equal(m.version_schema, 13);
  assert.equal(m.gps, '');
  assert.deepEqual(m.plans[0].objets.find((o) => o.id === t.id).attributs.revetements, [{ nature: 'CHAUSSEE', longueur_m: null }]);
  assert.equal(m.plans[0].objets.find((o) => o.id === s.id).malt_symbole, undefined);
});

essai('8. point GPS : formats acceptés, format Google Maps, ligne d\'en-tête', () => {
  for (const x of ['42.1028902, 9.2117636', '42,1028902. 9,2117636', '42,1028902 9,2117636', '42,1028902; 9,2117636',
    'https://www.google.com/maps/@42.1028902,9.2117636,17z', 'https://maps.google.com/?q=42.1028902,9.2117636']) {
    assert.equal(DS.formaterGps(x), '42.1028902, 9.2117636', x);
  }
  for (const x of ['', 'abc', '42.1', '142.1, 9.2', '1 2 3']) assert.equal(DS.analyserGps(x), null, x);
  assert.match(DS.lienGoogleMaps('42,1028902. 9,2117636'), /query=42\.1028902%2C9\.2117636$/);
  const p = projet({ gps: '42.1028902, 9.2117636', num_edf: '26BXXX' });
  const d = generer(p);
  assert.ok(d.entete.lignes.some((l) => DS.texteLigne(l) === 'GPS : 42.1028902, 9.2117636'));
  p.gps = ''; DS.mettreAJourDescriptif(p.plans[0], p);
  assert.ok(d.entete.lignes.some((l) => l.cle_auto === 'entete.gps' && DS.texteLigne(l) === ''));
});

essai('9. couleur du texte appliquée au modèle : plage, toute la ligne, retrait du noir, sous-lignes', () => {
  const sl = [[{ t: 'Pose ' }, { t: 'BE', g: true }, { t: ' 12m' }]];
  assert.deepEqual(DS.colorierSegments(sl, 5, 7, '#e30000'), [[{ t: 'Pose ' }, { t: 'BE', g: true, c: '#E30000' }, { t: ' 12m' }]]);
  assert.deepEqual(DS.colorierSegments(sl, 3, 3, '#171AEB'), [[{ t: 'Pose ', c: '#171AEB' }, { t: 'BE', g: true, c: '#171AEB' }, { t: ' 12m', c: '#171AEB' }]]);
  const rouge = DS.colorierSegments(sl, 0, 0, '#E30000');
  assert.deepEqual(DS.colorierSegments(rouge, 0, 0, '#000000'), sl);
  assert.deepEqual(DS.colorierSegments([[{ t: 'ab' }], [{ t: 'cd' }]], 1, 4, '#E30000'), [[{ t: 'a' }, { t: 'b', c: '#E30000' }], [{ t: 'c', c: '#E30000' }, { t: 'd' }]]);
});

essai('10. page annexe A4 portrait : format de la charte, texte dans la page', () => {
  assert.deepEqual(CHARTE.descriptif.annexe.format_pt, [595.28, 841.89]);
  const p = projet();
  for (let i = 0; i < 60; i++) ponctuel(p, 'support', i * 50, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BETON', classe: 'D', hauteur_m: 12, effort_daN: 800 }, { repere: 'S' + (i + 1), repere_manuel: true });
  const d = generer(p);
  d.sortie_pdf = 'annexe';
  const [l, h] = CHARTE.descriptif.annexe.format_pt;
  const pages = pagesAnnexe(p.plans[0], p, l, h);
  assert.ok(pages.length >= 1);
  const m = CHARTE.descriptif.annexe.marge_mm * MM;
  for (const pg of pages) for (const x of pg) if (x.t === 'texte') { assert.ok(x.y <= h - m + 1e-6, 'dans la page'); assert.ok(x.x >= m - 1e-6); }
});

/* ---------- v1.5.3 : sens des tronçons ---------- */
function lotFitelle(tracerALenvers) {
  const p = projet();
  ponctuel(p, 'support', 0, 0, C('BTS', 'aerien', 'existant'), { materiau: 'BETON', classe: 'D', hauteur_m: 11, effort_daN: 800 }, { repere: 'S1', repere_manuel: true });
  for (let i = 1; i <= 6; i++) ponctuel(p, 'coffret', i * 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM450' }, { repere: 'A' + i, repere_manuel: true });
  const L = [2, 34, 12, 30, 42, 38];
  const c = C('BTS', 'souterrain', 'a_poser');
  const idx = [0, 1, 2, 3, 4, 5];
  if (tracerALenvers) idx.reverse();
  for (const i of idx) {
    const a = pt(i * 100, 0), b = pt((i + 1) * 100, 0);
    troncon(p, tracerALenvers ? [b, a] : [a, b], c, { section: '3x240+95 mm²', longueur_m: L[i], revetements: [{ nature: 'TERRE', longueur_m: null }] });
  }
  return p;
}
essai('11. sens par défaut = ordre logique S1 → A1 → … → A6, quel que soit le sens du tracé', () => {
  for (const envers of [false, true]) {
    const p = lotFitelle(envers);
    const e = entrees(generer(p), 'troncons').find((x) => /construire/.test(texteEntree(x)));
    const t = texteEntree(e);
    assert.match(t, /BTS à construire : 3x240\+95 mm² de S1 à A6/, 'tracé ' + (envers ? 'à l\'envers' : 'à l\'endroit'));
    assert.match(t, /De S1 à A1 : 2 ml \(Terre\) \/ De A1 à A2 : 34 ml \(Terre\) \/ De A2 à A3 : 12 ml.*De A5 à A6 : 38 ml \(Terre\)/);
  }
});
essai('12. sens inversé à la main ; ouvrages réordonnés à la main suivis par défaut', () => {
  const p = lotFitelle(false);
  const d = generer(p);
  const e = entrees(d, 'troncons').find((x) => /construire/.test(texteEntree(x)));
  e.champs.sens = 'inverse';
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.match(texteEntree(e), /de A6 à S1 \/ De A6 à A5 : 38 ml.*De A1 à S1 : 2 ml \(Terre\)/);
  e.champs.sens = 'auto';
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.match(texteEntree(e), /de S1 à A6 \/ De S1 à A1 : 2 ml/);
  // Ouvrages remis à la main dans l'ordre A6, A5, …, A1, S1 : la chaîne suit, de A6 à S1, lignes réordonnées
  const ouv = entrees(d, 'ouvrages');
  ouv.sort((a, b) => DS.comparerNaturel(texteEntree(b).slice(0, 2), texteEntree(a).slice(0, 2)) * (/^S/.test(texteEntree(a)) || /^S/.test(texteEntree(b)) ? -1 : 1));
  assert.deepEqual(ouv.map((x) => texteEntree(x).slice(0, 2)), ['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'S1']);
  DS.mettreAJourDescriptif(p.plans[0], p);
  assert.match(texteEntree(e), /de A6 à S1 \/ De A6 à A5 : 38 ml/);
});

/* ---------- v1.5.4 : plan de situation ---------- */
essai('13. plan de situation : tuiles Web Mercator couvrant la fenêtre, URL IGN, emprise', () => {
  // repère connu : (0, 0) au niveau 1 = coin commun des 4 tuiles, pixel (256, 256)
  const o = pixelsMonde(0, 0, 1);
  assert.ok(Math.abs(o.x - 256) < 1e-9 && Math.abs(o.y - 256) < 1e-9);
  const lat = 42.1028902, lon = 9.2117636, z = 15;
  const t = tuilesFenetre(lat, lon, z, 1200, 900);
  const c = pixelsMonde(lat, lon, z);
  // chaque pixel de la fenêtre est couvert par exactement une tuile ; le point GPS tombe au centre de la fenêtre
  const couvre = (px, py) => t.filter((u) => px >= u.dx && px < u.dx + 256 && py >= u.dy && py < u.dy + 256).length;
  for (const [px, py] of [[0, 0], [1199, 0], [0, 899], [1199, 899], [600, 450]]) assert.equal(couvre(px, py), 1, px + ',' + py);
  const centre = t.find((u) => 600 >= u.dx && 600 < u.dx + 256 && 450 >= u.dy && 450 < u.dy + 256);
  assert.equal(centre.x, Math.floor(c.x / 256)); assert.equal(centre.y, Math.floor(c.y / 256));
  assert.ok(t.length >= 20 && t.length <= 30);
  assert.equal(urlTuile(15, 17030, 11940), 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=15&TILEROW=11940&TILECOL=17030');
  const m = metresParPixel(lat, z) * 1200;
  assert.ok(m > 4000 && m < 4500, 'carte d\'environ 4,3 km de large au niveau 15 en Corse : ' + m);
});

essai('14. plan de situation : rond rouge au point GPS (fond transparent, diamètre en mm), cadre de la partie visible', () => {
  const p = projet();
  const o = nouvelleImage(100, 200, 70 * MM, 52.5 * MM, 'fd_x', 'Plan de situation (IGN)');
  o.situation = { lat: 42.1, lon: 9.2, zoom: 15, diametre_mm: 6 };
  p.plans[0].objets.push(o);
  const r = primitivesObjet(o);
  assert.equal(r.corps[0].t, 'image');
  const rond = r.corps.find((x) => x.t === 'cercle');
  assert.deepEqual([rond.cx, rond.cy, rond.remplissage, rond.couleur], [100, 200, null, CHARTE.situation.rond.couleur]);
  assert.ok(Math.abs(rond.r - 3 * MM) < 1e-9);
  o.situation.diametre_mm = 999;
  assert.ok(Math.abs(primitivesSituation(o)[1].r - CHARTE.situation.rond.diametre_max_mm * MM / 2) < 1e-9);
  // rognage + rotation : le rond reste sur le point, le cadre suit la partie visible
  o.situation.diametre_mm = 10; o.rotation = 30; o.recadrage = { g: 0.2, h: 0, d: 0, b: 0.1 };
  const pr = primitivesSituation(o);
  assert.deepEqual([pr[1].cx, pr[1].cy], [100, 200]);
  assert.equal(pr[0].points.length, 4);
  assert.deepEqual(r.boite, primitivesObjet({ ...o, situation: undefined, rotation: 0, recadrage: { g: 0, h: 0, d: 0, b: 0 } }).boite, 'boîte de sélection = celle de l\'image');
});

console.log(n + ' essais réussis');
