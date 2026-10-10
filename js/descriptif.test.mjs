/* descriptif.test.mjs — essais v1.5.0 : efforts BE hors marché (§1), descriptif des travaux (§2), schéma 12.
 * Lancer : node js/descriptif.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { etat } from './etat.js';
import { definirMesureur } from './primitives.js';
import { CHARTE, MM } from './charte.js';
import { effortsSupports, effortsHorsMarche, articleSupport } from './nomenclature.js';
import { nouveauProjet, nouvelObjetPonctuel, nouveauTroncon, nouveauFourreau, estComplet, motifsACompleter, migrerProjet, VERSION_SCHEMA, cloner } from './modele.js';
import { actualiserDesignation } from './designation.js';
import * as DS from './descriptif.js';
import { miseEnPage, primitivesDescriptifPlan, pagesAnnexe } from './descriptif-rendu.js';
import { valider, annuler, retablir, reinitialiserHistorique } from './historique.js';

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };

/* ---------- Fabrique de projets ---------- */
function projet(infos = {}) {
  const p = nouveauProjet({ nom: 'Affaire test', commune: 'Castifao', ...infos });
  etat.projet = p; etat.plan = p.plans[0];
  return p;
}
const C = (domaine, pose, etatO) => ({ domaine, pose, etat: etatO });
function ponctuel(p, type, x, y, courant, attributs = {}, extra = {}) {
  const o = nouvelObjetPonctuel(type, x, y, courant, attributs);
  Object.assign(o, extra);
  actualiserDesignation(o);
  p.plans[0].objets.push(o);
  return o;
}
function troncon(p, pts, courant, attributs = {}, extra = {}) {
  const o = nouveauTroncon(pts, courant, attributs);
  Object.assign(o, extra);
  actualiserDesignation(o);
  p.plans[0].objets.push(o);
  return o;
}
const support = (p, x, y, etatO, a, extra = {}) => ponctuel(p, 'support', x, y, C('BTS', 'aerien', etatO), { materiau: 'BETON', classe: 'D', ...a }, extra);
const pt = (x, y) => ({ x, y });
function generer(p) { const plan = p.plans[0]; for (const o of plan.objets) actualiserDesignation(o); DS.genererDescriptif(plan, p); return plan.descriptif; }
function maj(p) { const plan = p.plans[0]; for (const o of plan.objets) actualiserDesignation(o); DS.mettreAJourDescriptif(plan, p); return plan.descriptif; }
const texteEntree = (e) => (DS.texteSegments(e.repere) ? DS.texteSegments(e.repere) + ' ' : '') + e.lignes.filter((l) => !l.supprimee).map((l) => DS.texteLigne(l)).join(' / ');
const entrees = (d, cle) => d.sections.find((s) => s.cle === cle).entrees;
const parRepere = (d, r) => DS.toutesEntrees(d).find((e) => DS.texteSegments(e.repere) === r + '.');
const nbsp = (s) => s.replace(/\u00A0/g, ' ');

/* ---------- §1 Efforts hors marché ---------- */
essai('1. effortsSupports : hors marché en existant seulement, liste inchangée sinon', () => {
  const ex = effortsSupports('BETON', 11, 'D', { etat: 'existant' });
  for (const e of [250, 300, 400, 500, 650, 800, 1000, 1250, 1600]) assert.ok(ex.includes(e), String(e));
  const avant = effortsSupports('BETON', 11, 'D');
  assert.deepEqual(avant, [650, 800, 1000, 1250, 1600]);
  assert.deepEqual(effortsSupports('BETON', 11, 'D', { etat: 'a_poser' }), avant);
  assert.deepEqual(effortsSupports('BETON', 11, 'E', { etat: 'existant' }), effortsSupports('BETON', 11, 'E'));
  assert.deepEqual(effortsHorsMarche('BETON', 'D', { etat: 'a_deposer' }), [250, 300, 400, 500]);
  assert.deepEqual(effortsHorsMarche('BETON', '', { etat: 'a_reprendre' }), [250, 300, 400, 500]);   // indépendant de la hauteur et de la classe vide
  assert.equal(articleSupport({ materiau: 'BETON', hauteur_m: 11, classe: 'D', effort_daN: 500 }), null);
});

