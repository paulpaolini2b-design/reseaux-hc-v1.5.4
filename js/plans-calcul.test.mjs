/* plans-calcul.test.mjs — essais des calculs purs de plans-calcul.js (v1.4.5).
 * Lancer : node js/plans-calcul.test.mjs   (non précaché par le service worker, comme mesure.test.mjs) */
import assert from 'node:assert/strict';
import * as C from './plans-calcul.js';

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };

essai('analyserPages : formats acceptés', () => {
  assert.deepEqual(C.analyserPages('2', 3).pages, [2]);
  assert.deepEqual(C.analyserPages('1-3', 3).pages, [1, 2, 3]);
  assert.deepEqual(C.analyserPages('1,3', 3).pages, [1, 3]);
  assert.deepEqual(C.analyserPages(' 1 - 3 ; 5 ', 5).pages, [1, 2, 3, 5]);
  assert.deepEqual(C.analyserPages('1–2', 3).pages, [1, 2]);          // tiret demi-cadratin
  assert.deepEqual(C.analyserPages('3—1', 3).pages, [1, 2, 3]);       // tiret cadratin, bornes inversées
  assert.deepEqual(C.analyserPages('2,2,1', 3).pages, [1, 2]);        // doublons retirés, tri
});

essai('analyserPages : erreurs', () => {
  assert.equal(C.analyserPages('', 3).erreur, 'Indiquez au moins une page');
  assert.equal(C.analyserPages('4', 3).erreur, 'Pages de 1 à 3');
  assert.equal(C.analyserPages('0-2', 3).erreur, 'Pages de 1 à 3');
  assert.match(C.analyserPages('a', 3).erreur, /Saisie non comprise/);
  assert.match(C.analyserPages('1-40', 40, 30).erreur, /Au plus 30/);
});

essai('toutesLesPages et resumePages', () => {
  assert.deepEqual(C.toutesLesPages(3), [1, 2, 3]);
  assert.equal(C.toutesLesPages(50, 30).length, 30);
  assert.equal(C.resumePages([1, 2, 3]), 'pages 1 à 3');
  assert.equal(C.resumePages([2]), 'page 2');
  assert.equal(C.resumePages([1, 3, 5]), 'pages 1, 3 et 5');
});

essai('noms de plans', () => {
  assert.ok(C.nomParDefaut('Plan 1'));
  assert.ok(!C.nomParDefaut('Poste Campana'));
  assert.equal(C.nomPlanPour({ type: 'pdf', page: 2 }), 'Page 2');
  assert.equal(C.nomPlanPour({ type: 'image', nom_fichier: 'cadastre AB12.jpeg' }), 'cadastre AB12');
  assert.equal(C.nomPlanPour({ type: 'image', photo: true, nom_fichier: 'x.jpg' }), 'Photo');
  assert.ok(C.nomAutomatique('Page 2', { type: 'pdf', page: 2 }));
  assert.ok(!C.nomAutomatique('Page 2', { type: 'pdf', page: 1 }));
  assert.ok(C.nomAutomatique('cadastre', { type: 'image', nom_fichier: 'cadastre.jpg' }));
  assert.ok(C.nomAutomatique('Photo', { type: 'image', nom_fichier: 'x.jpg' }));
  assert.ok(!C.nomAutomatique('Poste Campana', { type: 'pdf', page: 1 }));
  assert.equal(C.nettoyerNomPlan('   '), null);
  assert.equal(C.nettoyerNomPlan('a'.repeat(60), 40).length, 40);
});

const fond = (fond_id, page, extra = {}) => ({ fond_id, type: 'pdf', page, nb_pages: 3, largeur: 100, hauteur: 50, ...extra });
const plan = (id, f) => ({ id, nom: id, fond: f, objets: [] });

essai('fondsReferences : chaque fond une fois', () => {
  const p = { plans: [plan('a', fond('F1', 1)), plan('b', fond('F1', 2)), plan('c', fond('F1', 3)), plan('d', null), { id: 'e', fond: fond('F2', 1), fonds: [{ fond_id: 'F3' }] }] };
  assert.deepEqual([...C.fondsReferences(p)].sort(), ['F1', 'F2', 'F3']);
  assert.ok(C.fondPartage(p.plans, 'F1', 'a'));
  assert.ok(!C.fondPartage(p.plans, 'F2', 'e'));
});

