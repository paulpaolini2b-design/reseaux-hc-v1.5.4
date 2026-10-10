/* coupure-texte.test.mjs — essais v1.4.9 : retour à la ligne des blocs d'étiquette (§2), sections « conducteurs nus »
 * (§6), couleurs de charte et couleur manuelle (§1, §4, §5).
 * Lancer : node js/coupure-texte.test.mjs   (non précaché par le service worker, comme les autres essais)
 * Mesure du texte : largeur approchée 0,55 × taille par caractère (pas de canvas sous Node), suffisante pour éprouver
 * l'algorithme de coupure ; les largeurs réelles viennent du canvas à l'écran et de DejaVu Sans à l'export PDF. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { etat } from './etat.js';
import { definirMesureur, mesurerTexte } from './primitives.js';
import { couperLignes, motsInsecables, modeRetourLigne, blocLignes } from './symboles.js';
import { sectionsCables } from './nomenclature.js';
import { CHARTE, styleTroncon, couleurFourreau, besoinLisere, contrasteAvecBlanc, couleurCharteLineaire } from './charte.js';
import { estComplet, motifsACompleter, sectionNuHorsDomaine, VERSION_SCHEMA } from './modele.js';

const ici = dirname(fileURLToPath(import.meta.url));
etat.nomenclature = JSON.parse(readFileSync(join(ici, '..', 'nomenclature.json'), 'utf8'));
definirMesureur((t, taille) => String(t).length * taille * 0.55);

let n = 0;
const essai = (nom, fn) => { fn(); n++; console.log('ok  ' + nom); };
const T = 7;   // taille d'étiquette (CHARTE.texte.taille_etiquette)

const CAS = [
  '3 x 70 + 54,6 à déposer — 60 m',
  '3x240+95 mm² : 60 m',
  'Reprise 2 BRT 4F sur coffrets CIBE ex à reposer',
  'Nu ≥ 22 mm² à déposer — 20 m'
];

essai('mode « jamais » : une seule ligne, quelle que soit la largeur', () => {
  for (const c of CAS) for (const l of [10, 40, 110, 1000]) assert.deepEqual(couperLignes(c, T, l, 'jamais'), [c]);
  assert.deepEqual(couperLignes('', T, 10, 'jamais'), []);
});

essai('mode « auto » : texte court non coupé', () => {
  for (const c of CAS) assert.deepEqual(couperLignes(c, T, 1000, 'auto'), [c]);
});

essai('groupes insécables reconnus', () => {
  // « à déposer » et « déposer — 60 m » se chevauchent : fusionnés en un seul groupe
  assert.deepEqual(motsInsecables('3 x 70 + 54,6 à déposer — 60 m'), ['3 x 70 + 54,6', 'à déposer — 60 m']);
  assert.deepEqual(motsInsecables('Nu ≥ 22 mm² à déposer — 20 m'), ['Nu ≥ 22 mm²', 'à déposer — 20 m']);
  assert.deepEqual(motsInsecables('3x240+95 mm² : 60 m'), ['3x240+95 mm²', ':', '60 m']);
  assert.ok(motsInsecables('EP sous fourreau').includes('sous fourreau'));
  assert.ok(motsInsecables('BE à remplacer par BE 12m D 800').includes('à remplacer par'));
});

essai('le tiret ne commence ni ne termine jamais un mot insécable', () => {
  const mots = motsInsecables('3 x 70 + 54,6 à déposer — 60 m');
  const joint = mots.join('|');
  assert.ok(!/—\|/.test(joint) && !/\|—/.test(joint), 'le tiret ne commence ni ne termine un mot : ' + joint);
});

essai('mode « auto » sur bloc étroit : « — 60 m » jamais isolé, nombre et unité jamais séparés', () => {
  for (const c of CAS) for (const l of [20, 40, 60, 80]) {
    const lignes = couperLignes(c, T, l, 'auto');
    assert.equal(lignes.join(' ').replace(/\s+/g, ' '), c.replace(/\s+/g, ' '), 'aucun caractère perdu');
    for (const li of lignes) {
      assert.ok(!/^—/.test(li) && !/—$/.test(li), 'tiret en début ou fin de ligne : « ' + li + ' »');
      assert.ok(!/^(m|mm²|m²)$/.test(li), 'unité isolée : « ' + li + ' »');
      assert.ok(!/^\d+(?:,\d+)?$/.test(li) || !lignes.some((x) => /^(m|mm²)\b/.test(x)), 'nombre séparé de son unité');
    }
    const i = lignes.findIndex((x) => x.includes('—'));
    if (i >= 0) assert.ok(/\S+ — \S+/.test(lignes[i]), 'tiret entouré de ses voisins : « ' + lignes[i] + ' »');
  }
});

essai('groupe insécable plus large que le bloc : affiché sans coupure', () => {
  const lignes = couperLignes('3 x 70 + 54,6 à déposer — 60 m', T, 5, 'auto');
  assert.ok(lignes.includes('3 x 70 + 54,6'));
  assert.ok(lignes.some((x) => x.includes('déposer — 60 m')));
});

essai('mode par défaut : tronçon / fourreau sur une ligne, ponctuel automatique ; valeur explicite prioritaire', () => {
  assert.equal(modeRetourLigne({}, { type: 'troncon' }), 'jamais');
  assert.equal(modeRetourLigne({ retour_ligne: 'defaut' }, { type: 'fourreau' }), 'jamais');
  assert.equal(modeRetourLigne({}, { type: 'support' }), 'auto');
  assert.equal(modeRetourLigne({ retour_ligne: 'auto' }, { type: 'troncon' }), 'auto');
  assert.equal(modeRetourLigne({ retour_ligne: 'jamais' }, { type: 'coffret' }), 'jamais');
});

essai('blocLignes : une désignation de tronçon longue reste sur une ligne par défaut', () => {
  const txt = '3 x 70 + 54,6 à déposer — 60 m Accotement RD 80 sous chaussée';
  assert.ok(mesurerTexte(txt, T) > CHARTE.texte.largeur_max_etiquette, 'le cas d’essai dépasse bien la largeur maximale');
  const lin = blocLignes(0, 0, [{ texte: txt, taille: T }], { bloc: {}, objet: { type: 'troncon' } });
  const pon = blocLignes(0, 0, [{ texte: txt, taille: T }], { bloc: {}, objet: { type: 'support' } });
  const textes = (b) => b.prims.filter((p) => p.t === 'texte').length;
  assert.equal(textes(lin), 1);
  assert.ok(textes(pon) > 1);
});

essai('sections « Nu » : BT aérien existant / à déposer / à remplacer seulement, en tête de liste', () => {
  for (const e of ['existant', 'a_deposer', 'a_reprendre']) {
    const s = sectionsCables('BTS', 'aerien', e).map((x) => x.section);
    assert.deepEqual(s.slice(0, 2), ['Nu < 22 mm²', 'Nu ≥ 22 mm²'], e);
  }
  const sansNu = (d, p, e) => !sectionsCables(d, p, e).some((x) => /^Nu /.test(x.section));
  assert.ok(sansNu('BTS', 'aerien', 'a_poser'));
  assert.ok(sansNu('BTS', 'souterrain', 'existant'));
  assert.ok(sansNu('BTS', 'facade', 'existant'));
  assert.ok(sansNu('BRT', 'aerien', 'existant'));
  assert.ok(sansNu('HTA', 'aerien', 'existant'));
  assert.ok(sansNu('BTS', 'aerien', null), 'appel sans état : liste inchangée');
  // les sections de la nomenclature restent proposées après les deux entrées « Nu »
  assert.equal(sectionsCables('BTS', 'aerien', 'existant').length, sectionsCables('BTS', 'aerien', null).length + 2);
  for (const x of sectionsCables('BTS', 'aerien', 'existant').slice(0, 2)) assert.equal(x.article, null, 'jamais d’article de câble');
});

essai('section « Nu » devenue hors domaine : conservée, objet « à compléter »', () => {
  const t = (etatO, pose = 'aerien', domaine = 'BTS') => ({ type: 'troncon', domaine, pose, etat: etatO, attributs: { section: 'Nu < 22 mm²' }, materiel_associe: [] });
  assert.equal(sectionNuHorsDomaine(t('existant')), false);
  assert.equal(estComplet(t('existant')), true);
  assert.equal(estComplet(t('a_deposer')), true);
  assert.equal(sectionNuHorsDomaine(t('a_poser')), true);
  assert.equal(estComplet(t('a_poser')), false);
  assert.ok(motifsACompleter(t('a_poser')).some((m) => m.includes('Nu < 22 mm²')));
  assert.equal(estComplet(t('existant', 'souterrain')), false);
});

essai('couleurs de charte v1.4.9', () => {
  assert.equal(styleTroncon('BTS', 'aerien', 'existant').couleur, '#F5DD27');
  assert.equal(styleTroncon('BTS', 'facade', 'a_deposer').couleur, '#F5DD27');
  assert.equal(styleTroncon('BTS', 'souterrain', 'existant').couleur, '#3DDC1E');
  assert.equal(styleTroncon('BTS', 'aerien', 'a_poser').couleur, '#171AEB');
  for (const p of ['aerien', 'facade', 'souterrain']) {
    assert.equal(styleTroncon('BRT', p, 'existant').couleur, '#C47500');
    assert.equal(styleTroncon('BRT', p, 'a_deposer').couleur, '#C47500');
    assert.equal(styleTroncon('BRT', p, 'a_poser').couleur, '#FF6A00');
  }
  assert.equal(styleTroncon('BTS', 'aerien', 'existant').fluo, true, 'jaune BT : liseré');
  assert.equal(styleTroncon('BRT', 'aerien', 'a_poser').fluo, true, 'orange fluo : liseré');
  assert.equal(styleTroncon('BRT', 'aerien', 'existant').fluo, false, 'orange foncé : pas de liseré');
  assert.equal(styleTroncon('BTS', 'aerien', 'a_deposer').hachure, true);
  assert.equal(couleurFourreau({ etat: 'existant', attributs: { matiere: 'TPC' } }), '#E85A64');
  assert.equal(couleurFourreau({ etat: 'a_poser', attributs: { matiere: 'TPC' } }), '#E2001A');
  assert.equal(couleurFourreau({ etat: 'existant', attributs: { matiere: 'ACIER' } }), '#B5B5B5');
});

essai('couleur manuelle : couleur seule, liseré si trop pâle, retour à la charte', () => {
  const s = styleTroncon('BTS', 'souterrain', 'a_deposer', '#1b7f3b');
  assert.equal(s.couleur, '#1B7F3B');
  assert.deepEqual(s.tirete, CHARTE.reseaux.BTS.tirete_souterrain);
  assert.equal(s.hachure, true);
  assert.equal(s.manuelle, true);
  assert.equal(s.fluo, false);
  assert.ok(contrasteAvecBlanc('#FFFF66') < CHARTE.couleur_manuelle.contraste_min_lisere);
  assert.equal(besoinLisere('#FFFF66', true), true);
  assert.equal(besoinLisere('#FFFF66', false), false, 'hors couleur manuelle : seules les couleurs fluo de la charte');
  assert.equal(styleTroncon('BTS', 'aerien', 'existant', 'pas une couleur').couleur, '#F5DD27');
  const f = { type: 'fourreau', etat: 'existant', attributs: { matiere: 'TPC' }, couleur_manuelle: '#123456' };
  assert.equal(couleurFourreau(f), '#123456');
  assert.equal(couleurCharteLineaire(f), '#E85A64');
  assert.equal(couleurCharteLineaire({ type: 'troncon', domaine: 'BRT', pose: 'aerien', etat: 'existant', couleur_manuelle: '#123456' }), '#C47500');
});

essai('schéma 11 ou postérieur', () => { assert.ok(VERSION_SCHEMA >= 11); });   // v1.5.0 : schéma 12 (descriptif), voir descriptif.test.mjs

console.log(n + ' essais réussis');