essai('2. support D 500 existant passé à poser : valeur conservée, « à compléter »', () => {
  const p = projet();
  const o = support(p, 0, 0, 'existant', { hauteur_m: 11, effort_daN: 500 });
  assert.equal(estComplet(o), true);
  assert.equal(o.designation_auto, 'BE 11m D 500');
  o.etat = 'a_poser';
  assert.equal(estComplet(o), false);
  assert.equal(o.attributs.effort_daN, 500);
  assert.ok(motifsACompleter(o).includes('effort hors marché pour un support à poser'));
});

/* ---------- §2 Descriptif ---------- */
essai('3. regroupement par réseau + pose + état + section ; section_retenue', () => {
  const p = projet();
  const c = C('BTS', 'souterrain', 'a_poser');
  troncon(p, [pt(0, 0), pt(100, 0)], c, { section: '3x150+70 mm²', longueur_m: 10 });
  troncon(p, [pt(100, 0), pt(200, 0)], c, { section: '3x150+70 mm²', longueur_m: 12 });
  troncon(p, [pt(0, 50), pt(100, 50)], c, { section: '3x240+95 mm²', longueur_m: 5 });
  troncon(p, [pt(0, 90), pt(100, 90)], C('BTS', 'aerien', 'a_poser'), { section: '3x150+70 mm²', longueur_m: 7 });
  const t5 = troncon(p, [pt(0, 120), pt(100, 120)], c, { section: '3x150+70 ou 3x150+95 mm²' });
  t5.ref_article = 'a0292'; t5.attributs.section = etat.nomenclature.articles.find((a) => a.id === 'a0292').attributs.section; t5.attributs.section_retenue = '3x150+95 mm²';
  const d = generer(p);
  const tr = entrees(d, 'troncons');
  assert.equal(tr.length, 4);
  assert.ok(tr.some((e) => /3x150\+95 mm²/.test(texteEntree(e))));
  assert.ok(!tr.some((e) => / ou /.test(texteEntree(e))));
});

essai('4. total avec un tronçon sans longueur : « incomplet (1 tronçon(s) sans longueur) »', () => {
  const p = projet();
  const c = C('BTS', 'aerien', 'a_deposer');
  troncon(p, [pt(0, 0), pt(100, 0)], c, { section: 'T70', longueur_m: 60 });
  troncon(p, [pt(100, 0), pt(200, 0)], c, { section: 'T70' });
  const d = generer(p);
  const e = entrees(d, 'troncons')[0];
  assert.match(texteEntree(e), /= 60 ml — incomplet \(1 tronçon\(s\) sans longueur\)/);
  assert.ok(e.alertes.includes('longueur_manquante'));
});