essai('fondPourPage', () => {
  const f = C.fondPourPage({ fond_id: 'F', type: 'pdf', nb_pages: 3, nom_fichier: 'p.pdf' }, { page: 2, largeur: 842, hauteur: 595, rotation: 90, transform_pdf: [0, 1, 1, 0, 0, 0] });
  assert.deepEqual(f, { fond_id: 'F', type: 'pdf', page: 2, nb_pages: 3, largeur: 842, hauteur: 595, opacite: 1, nom_fichier: 'p.pdf', rotation: 90, transform_pdf: [0, 1, 1, 0, 0, 0] });
  const i = C.fondPourPage({ fond_id: 'I', type: 'image', nb_pages: 1, nom_fichier: 'x.jpg' }, { page: 1, largeur: 1190, hauteur: 800, echelle_image: 0.5 });
  assert.equal(i.echelle_image, 0.5);
});

essai('pagesManquantes', () => {
  const plans = [plan('a', fond('F1', 2)), plan('x', fond('F2', 1))];
  assert.deepEqual(C.pagesManquantes(plans, 'F1', 3), [1, 3]);
  assert.deepEqual(C.pagesManquantes([plan('a', fond('F1', 1)), plan('b', fond('F1', 2)), plan('c', fond('F1', 3))], 'F1', 3), []);
});

essai('insererGroupeParPage : groupe trié à sa place, autres plans inchangés', () => {
  const x = plan('x', fond('F2', 1)), a = plan('a', fond('F1', 2)), y = plan('y', null);
  const n1 = plan('n1', fond('F1', 1)), n3 = plan('n3', fond('F1', 3));
  const r = C.insererGroupeParPage([x, a, y], 'F1', [n1, n3]);
  assert.deepEqual(r.map((p) => p.id), ['x', 'n1', 'a', 'n3', 'y']);
  const r2 = C.insererGroupeParPage([a], 'F1', [n3, n1]);
  assert.deepEqual(r2.map((p) => p.id), ['n1', 'a', 'n3']);
});

essai('deplacerCalibrations : déplacées, pas dupliquées', () => {
  const src = fond('F1', 1, { calibrations: { 1: { m_par_unite: 0.1 }, 2: { m_par_unite: 0.2 }, 3: { m_par_unite: 0.3 } } });
  const p2 = plan('p2', fond('F1', 2)), p3 = plan('p3', fond('F1', 3));
  assert.equal(C.deplacerCalibrations(src, [p2, p3]), 2);
  assert.deepEqual(Object.keys(src.calibrations), ['1']);
  assert.equal(p2.fond.calibrations['2'].m_par_unite, 0.2);
  assert.equal(p3.fond.calibrations['3'].m_par_unite, 0.3);
  const seul = fond('F1', 2, { calibrations: { 1: { m_par_unite: 0.1 } } });
  C.deplacerCalibrations(seul, [plan('q', fond('F1', 1))]);
  assert.equal(seul.calibrations, undefined);
});

essai('indicePlanBorne', () => {
  assert.equal(C.indicePlanBorne(2, 3), 2);
  assert.equal(C.indicePlanBorne(3, 3), 0);
  assert.equal(C.indicePlanBorne(-1, 3), 0);
  assert.equal(C.indicePlanBorne('1', 3), 0);
  assert.equal(C.indicePlanBorne(undefined, 1), 0);
});

essai('fondsReferences : images libres (v1.4.6)', () => {
  const p = { plans: [
    { fond: { fond_id: 'F1' }, objets: [{ type: 'image', fond_id: 'I1' }, { type: 'image', fond_id: 'I1' }, { type: 'note', fond_id: 'X' }] },
    { fond: null, objets: [{ type: 'image', fond_id: 'I2' }] }
  ] };
  assert.deepEqual([...C.fondsReferences(p)].sort(), ['F1', 'I1', 'I2']);   // image partagée une fois ; plan sans fond compris
  assert.deepEqual([...C.fondsReferences({ plans: [{ objets: [{ type: 'image', fond_id: 'I9' }] }] })], ['I9']);   // image seule
});

essai('remapperImages : duplication et import', () => {
  const p = { plans: [{ objets: [{ type: 'image', fond_id: 'I1' }, { type: 'image', fond_id: 'I2' }, { type: 'support' }] }] };
  assert.equal(C.remapperImages(p, { I1: 'N1' }), 0);
  assert.deepEqual(p.plans[0].objets.map((o) => o.fond_id), ['N1', 'I2', undefined]);
  assert.equal(C.remapperImages(p, { N1: 'M1' }, { retirerAbsentes: true }), 1);
  assert.deepEqual(p.plans[0].objets.map((o) => o.type + ':' + (o.fond_id || '')), ['image:M1', 'support:']);
});

console.log(n + ' essais réussis');
