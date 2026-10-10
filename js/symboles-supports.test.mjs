/* symboles-supports.test.mjs — essais des symboles de supports (v1.4.8).
 * Lancer : node js/symboles-supports.test.mjs   (non précaché par le service worker, comme plans-calcul.test.mjs)
 * La référence symboles-supports.reference-v1.4.7.json a été produite par la v1.4.7 : les objets ponctuels autres que
 * les supports doivent rester identiques, primitive pour primitive. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { etat } from './etat.js';
import { coupeDemiPlan, echantillonSymbole, couleurObjetMalt } from './symboles.js';
import { designationSupport } from './designation.js';
import { estComplet } from './modele.js';
import { CHARTE, besoinLisere, couleurReseau } from './charte.js';

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };
const aire = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
const cercle = (r, k = 256) => Array.from({ length: k }, (_, i) => ({ x: r * Math.cos((i / k) * 2 * Math.PI), y: r * Math.sin((i / k) * 2 * Math.PI) }));
const etats = ['existant', 'a_poser', 'a_deposer', 'a_reprendre'];

essai('coupeDemiPlan : carré coupé par sa diagonale → deux moitiés égales', () => {
  const c = [{ x: -4, y: -4 }, { x: 4, y: -4 }, { x: 4, y: 4 }, { x: -4, y: 4 }];
  const a = aire(coupeDemiPlan(c, { x: 1, y: 1 })), b = aire(coupeDemiPlan(c, { x: -1, y: -1 }));
  assert.ok(Math.abs(a - b) / aire(c) < 0.01);
  assert.ok(Math.abs(a - aire(c) / 2) / aire(c) < 0.01);
});

essai('coupeDemiPlan : cercle coupé par le centre → deux moitiés égales', () => {
  const c = cercle(3.7);
  for (const n of [{ x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }]) {
    const a = aire(coupeDemiPlan(c, n));
    assert.ok(Math.abs(a - aire(c) / 2) / aire(c) < 0.01);
  }
});

essai('toutes les combinaisons matériau × renforcement × état se dessinent', () => {
  const mats = [['BETON', 'D'], ['BETON', 'E'], ['BOIS', ''], ['ME_TUB', ''], ['ME_PTR', ''], ['CONSOLE', ''], ['ANCRAGE', ''], ['', '']];
  const renfs = ['AUCUN', 'JUMELE', 'CONTREFICHE', 'HAUBANE', 'PORTIQUE'];
  for (const [materiau, classe] of mats) for (const renforcement of renfs) for (const e of etats) {
    const p = echantillonSymbole('support', e, { materiau, classe, renforcement, angle_renforcement: 90 });
    assert.ok(Array.isArray(p) && p.length > 0, materiau + ' ' + renforcement + ' ' + e);
    for (const q of p) for (const v of Object.values(q)) if (typeof v === 'number') assert.ok(Number.isFinite(v), 'valeur non finie : ' + materiau + ' ' + renforcement + ' ' + e);
  }
});

essai('croix de dépose : deux branches ; barre de remplacement : une branche ; console et ancrage à déposer sans croix', () => {
  const branches = (m, e) => echantillonSymbole('support', e, { materiau: m, classe: 'D' }).filter((p) => p.t === 'ligne' && p.epaisseur > 1.2).length;
  assert.equal(branches('BOIS', 'a_deposer'), 2);
  assert.equal(branches('BOIS', 'a_reprendre'), 1);
  assert.equal(branches('BOIS', 'existant'), 0);
  assert.equal(branches('BOIS', 'a_poser'), 0);
  assert.equal(branches('CONSOLE', 'a_deposer'), 0);
  assert.equal(branches('ANCRAGE', 'a_deposer'), 0);
  assert.equal(branches('ANCRAGE', 'a_reprendre'), 1);
});

essai('console et ancrage : renforcement ignoré au dessin', () => {
  for (const m of ['CONSOLE', 'ANCRAGE']) {
    assert.deepEqual(echantillonSymbole('support', 'a_poser', { materiau: m, renforcement: 'HAUBANE', angle_renforcement: 90 }),
      echantillonSymbole('support', 'a_poser', { materiau: m, renforcement: 'AUCUN' }));
  }
});

essai('désignations console / ancrage', () => {
  assert.equal(designationSupport({ attributs: { materiau: 'CONSOLE' }, etat: 'existant' }), 'Console');
  assert.equal(designationSupport({ attributs: { materiau: 'ANCRAGE' }, etat: 'a_poser' }), 'Ancrage');
  assert.equal(designationSupport({ attributs: { materiau: 'ANCRAGE', armement_ref: 'a0195' }, etat: 'a_poser' }), 'Ancrage EAF');
  assert.equal(designationSupport({ attributs: { materiau: 'ANCRAGE', armement_ref: 'a0196' }, etat: 'a_poser' }), 'Ancrage EADF');
  assert.equal(designationSupport({ attributs: { materiau: 'ANCRAGE', armement_ref: 'a0286' }, etat: 'a_poser' }), 'Ancrage BRT');
  // formats existants inchangés
  assert.equal(designationSupport({ attributs: { materiau: 'BETON', hauteur_m: 11, classe: 'D', effort_daN: 1000 }, etat: 'a_poser' }), 'BE 11m D 1000');
  assert.equal(designationSupport({ attributs: { materiau: 'BETON', hauteur_m: 11 }, etat: 'a_poser' }), 'BE 11m');
});

essai('complétude console / ancrage', () => {
  const o = (a) => ({ type: 'support', etat: 'a_poser', domaine: 'BTS', attributs: a });
  assert.equal(estComplet(o({ materiau: 'CONSOLE' })), true);
  assert.equal(estComplet(o({ materiau: 'ANCRAGE', armement_ref: null })), false);
  assert.equal(estComplet(o({ materiau: 'ANCRAGE', armement_ref: 'a0195' })), true);
});

essai('autres objets ponctuels : primitives identiques à la v1.4.7, aux seuls changements voulus de la v1.4.9 et de la v1.5.1 près', () => {
  // v1.4.9 (H-263) : la référence v1.4.7 n'est pas régénérée ; on lui applique les deux seuls changements voulus —
  // jaune BT existant aérien #C8960C → #F5DD27, et liseré sombre (premier élément) autour d'une ERAS de couleur fluo.
  // Tout autre écart reste une régression.
  const ref = JSON.parse(readFileSync(join(ici, 'symboles-supports.reference-v1.4.7.json'), 'utf8'));
  const couleursV149 = { '#C8960C': '#F5DD27' };
  const recolorer = (v) => Array.isArray(v) ? v.map(recolorer)
    : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recolorer(x)]))
    : (typeof v === 'string' && couleursV149[v.toUpperCase()]) ? couleursV149[v.toUpperCase()] : v;
  const types = { coffret: { sigle: 'RM300' }, poste: { sigle: 'PSS-A' }, boite_jonction: {}, eras: { avec_malt: true, sous_type: 'BT_RESEAU', longueur_tige: 8.8 },
    malt: { longueur_tige: 7 }, point_lumineux: {}, armoire_ep: { sigle: 'S17' }, lanterne_ep: {}, boucle_ep: {} };
  let liseres = 0;
  for (const [t, a] of Object.entries(types)) for (const e of etats) {
    let obtenu = JSON.parse(JSON.stringify(echantillonSymbole(t, e, a)));
    let attendu = recolorer(ref[t + '|' + e]);
    // v1.5.1 (H-293) : seul changement voulu sur la MALT — sa couleur (grise existante / à déposer, sinon BT à poser)
    if (t === 'malt') { const c = couleurObjetMalt({ etat: e, domaine: 'BTS' }); attendu = attendu.map((p) => ({ ...p, couleur: c })); }
    if (t === 'eras' && besoinLisere(couleurReseau('BTS', 'aerien', e))) {
      const l = obtenu.shift();
      assert.equal(l.t, 'cercle', 'liseré ERAS : un cercle');
      assert.equal(l.couleur, CHARTE.lisere.couleur, 'liseré ERAS : couleur du liseré');
      assert.equal(l.remplissage, null, 'liseré ERAS : sans remplissage');
      liseres++;
    }
    assert.deepEqual(obtenu, attendu, t + ' ' + e);
  }
  assert.ok(liseres > 0, 'au moins une ERAS BT aérienne existante reçoit le liseré');
});

console.log(n + ' essais réussis');