essai('5. chaîne orientée depuis le poste ; groupe non chaîné sans « de … à … »', () => {
  const p = projet();
  ponctuel(p, 'poste', 300, 0, C('HTA', 'souterrain', 'existant'), { sigle: 'PSS-B' }, { repere: 'P', repere_manuel: true });
  ponctuel(p, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  const c = C('BTS', 'souterrain', 'a_poser');
  troncon(p, [pt(0, 0), pt(150, 0)], c, { section: '3x240+95 mm²', longueur_m: 30 });   // tracé depuis A1
  troncon(p, [pt(150, 0), pt(300, 0)], c, { section: '3x240+95 mm²', longueur_m: 25 });
  const c2 = C('BTS', 'aerien', 'a_poser');
  troncon(p, [pt(0, 400), pt(100, 400)], c2, { section: '3x70+54,6 mm²', longueur_m: 30 });
  troncon(p, [pt(500, 400), pt(600, 400)], c2, { section: '3x70+54,6 mm²', longueur_m: 20 });
  const d = generer(p);
  const [bts, bta] = entrees(d, 'troncons');
  assert.match(texteEntree(bts), /^BTS à construire : 3x240\+95 mm² de P à A1/);
  assert.ok(!/ de .* à /.test(DS.texteLigne(bta.lignes[0])));
});

essai('6. ERAS à moins de la tolérance d\'un support : rattachée ; au-delà : entrée propre', () => {
  const p = projet();
  support(p, 0, 0, 'existant', { hauteur_m: 11, effort_daN: 650 }, { repere: 'S1', repere_manuel: true });
  ponctuel(p, 'eras', 0.5 * MM, 0, C('BTS', 'aerien', 'a_poser'), {}, { repere: 'R1' });
  ponctuel(p, 'eras', 200, 0, C('BTS', 'aerien', 'a_poser'), {}, { repere: 'R2' });
  const d = generer(p);
  const ouv = entrees(d, 'ouvrages');
  assert.equal(ouv.length, 2);
  assert.match(texteEntree(parRepere(d, 'S1')), /Confection 1 ERAS BT/);
  assert.ok(parRepere(d, 'R2'));
  assert.ok(!parRepere(d, 'R1'));
  assert.equal(parRepere(d, 'S1').inclure, true);   // l'ERAS à poser est un travail
});

essai('7. ligne auto modifiée puis objet modifié : ligne conservée, alerte source_modifiee, Vu', () => {
  const p = projet();
  const s1 = support(p, 0, 0, 'a_poser', { hauteur_m: 12, effort_daN: 650 }, { repere: 'S1', repere_manuel: true });
  const d = generer(p);
  const e = parRepere(d, 'S1');
  const tete = e.lignes[0];
  DS.modifierLigne(tete, { segments: [[{ t: 'Pose BE 12m D 650 (implantation à confirmer)' }]] });
  s1.attributs.effort_daN = 800;
  maj(p);
  assert.equal(DS.texteLigne(e.lignes[0]), 'Pose BE 12m D 650 (implantation à confirmer)');
  assert.ok(e.alertes.includes('source_modifiee'));
  DS.marquerVu(e); maj(p);
  assert.ok(!e.alertes.includes('source_modifiee'));
  DS.retablirAutoLigne(e.lignes, tete.id); maj(p);
  assert.equal(DS.texteLigne(e.lignes[0]), 'Pose BE 12m D 800');
});

essai('8. entrée supprimée : objet exclu, jamais recréé ; Réintégrer', () => {
  const p = projet();
  const s1 = support(p, 0, 0, 'a_poser', { hauteur_m: 12, effort_daN: 650 }, { repere: 'S1', repere_manuel: true });
  const d = generer(p);
  DS.supprimerEntree(d, parRepere(d, 'S1').id);
  s1.attributs.effort_daN = 1000; maj(p);
  assert.ok(!parRepere(d, 'S1'));
  assert.ok(d.exclus.includes(s1.id));
  DS.reintegrer(d, s1.id); maj(p);
  assert.match(texteEntree(parRepere(d, 'S1')), /Pose BE 12m D 1000/);
});

essai('9. objet supprimé puis Ctrl+Z : entrée rétablie à l\'identique', () => {
  const p = projet();
  support(p, 0, 0, 'a_poser', { hauteur_m: 12, effort_daN: 650 }, { repere: 'S1', repere_manuel: true });
  const s2 = support(p, 50, 0, 'a_poser', { hauteur_m: 12, effort_daN: 800 }, { repere: 'S2', repere_manuel: true });
  generer(p);
  reinitialiserHistorique();
  const avant = JSON.stringify(etat.plan.descriptif.sections);
  etat.plan.objets = etat.plan.objets.filter((o) => o.id !== s2.id);
  valider('Suppression');
  assert.ok(!parRepere(etat.plan.descriptif, 'S2'));
  annuler();
  assert.equal(JSON.stringify(etat.plan.descriptif.sections), avant);
  retablir();
  assert.ok(!parRepere(etat.plan.descriptif, 'S2'));
});

essai('10. migration v11 → v13 sans changement d\'aspect ; garde d\'import d\'une version antérieure', () => {
  const p = projet();
  support(p, 0, 0, 'existant', { hauteur_m: 11, effort_daN: 650 });
  ponctuel(p, 'poste', 10, 10, C('HTA', 'souterrain', 'existant'), { sigle: 'PSS-A' });
  const v11 = cloner(p);
  v11.version_schema = 11;
  delete v11.plans[0].descriptif;
  for (const o of v11.plans[0].objets) if (o.type === 'poste') delete o.attributs.nom;
  const objetsAvant = JSON.stringify(v11.plans[0].objets.map((o) => ({ ...o, complet: undefined, attributs: { ...o.attributs, nom: undefined } })));
  const m = migrerProjet(v11);
  assert.equal(m.version_schema, 13);
  assert.equal(VERSION_SCHEMA, 13);
  assert.equal(m.plans[0].descriptif, null);
  assert.equal(m.plans[0].objets.find((o) => o.type === 'poste').attributs.nom, '');
  assert.equal(JSON.stringify(m.plans[0].objets.map((o) => ({ ...o, complet: undefined, attributs: { ...o.attributs, nom: undefined } }))), objetsAvant);
  // Descriptif existant (projet passé par une version antérieure sur la même base) : conservé
  const v12 = cloner(m); v12.plans[0].descriptif = DS.descriptifParDefaut(); v12.version_schema = 11;
  assert.ok(migrerProjet(v12).plans[0].descriptif);
  // Garde de projet.js → analyserImport, reprise de la v1.4.9 (VERSION_SCHEMA = 11) : un .json v12 est refusé
  const refuseParV149 = (schema) => schema > 11;
  assert.ok(refuseParV149(Number(m.version_schema)));
});

function sousTerrainChaine(p, reperes, longueurs, typeExtremite = 'coffret') {
  reperes.forEach((r, i) => ponctuel(p, typeExtremite, i * 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: r, repere_manuel: true }));
  const c = C('BTS', 'souterrain', 'a_poser');
  longueurs.forEach((l, i) => troncon(p, [pt(i * 100, 0), pt((i + 1) * 100, 0)], c, { section: '3x150+70 mm²', longueur_m: l }));
}

