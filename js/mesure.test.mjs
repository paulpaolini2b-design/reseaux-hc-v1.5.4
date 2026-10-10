/* mesure.test.mjs — essais des calculs de l'outil Mesure (v1.4.3). Lancer : node js/mesure.test.mjs
 * Non précaché par sw.js (outil de développement). */
import assert from 'node:assert/strict';
import * as C from './mesure-calcul.js';

let n = 0;
function essai(nom, fn) { fn(); n++; console.log('ok —', nom); }
const presque = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

essai('critère 1 : PDF 1/500, 100 unités plan = 17,6 m (nominal)', () => {
  const m = C.mParUniteNominal(500);
  presque(m, 0.0254 / 72 * 500);
  assert.equal(C.formaterNombre(100 * m, 1), '17,6');
  const f = C.evaluerFiabilite({ fond: { type: 'pdf', page: 1 }, echelle_plan: 500, seuil_controle_pct: 1 });
  assert.equal(f.code, C.FIABILITE.NOMINALE);
});

essai('critère 2 : image sans calibration = aucune mesure, même avec une échelle déclarée', () => {
  const f = C.evaluerFiabilite({ fond: { type: 'image' }, echelle_plan: 500, seuil_controle_pct: 1 });
  assert.equal(f.code, C.FIABILITE.AUCUNE);
  assert.equal(f.m_par_unite, null);
});

essai('PDF sans échelle ni calibration, plan sans fond = aucune', () => {
  assert.equal(C.evaluerFiabilite({ fond: { type: 'pdf', page: 1 }, echelle_plan: null, seuil_controle_pct: 1 }).code, C.FIABILITE.AUCUNE);
  assert.equal(C.evaluerFiabilite({ fond: null, echelle_plan: 500, seuil_controle_pct: 1 }).code, C.FIABILITE.AUCUNE);
});

essai('critère 3 : 200 unités = 35 m → 0,175 m/unité ; 100 unités = 17,5 m', () => {
  const m = C.mParUniteCalibration({ x: 0, y: 0 }, { x: 120, y: 160 }, 35);
  presque(m, 0.175);
  assert.equal(C.formaterNombre(100 * m, 1), '17,5');
  const fond = { type: 'pdf', page: 2, calibrations: { 2: { m_par_unite: m, controle: null } } };
  const f = C.evaluerFiabilite({ fond, echelle_plan: 500, seuil_controle_pct: 1 });
  assert.equal(f.code, C.FIABILITE.CALIBREE);   // la calibration prime sur l'échelle déclarée
  presque(f.m_par_unite, 0.175);
});

essai('calibration par page : page 1 calibrée, page 2 non', () => {
  const fond = { type: 'pdf', page: 2, calibrations: { 1: { m_par_unite: 0.2 } } };
  assert.equal(C.evaluerFiabilite({ fond, echelle_plan: null, seuil_controle_pct: 1 }).code, C.FIABILITE.AUCUNE);
  fond.page = 1;
  assert.equal(C.evaluerFiabilite({ fond, echelle_plan: null, seuil_controle_pct: 1 }).code, C.FIABILITE.CALIBREE);
  assert.equal(C.clePage({ type: 'image', page: 3 }), '1');
});

essai('critère 4 : contrôle réussi / en écart', () => {
  presque(C.ecartPct(50.3, 50), 0.6, 1e-9);
  const cal = { m_par_unite: 0.175, controle: { ecart_pct: 0.6 } };
  const fond = { type: 'pdf', page: 1, calibrations: { 1: cal } };
  assert.equal(C.evaluerFiabilite({ fond, echelle_plan: null, seuil_controle_pct: 1 }).code, C.FIABILITE.CALIBREE_CONTROLEE);
  cal.controle.ecart_pct = -2.3;
  const f = C.evaluerFiabilite({ fond, echelle_plan: null, seuil_controle_pct: 1 });
  assert.equal(f.code, C.FIABILITE.CALIBREE);
  assert.equal(f.controle_en_ecart, true);
});

essai('calibrations illisibles ignorées sans exception', () => {
  for (const v of [0, -1, NaN, Infinity, '0,2', null]) {
    const fond = { type: 'pdf', page: 1, calibrations: { 1: { m_par_unite: v } } };
    assert.equal(C.evaluerFiabilite({ fond, echelle_plan: null, seuil_controle_pct: 1 }).code, C.FIABILITE.AUCUNE);
  }
  assert.equal(C.calibrationValide(undefined), null);
});

essai('échelle équivalente et écart à l’échelle déclarée', () => {
  presque(C.equivalentEchelle(C.mParUniteNominal(500)), 500, 1e-9);
  const e = C.ecartEchelleDeclaree({ type: 'pdf' }, 500, C.mParUniteNominal(487));
  presque(e, (487 - 500) / 500 * 100, 1e-9);
  assert.equal(C.ecartEchelleDeclaree({ type: 'image' }, 500, 0.2), null);
});

essai('incertitudes', () => {
  // deux points posés à 1 px = 0,5 unité plan, 0,175 m/unité : lecture = √2 × 0,5 × 0,175
  presque(C.incertitudeLecture([{ x: 0, y: 0, u: 0.5 }, { x: 10, y: 0, u: 0.5 }], 0.175), Math.SQRT2 * 0.5 * 0.175);
  presque(C.incertitudeRelativeCalage(200, 0.5), Math.SQRT2 * 0.5 / 200);
  presque(C.incertitudeTotale(10, 0.3, 0.04), 0.5);   // √(0,3² + 0,4²)
  assert.equal(C.incertitudeLecture([{ x: 0, y: 0, u: 1 }], 0.2), 0);
});

essai('longueurs de polyligne', () => {
  const L = C.longueurs([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]);
  assert.deepEqual(L.segments, [5, 6]);
  assert.equal(L.total, 11);
});

essai('lecture des distances saisies', () => {
  assert.equal(C.lireDistance('35'), 35);
  assert.equal(C.lireDistance('35,5'), 35.5);
  assert.equal(C.lireDistance(' 35.5 m '), 35.5);
  assert.equal(C.lireDistance('1 250,5'), 1250.5);
  for (const t of ['', '0', '-3', 'abc', '3,5,2', null, '1e3']) assert.equal(C.lireDistance(t), null, String(t));
});

essai('formats', () => {
  assert.equal(C.formaterRapport(0.175), '0,175');
  assert.equal(C.formaterRapport(0.17638888), '0,176');
  assert.equal(C.formaterRapport(12.54), '12,5');
});

console.log(`\n${n} essais réussis`);