essai('11. fourniture BT souterrain : 135 + 35 + 30 → 212 ml ; P → A1 55 ml → 59 ml', () => {
  const p = projet();
  sousTerrainChaine(p, ['A0', 'A1', 'A2', 'A3'], [135, 35, 30]);
  const d = generer(p);
  const e = entrees(d, 'troncons')[0];
  assert.match(texteEntree(e), /Fourniture 3x150\+70 mm² : 212 ml/);
  assert.match(texteEntree(e), /Linéaire total : 200 ml/);
  assert.match(e.calcul_fourniture, /200 ml \+ 3 tronçons × 2 extrémités × 2 ml/);   // v1.5.1 : règle par tronçon tracé
  const p2 = projet();
  ponctuel(p2, 'poste', 0, 0, C('HTA', 'souterrain', 'existant'), { sigle: 'PSS-B' }, { repere: 'P', repere_manuel: true });
  ponctuel(p2, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  troncon(p2, [pt(0, 0), pt(100, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3x240+95 mm²', longueur_m: 55 });
  assert.match(texteEntree(entrees(generer(p2), 'troncons')[0]), /: 59 ml/);
});

essai('12. fourniture HTA souterrain : poste → ERAS HTA 80 ml → 90 ml ; boîte de jonction non comptée', () => {
  const p = projet();
  ponctuel(p, 'poste', 0, 0, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-A' }, { repere: 'P', repere_manuel: true });
  ponctuel(p, 'eras', 100, 0, C('HTA', 'aerien', 'a_poser'), {}, { repere: 'R1' });
  troncon(p, [pt(0, 0), pt(100, 0)], C('HTA', 'souterrain', 'a_poser'), { section: '3x150 mm²', longueur_m: 80 });
  assert.match(texteEntree(entrees(generer(p), 'troncons')[0]), /^HTA\/S à construire.*Fourniture 3x150 mm² : 90 ml/);
  const p2 = projet();
  ponctuel(p2, 'poste', 0, 0, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-A' }, { repere: 'P', repere_manuel: true });
  ponctuel(p2, 'boite_jonction', 100, 0, C('HTA', 'souterrain', 'a_poser'), {}, { repere: 'BJ1' });
  troncon(p2, [pt(0, 0), pt(100, 0)], C('HTA', 'souterrain', 'a_poser'), { section: '3x150 mm²', longueur_m: 80 });
  assert.match(texteEntree(entrees(generer(p2), 'troncons')[0]), /: 85 ml/);
});

essai('13. fourniture aérienne : 612 → 661 ; HTA 100 → 108 ; façade 40 → 40 ; BRT et EP sans calcul ni alerte', () => {
  const cas = [
    [C('BTS', 'aerien', 'a_poser'), 612, /: 661 ml/],
    [C('HTA', 'aerien', 'a_poser'), 100, /: 108 ml/],
    [C('BTS', 'facade', 'a_poser'), 40, /: 40 ml/]
  ];
  for (const [c, l, re] of cas) {
    const p = projet();
    troncon(p, [pt(0, 0), pt(100, 0)], c, { section: 'S', longueur_m: l });
    assert.match(texteEntree(entrees(generer(p), 'troncons')[0]), re);
  }
  for (const c of [C('BRT', 'aerien', 'a_poser'), C('EP', 'souterrain', 'a_poser')]) {
    const p = projet();
    troncon(p, [pt(0, 0), pt(100, 0)], c, { section: '2 x 16', longueur_m: 30 });
    const e = entrees(generer(p), 'troncons')[0];
    assert.ok(!/Fourniture/.test(texteEntree(e)));
    assert.ok(!e.alertes.includes('fourniture_incomplete'));
  }
});

essai('14. fourniture saisie conservée après modification de longueur ; « Rétablir le calcul »', () => {
  const p = projet();
  const t = troncon(p, [pt(0, 0), pt(100, 0)], C('BTS', 'aerien', 'a_poser'), { section: 'S', longueur_m: 100 });
  const d = generer(p);
  const e = entrees(d, 'troncons')[0];
  e.champs.fourniture = '120';
  maj(p);
  t.attributs.longueur_m = 200; maj(p);
  assert.match(texteEntree(e), /Fourniture S : 120 ml/);
  e.champs.fourniture = null; maj(p);
  assert.match(texteEntree(e), /Fourniture S : 216 ml/);
});

essai('15. existant sans travaux : non inclus ; inclusion suivant la règle tant qu\'elle n\'est pas choisie à la main', () => {
  const p = projet();
  const s = support(p, 0, 0, 'existant', { hauteur_m: 11, effort_daN: 650 }, { repere: 'S4', repere_manuel: true });
  const d = generer(p);
  const e = parRepere(d, 'S4');
  assert.equal(e.inclure, false);
  s.mention = 'Reprise des ancrages'; maj(p);
  assert.equal(e.inclure, true);
  e.inclure = false; e.inclure_manuel = true; maj(p);
  assert.equal(e.inclure, false);
  const prims = primitivesDescriptifPlan(p.plans[0], p);
  assert.ok(!prims.some((x) => x.t === 'texte' && x.texte === 'S4.'));
});

essai('16. fusion d\'entrées, suppression de ligne générée (jamais recréée), rétablissement', () => {
  const p = projet();
  support(p, 0, 0, 'a_poser', { hauteur_m: 12, effort_daN: 650 }, { repere: 'S1', repere_manuel: true });
  support(p, 100, 0, 'a_poser', { hauteur_m: 12, effort_daN: 800 }, { repere: 'S2', repere_manuel: true });
  const d = generer(p);
  const e1 = parRepere(d, 'S1');
  DS.fusionnerAvecSuivante(d, e1.id); maj(p);
  assert.equal(texteEntree(e1), 'S1. Pose BE 12m D 650 / S2. Pose BE 12m D 800');
  assert.equal(entrees(d, 'ouvrages').length, 1);
  const l2 = e1.lignes[1];
  DS.supprimerLigne(e1.lignes, l2.id); maj(p);
  assert.equal(texteEntree(e1), 'S1. Pose BE 12m D 650');
  DS.retablirAutoLigne(e1.lignes, l2.id); maj(p);
  assert.equal(texteEntree(e1), 'S1. Pose BE 12m D 650 / S2. Pose BE 12m D 800');
});

essai('17. fourniture HTA/S incomplète si une extrémité n\'a pas d\'ouvrage ; BT souterraine : sans objet (v1.5.1)', () => {
  const p = projet();
  ponctuel(p, 'poste', 0, 0, C('HTA', 'souterrain', 'a_poser'), { sigle: 'PSS-A' }, { repere: 'P', repere_manuel: true });
  troncon(p, [pt(0, 0), pt(100, 0)], C('HTA', 'souterrain', 'a_poser'), { section: '3x150 mm²', longueur_m: 40 });
  const e = entrees(generer(p), 'troncons')[0];
  assert.match(texteEntree(e), /Fourniture 3x150 mm² : 45 ml — incomplète/);
  assert.ok(e.alertes.includes('fourniture_incomplete'));
  e.champs.fourniture = '50'; maj(p);
  assert.ok(!e.alertes.includes('fourniture_incomplete'));
  // BT souterraine : + 2 ml à chaque extrémité de tronçon, ouvrage ou non
  const p2 = projet();
  ponctuel(p2, 'coffret', 0, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  troncon(p2, [pt(0, 0), pt(100, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150', longueur_m: 40 });
  const e2 = entrees(generer(p2), 'troncons')[0];
  assert.match(texteEntree(e2), /Fourniture 3 x 150 : 44 ml$/);
  assert.ok(!e2.alertes.includes('fourniture_incomplete'));
});

/* ---------- Recette 5055 Castifao ---------- */
essai('Recette 5055 Castifao', () => {
  const p = projet({ commune: 'Castifao', nom: 'Renforcement BT', num_sieep: '5055' });
  const s1 = support(p, 0, 0, 'a_reprendre', { hauteur_m: 13, effort_daN: 1000 }, { repere: 'S1', repere_manuel: true });
  s1.remplacement_par = { article_id: 'a0026', designation: 'BE 13m D 1000', attributs: {} };
  s1.materiel_associe = [
    { source: 'LIBRE', ref_article: null, libelle: 'Connecteurs CDR/CT 2S 70-70', quantite: 4, quantite_saisie: true, unite: '', package: null },
    { source: 'NOMENCLATURE', ref_article: 'a0188', libelle: 'Ensemble d\'ancrage simple EAS 70-10', quantite: 3, quantite_saisie: true, unite: 'U', package: null },
    { source: 'NOMENCLATURE', ref_article: 'a0433', libelle: 'Confection d\'une prise de terre', quantite: 1, quantite_saisie: false, unite: 'U', package: 'MALT' }
  ];
  const longueurs = [52, 52, 52, 52, 52, 52, 60, 60, 60, 60, 60];
  for (let i = 2; i <= 12; i++) {
    const a = { hauteur_m: i === 9 ? 13 : 12, effort_daN: i === 9 ? 800 : null };
    let o;
    if (i === 2) o = ponctuel(p, 'support', (i - 1) * 100, 0, C('BTS', 'aerien', 'a_poser'), { materiau: 'BOIS', hauteur_m: 12, classe: 'S 190', armement: 'ES 1500 (ES 54-14)', armement_ref: 'a0186' }, { repere: 'S2', repere_manuel: true });
    else o = support(p, (i - 1) * 100, 0, 'a_poser', { ...a, effort_daN: a.effort_daN || 650 }, { repere: 'S' + i, repere_manuel: true });
    if (i === 9) { o.attributs.angle_gr = 55; o.attributs.armement_ref = 'a0191'; o.attributs.armement = 'EADS 1500 (EADS 54-10)'; o.materiel_associe = [{ source: 'NOMENCLATURE', ref_article: 'a0433', libelle: 'x', quantite: 1, quantite_saisie: false, unite: 'U', package: 'MALT' }]; }
  }
  for (let i = 0; i < 11; i++) troncon(p, [pt(i * 100, 0), pt((i + 1) * 100, 0)], C('BTS', 'aerien', 'a_poser'), { section: '3 x 150 + 70', longueur_m: longueurs[i] });
  const d = generer(p);
  const t1 = nbsp(texteEntree(parRepere(d, 'S1')));
  assert.equal(t1, 'S1. BE 13m D 1000 à déposer – Pose BE 13m D 1000 / 4 Connecteurs CDR/CT 2S 70-70 / Pose 3 EAS / Confection MALT');
  assert.equal(nbsp(texteEntree(parRepere(d, 'S2'))), 'S2. Pose BØ 12m S 190 / Pose 1 ES');
  assert.equal(nbsp(texteEntree(parRepere(d, 'S9'))), 'S9. φ = 55 gr - Pose BE 13m D 800 / Pose 1 EADS / Confection MALT');
  const ordre = entrees(d, 'ouvrages').map((e) => DS.texteSegments(e.repere));
  assert.deepEqual(ordre, ['S1.', 'S2.', 'S3.', 'S4.', 'S5.', 'S6.', 'S7.', 'S8.', 'S9.', 'S10.', 'S11.', 'S12.']);
  const tr = entrees(d, 'troncons');
  assert.equal(tr.length, 1);
  assert.equal(texteEntree(tr[0]), 'BTA à construire 3 x 150 + 70 — Long = 612 ml de S1 à S12 / Fourniture 3 x 150 + 70 : 661 ml');
  assert.equal(DS.texteLigne(d.entete.lignes[0]), 'CASTIFAO');
  assert.ok(d.entete.lignes.some((l) => DS.texteLigne(l) === 'N°5055'));
  // Mise en page : 1 à 3 colonnes, coupure entre entrées, rendu d'export
  for (const nc of [1, 2, 3]) {
    d.colonnes = nc; d.largeur = DS.largeurParDefaut(nc);
    const mp = miseEnPage(d, p.plans[0]);
    assert.ok(mp.colonnes.length <= nc && mp.hauteur > 0);
  }
  d.colonnes = 1; d.largeur = DS.largeurParDefaut(1);
  const prims = primitivesDescriptifPlan(p.plans[0], p);
  const tailles = new Set(prims.filter((x) => x.t === 'texte').map((x) => Math.round(x.taille / MM * 10) / 10));
  for (const t of tailles) assert.ok(t >= CHARTE.descriptif.taille_min_mm, 'taille ' + t);
  assert.ok(prims.some((x) => x.t === 'texte' && x.texte === 'S1.' && x.gras && x.couleur === '#E30000'));
  d.sortie_pdf = 'annexe';
  const pages = pagesAnnexe(p.plans[0], p, 1190, 842);
  assert.ok(pages.length >= 1 && pages[0].some((x) => x.t === 'texte' && /Descriptif/.test(x.texte)));
});

/* ---------- Recette 5052 Santo Pietro ---------- */
essai('Recette 5052 Santo Pietro', () => {
  const p = projet({ commune: 'Santo Pietro di Tenda', nom: 'Extension BT', num_sieep: '5052' });
  ponctuel(p, 'poste', 0, 0, C('HTA', 'souterrain', 'existant'), { sigle: 'PSS-B', puissance_kva: 160, nom: 'SUALI' }, { repere: 'P', repere_manuel: true });
  const s1 = support(p, 0, 300, 'existant', { hauteur_m: 11, effort_daN: 500 }, { repere: 'S1', repere_manuel: true });
  s1.materiel_associe = [{ source: 'NOMENCLATURE', ref_article: 'a0189', libelle: 'Ensemble d\'ancrage simple EAS 54-10', quantite: 1, quantite_saisie: false, unite: 'U', package: null }];
  ponctuel(p, 'eras', 0, 300, C('BTS', 'aerien', 'a_deposer'), {}, { repere: 'R1' });
  support(p, 200, 300, 'existant', { hauteur_m: 11, effort_daN: 650 }, { repere: 'S4', repere_manuel: true });
  ponctuel(p, 'eras', 200, 300, C('BTS', 'aerien', 'a_poser'), {}, { repere: 'R4' });
  support(p, 400, 300, 'existant', { hauteur_m: 11, effort_daN: 650 }, { repere: 'S6', repere_manuel: true });
  ponctuel(p, 'eras', 400, 300, C('BTS', 'aerien', 'a_poser'), {}, { repere: 'R6' });
  support(p, 600, 300, 'existant', { hauteur_m: 11, effort_daN: 650 }, { repere: 'S7', repere_manuel: true });
  ponctuel(p, 'boite_jonction', 300, 0, C('BTS', 'souterrain', 'a_poser'), { sections: '150/150' }, { repere: 'BJ1' });
  ponctuel(p, 'coffret', 100, 0, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A1', repere_manuel: true });
  ponctuel(p, 'coffret', 300, 300, C('BTS', 'souterrain', 'a_poser'), { sigle: 'RM300' }, { repere: 'A3', repere_manuel: true });
  // à déposer : T70 S1 → S4 (60) et T35 S4 → S6 (45)
  troncon(p, [pt(0, 300), pt(200, 300)], C('BTS', 'aerien', 'a_deposer'), { section: 'T70', longueur_m: 60 });
  troncon(p, [pt(200, 300), pt(400, 300)], C('BTS', 'aerien', 'a_deposer'), { section: 'T35', longueur_m: 45 });
  // BTS 3 x 240 de P à A1
  troncon(p, [pt(0, 0), pt(100, 0)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 240', longueur_m: 55 });
  // BTS 3 x 150 : S4 → A3 (3), A3 → BJ (22)… ici A3 traversé, extrémités S4 et S6 avec ERAS
  troncon(p, [pt(200, 300), pt(300, 300)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150', longueur_m: 3 });
  ponctuel(p, 'boite_jonction', 350, 450, C('BTS', 'souterrain', 'a_poser'), { sections: '150/150' }, { repere: 'BJ2' });
  troncon(p, [pt(300, 300), pt(350, 450)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150', longueur_m: 22 });
  troncon(p, [pt(350, 450), pt(400, 300)], C('BTS', 'souterrain', 'a_poser'), { section: '3 x 150', longueur_m: 23 });
  const d = generer(p);
  assert.equal(texteEntree(parRepere(d, 'P')), 'P. Poste « SUALI » PSS-B 160 kVA existant');
  assert.equal(texteEntree(parRepere(d, 'S1')), 'S1. BE 11m D 500 existant / Dépose ERAS BT existante / Pose 1 EAS');
  assert.equal(parRepere(d, 'S7').inclure, false);   // existant sans travaux : non inclus (S4 « BE ex » de l'APS)
  assert.ok(parRepere(d, 'BJ1'));
  const ordre = entrees(d, 'ouvrages').map((e) => DS.texteSegments(e.repere));
  assert.deepEqual(ordre.slice(0, 3), ['P.', 'A1.', 'A3.']);
  assert.ok(ordre.indexOf('BJ1.') < ordre.indexOf('S1.'));
  const tr = entrees(d, 'troncons');
  const dep = tr.filter((e) => /à déposer/.test(texteEntree(e)));
  assert.equal(dep.length, 2);
  DS.fusionnerAvecSuivante(d, dep[0].id); maj(p);
  const fus = entrees(d, 'troncons').find((e) => /à déposer/.test(texteEntree(e)));
  assert.equal(texteEntree(fus), 'BTA à déposer T70 et T35 = 105 ml de S1 à S6');
  const b240 = entrees(d, 'troncons').find((e) => /3 x 240/.test(texteEntree(e)));
  assert.match(texteEntree(b240), /^BTS à construire : 3 x 240 de P à A1 \/ Linéaire total : 55 ml \/ Fourniture 3 x 240 : 59 ml$/);
  const b150 = entrees(d, 'troncons').find((e) => /3 x 150/.test(texteEntree(e)));
  assert.match(texteEntree(b150), /Linéaire total : 48 ml/);
  assert.match(texteEntree(b150), /^BTS à construire : 3 x 150 de S4 à S6 \/ De S4 à A3 : 3 ml \/ De A3 à BJ2 : 22 ml \/ De BJ2 à S6 : 23 ml/);
  // v1.5.1 (H-296) : + 2 ml à chaque extrémité de chaque tronçon tracé, boîte de jonction comprise → 48 + 3 × 4 = 60 ml
  // (la recette papier, établie à l'émergence, donnait 56 ml : BJ2 non comptée)
  assert.match(texteEntree(b150), /Fourniture 3 x 150 : 60 ml$/);
  assert.deepEqual(b150.alertes, []);
});

/* ---------- Recette 5033 Galeria ---------- */
essai('Recette 5033 Galeria', () => {
  const p = projet({ commune: 'Galeria', nom: 'Extension BT', num_sieep: '5033' });
  sousTerrainChaine(p, ['A0', 'A1', 'A2', 'A3'], [135, 35, 30]);
  const d = generer(p);
  const e = entrees(d, 'troncons')[0];
  e.champs.tranchee = '(0,40 m × 1,00 m)'; maj(p);
  assert.equal(texteEntree(e), 'BTS à construire : 3x150+70 mm² (0,40 m × 1,00 m) de A0 à A3 / De A0 à A1 : 135 ml / De A1 à A2 : 35 ml / De A2 à A3 : 30 ml / Linéaire total : 200 ml / Fourniture 3x150+70 mm² : 212 ml');
  // lignes libres de l'en-tête (titulaires)
  DS.ajouterLigneApres(d.entete.lignes, d.entete.lignes[d.entete.lignes.length - 1].id).segments = [[{ t: 'Titulaire : entreprise à désigner' }]];
  maj(p);
  assert.ok(d.entete.lignes.some((l) => DS.texteLigne(l) === 'Titulaire : entreprise à désigner'));
  assert.ok(d.entete.lignes.some((l) => l.cle_auto === 'entete.gps'));
});

console.log(n + ' essais réussis');
