/* nomenclature.js — chargement de nomenclature.json tel quel, recherche, filtres,
 * cascade de choix pour les supports, packages et règles d'aide à la saisie.
 *
 * Aucune liste de matériel n'est codée en dur : tout vient du fichier.
 * L'utilisateur peut importer une nomenclature modifiée (stockée en BD) ;
 * elle remplace alors celle du dépôt jusqu'au prochain import.
 */
import { etat } from './etat.js';
import { bd } from './bd.js';
import { SECTIONS_DERIVEES, regleMaltEras, SECTIONS_EP, sectionsEpPour, TYPES_SUPPORT, SECTIONS_BT_NUS, sectionsNusApplicables, EFFORTS_BETON_HORS_MARCHE, ETATS_EFFORTS_HORS_MARCHE, effortHorsMarche } from './charte.js';

const LIBELLES_CATEGORIES = {
  SUPPORT: 'Supports', ARMEMENT_BT: 'Armements BT', ARMEMENT_HTA: 'Armements HTA', CABLE: 'Câbles',
  COFFRET_BT: 'Coffrets et bornes BT', BOITE_JONCTION: 'Boîtes de jonction', ERAS: 'ERAS / RAS',
  POSTE: 'Postes', COUPURE_HTA: 'Coupure HTA', MALT: 'MALT', FOURREAU: 'Fourreaux',
  ECLAIRAGE_PUBLIC: 'Éclairage public', DEPOSE_EXISTANT: 'Déposes et existant', DIVERS: 'Divers'
};

export function libelleCategorie(c) {
  return LIBELLES_CATEGORIES[c] || c.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase());
}

/* Charge la nomenclature : version personnalisée en BD si présente, sinon le fichier du dépôt. */
export async function chargerNomenclature() {
  let perso = null;
  try { perso = await bd.get('prefs', 'nomenclature_perso'); } catch (e) { /* BD indisponible : on ignore */ }
  if (perso && perso.valeur && Array.isArray(perso.valeur.articles)) {
    etat.nomenclature = perso.valeur;
  } else {
    const rep = await fetch('nomenclature.json');
    if (!rep.ok) throw new Error('Impossible de charger nomenclature.json');
    etat.nomenclature = await rep.json();
  }
  construireIndex();
  return etat.nomenclature;
}

/* Remplace la nomenclature par un fichier importé (export/import JSON, §5.8). */
export async function importerNomenclature(fichier) {
  const texte = await fichier.text();
  const donnees = JSON.parse(texte);
  if (!donnees || !Array.isArray(donnees.articles)) throw new Error('Fichier de nomenclature invalide (bloc articles absent).');
  etat.nomenclature = donnees;
  construireIndex();
  await bd.put('prefs', { cle: 'nomenclature_perso', valeur: donnees });
  return donnees.articles.length;
}

export async function restaurerNomenclatureDepot() {
  await bd.del('prefs', 'nomenclature_perso');
  const rep = await fetch('nomenclature.json');
  etat.nomenclature = await rep.json();
  construireIndex();
}

export function exporterNomenclatureJson() {
  return new Blob([JSON.stringify(etat.nomenclature, null, 2)], { type: 'application/json' });
}

/* ---------- Index de recherche ---------- */
let index = [];   // { article, cle }

export function normaliser(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o').replace(/[^a-z0-9+,.\/ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function construireIndex() {
  index = etat.nomenclature.articles.map((a) => {
    const morceaux = [a.libelle, a.categorie, a.sous_categorie, libelleCategorie(a.categorie)];
    if (a.attributs) {
      for (const k of ['designation_plan', 'sigle', 'section', 'materiau', 'classe', 'domaine']) {
        if (a.attributs[k] !== undefined) morceaux.push(String(a.attributs[k]));
      }
      // Sections en forme compacte (« 3x150+95mm2 ») : la recherche « 150+95 » trouve l'article comme « 150+70 » (v12 §4)
      if (a.attributs.section !== undefined) morceaux.push(String(a.attributs.section).replace(/\s+/g, ''));
    }
    if (SECTIONS_DERIVEES[a.id]) morceaux.push(...SECTIONS_DERIVEES[a.id], ...SECTIONS_DERIVEES[a.id].map((x) => x.replace(/\s+/g, '')));
    morceaux.push(a.libelle.replace(/\s+/g, ''));
    return { article: a, cle: normaliser(morceaux.join(' ')) };
  });
}

export function articleParId(id) {
  return etat.nomenclature.articles.find((a) => a.id === id) || null;
}

/* Recherche par libellé, catégorie ou désignation de plan.
 * filtre : { statut: 'BPU'|'EXISTANT_HORS_BPU'|null, categorie: string|null } */
export function rechercher(texte, filtre = {}, max = 80) {
  const mots = normaliser(texte).split(' ').filter(Boolean);
  const res = [];
  for (const { article, cle } of index) {
    if (filtre.categorie && article.categorie !== filtre.categorie) continue;
    if (filtre.statut && article.statut !== filtre.statut) continue;
    if (mots.length && !mots.every((m) => cle.includes(m))) continue;
    res.push(article);
    if (res.length >= max) break;
  }
  return res;
}

/* Statut de nomenclature pertinent selon l'état d'un objet (§5.3) :
 * à poser → matériel du marché (BPU) ; existant / à déposer → tout, l'existant hors BPU en tête. */
export function statutPourEtat(etatObjet) {
  return etatObjet === 'a_poser' ? 'BPU' : null;
}

export function categories() {
  return etat.nomenclature.categories || [...new Set(etat.nomenclature.articles.map((a) => a.categorie))];
}

/* ---------- Cascade de choix pour les supports ---------- */
function supports() {
  return etat.nomenclature.articles.filter((a) => a.categorie === 'SUPPORT' && a.attributs && a.attributs.materiau);
}

export function materiauxSupports() {
  const s = new Set(supports().map((a) => a.attributs.materiau));
  // ME_PTR n'a pas d'article (poutrelles rencontrées en existant) : proposé quand même à la saisie.
  s.add('ME_PTR');
  // v1.4.8 : console et ancrage en façade, sans article de fourniture support, proposés de la même façon.
  s.add('CONSOLE'); s.add('ANCRAGE');
  return ['BETON', 'BOIS', 'ME_TUB', 'ME_PTR', 'CONSOLE', 'ANCRAGE'].filter((m) => s.has(m));
}

export function hauteursSupports(materiau) {
  const v = new Set(supports().filter((a) => a.attributs.materiau === materiau).map((a) => a.attributs.hauteur_m));
  return [...v].sort((a, b) => a - b);
}

export function classesSupports(materiau, hauteur) {
  const v = new Set(supports()
    .filter((a) => a.attributs.materiau === materiau && (hauteur === null || hauteur === undefined || hauteur === '' || a.attributs.hauteur_m === Number(hauteur)))
    .map((a) => a.attributs.classe).filter((c) => c !== undefined && c !== null));
  return [...v].sort();
}

/* v1.5.0 §1 : `etat` facultatif. Béton de classe D (ou sans classe) existant, à déposer ou à remplacer : les efforts
 * anciens hors marché (charte.js → EFFORTS_BETON_HORS_MARCHE) s'ajoutent, quelle que soit la hauteur. Sans `etat`
 * (appels existants, « remplacé par ») : comportement strictement inchangé. */
export function effortsSupports(materiau, hauteur, classe, { etat: etatOuvrage = null } = {}) {
  const v = new Set(supports()
    .filter((a) => a.attributs.materiau === materiau
      && (hauteur === null || hauteur === undefined || hauteur === '' || a.attributs.hauteur_m === Number(hauteur))
      && (!classe || a.attributs.classe === classe))
    .map((a) => a.attributs.effort_daN).filter((e) => e !== undefined && e !== null));
  for (const e of effortsHorsMarche(materiau, classe, { etat: etatOuvrage })) v.add(e);
  return [...v].sort((a, b) => a - b);
}

/* Efforts anciens hors marché applicables (liste vide hors béton D existant / à déposer / à remplacer). */
export function effortsHorsMarche(materiau, classe, { etat: etatOuvrage = null } = {}) {
  if (materiau !== 'BETON' || (classe && classe !== 'D') || !etatOuvrage || !ETATS_EFFORTS_HORS_MARCHE.includes(etatOuvrage)) return [];
  return [...EFFORTS_BETON_HORS_MARCHE.D].sort((a, b) => a - b);
}

/* Retrouve l'article de support correspondant exactement aux attributs (pour ref_article).
 * Console et ancrage (v1.4.8) : aucun article de support → null. */
export function articleSupport(a) {
  if (!a || a.materiau === 'CONSOLE' || a.materiau === 'ANCRAGE') return null;
  if (effortHorsMarche(a)) return null;   // v1.5.0 §1 : support ancien hors marché, aucun article de fourniture
  return supports().find((x) => x.attributs.materiau === a.materiau
    && x.attributs.hauteur_m === Number(a.hauteur_m)
    && (x.attributs.classe || '') === (a.classe || '')
    && (x.attributs.effort_daN === undefined || x.attributs.effort_daN === Number(a.effort_daN))) || null;
}

/* ---------- Listes dérivées pour les autres fiches ---------- */
export function sigles(categories) {
  const v = new Map();
  for (const a of etat.nomenclature.articles) {
    if (!categories.includes(a.categorie)) continue;
    const s = a.attributs && a.attributs.sigle;
    if (s && !v.has(s)) v.set(s, a);
  }
  return [...v.entries()].map(([sigle, article]) => ({ sigle, article }));
}

export function sectionsCables(domaine, pose, etatOuvrage = null) {
  // v1.4.6 §5 : l'EP a sa propre liste (charte.js → SECTIONS_EP) ; tout autre réseau suit le code ci-dessous, inchangé
  if (domaine === 'EP') {
    return sectionsEpPour(pose).map((e) => ({ section: e.section, article: articleParId(e.article) })).filter((x) => x.article);
  }
  const v = new Map();
  for (const a of etat.nomenclature.articles) {
    if (a.categorie !== 'CABLE' || !a.attributs || !a.attributs.section) continue;
    if (domaine && a.attributs.domaine && a.attributs.domaine !== domaine) continue;
    if (pose && a.attributs.pose && a.attributs.pose !== pose && pose !== 'facade') continue;
    if (!v.has(a.attributs.section)) v.set(a.attributs.section, a);
  }
  const liste = [...v.entries()].map(([section, article]) => ({ section, article }));
  // v1.4.9 §6 (H-268) : conducteurs nus en tête, BT aérien existant / à déposer / à remplacer seulement, sans article de câble
  if (sectionsNusApplicables(domaine, pose, etatOuvrage)) return [...SECTIONS_BT_NUS.map((e) => ({ section: e.section, article: null, article_depose: e.article_depose })), ...liste];
  return liste;
}

/* Articles de la catégorie ECLAIRAGE_PUBLIC (fiche des lanternes et boucles EP, v12 §7). */
export function articlesEclairagePublic(statut = null) {
  return etat.nomenclature.articles.filter((a) => a.categorie === 'ECLAIRAGE_PUBLIC' && (!statut || a.statut === statut));
}

export function fourreaux() {
  return etat.nomenclature.articles.filter((a) => a.categorie === 'FOURREAU').map((a) => {
    const d = a.attributs && a.attributs.diametre_mm;
    const acier = /acier/i.test(a.libelle);
    return { libelle: a.libelle, notation: d ? (acier ? 'acier ∅ ' + d : 'TPC ∅ ' + d) : a.libelle, matiere: acier ? 'ACIER' : 'TPC', diametre_mm: d ?? null, article: a };
  });
}

/* ---------- Correspondance article → objet à poser ---------- */
/* Retourne { type, attributs, domaine?, pose? } ou null si l'article ne se pose pas
 * comme objet (armements, déposes… → matériel associé). */
export function presetDepuisArticle(a) {
  const at = a.attributs || {};
  switch (a.categorie) {
    case 'SUPPORT':
      if (!at.materiau) return null;
      return { type: 'support', attributs: { materiau: at.materiau, hauteur_m: at.hauteur_m ?? null, classe: at.classe || '', effort_daN: at.effort_daN ?? null } };
    case 'COFFRET_BT':
      if (!at.sigle) return null;
      return { type: 'coffret', attributs: { sigle: at.sigle, nb_plages: at.nb_plages ?? null }, domaine: 'BTS' };
    case 'POSTE':
      if (!at.sigle) return null;
      return { type: 'poste', attributs: { sigle: at.sigle, puissance_kva: at.puissance_kva ?? null }, domaine: 'HTA' };
    case 'COUPURE_HTA':
      return { type: 'poste', attributs: { sigle: at.sigle || '' }, domaine: 'HTA', pose: at.reseau === 'souterrain' ? 'souterrain' : 'aerien' };
    case 'BOITE_JONCTION':
      if (a.sous_categorie === 'ACCESSOIRE_HTA_POSTE') return null;
      return { type: 'boite_jonction', attributs: { sections: at.sections || '' }, domaine: at.domaine || undefined };
    case 'MALT':
      return { type: 'malt', attributs: {} };
    case 'ERAS': {
      // Type d'après le domaine de l'article (a0376 « PV câble EP » est classé BT_RESEAU mais porte domaine EP), sinon la sous-catégorie
      const parDomaine = { HTA: 'HTA', BRT: 'BRANCHEMENT', EP: 'EP', BTS: 'BT_RESEAU' }[at.domaine];
      const st = parDomaine || { BT_RESEAU: 'BT_RESEAU', HTA: 'HTA', BRANCHEMENT: 'BRANCHEMENT', EP: 'EP' }[a.sous_categorie] || 'BT_RESEAU';
      const regle = regleMaltEras(a);   // 'oui' | 'non' | null (v12 §5.4.3)
      return { type: 'eras', attributs: { avec_malt: regle === 'oui', sous_type: st, malt_regle: regle }, domaine: at.domaine || undefined };
    }
    case 'ECLAIRAGE_PUBLIC': {
      const l = normaliser(a.libelle);
      if (/armoire|s17/.test(l)) return { type: 'armoire_ep', attributs: { sigle: 'S17' }, domaine: 'EP' };
      if (/s20/.test(l)) return { type: 'coffret', attributs: { sigle: 'S20' }, domaine: 'EP' };
      if (/lanterne/.test(l)) return { type: 'lanterne_ep', attributs: {}, domaine: 'EP' };
      if (/boucle/.test(l)) return { type: 'boucle_ep', attributs: {}, domaine: 'EP' };
      if (/lampe|luminaire|mat|candelabre|point lumineux/.test(l)) return { type: 'point_lumineux', attributs: {}, domaine: 'EP' };
      if (/boite de jonction/.test(l)) return { type: 'boite_jonction', attributs: {}, domaine: 'EP' };
      if (/cable/.test(l)) return { type: 'troncon', attributs: { section: 'EP', fourreau: /souterrain|tpc/.test(l) ? 'TPC ∅ 63' : '' }, domaine: 'EP' };
      return null;
    }
    case 'CABLE': {
      // v1.4.6 §5 : un câble U1000 R2V de la palette pose un tronçon EP souterrain à sa section (sans domaine ni
      // section dans nomenclature.json, il posait jusqu'ici un tronçon sans réseau). a0278 reste un branchement BRT.
      const ep = SECTIONS_EP.souterrain.find((e) => e.article === a.id);
      if (ep) return { type: 'troncon', attributs: { section: ep.section, section_retenue: '', nature: at.nature || '', norme: at.norme || '' }, domaine: 'EP', pose: 'souterrain' };
    }
      return { type: 'troncon', attributs: { section: at.section || '', section_retenue: '', nature: at.nature || '', norme: at.norme || '' }, domaine: at.domaine || undefined, pose: at.pose || undefined };
    case 'FOURREAU': {
      const d = at.diametre_mm;
      const acier = /acier/i.test(a.libelle);
      const notation = d ? ((acier ? 'acier ∅ ' : 'TPC ∅ ') + d) : a.libelle;
      return { type: 'fourreau', attributs: { matiere: acier ? 'ACIER' : 'TPC', diametre_mm: d ?? null, notation }, pose: 'souterrain' };
    }
    default:
      return null;
  }
}

/* ---------- Packages (regles.packages) ---------- */
/* Développe un package en lignes de matériel associé, récursivement (PACKAGE:MALT). */
export function lignesPackage(nom, profondeur = 0) {
  const packages = (etat.nomenclature.regles && etat.nomenclature.regles.packages) || {};
  const p = packages[nom];
  if (!p || profondeur > 3) return [];
  const lignes = [];
  for (const l of p) {
    const m = /^PACKAGE:(\w+)$/.exec(l.libelle || '');
    if (m) { lignes.push(...lignesPackage(m[1], profondeur + 1)); continue; }   // les sous-lignes gardent leur package d'origine
    const art = etat.nomenclature.articles.find((a) => normaliser(a.libelle).startsWith(normaliser(l.libelle).slice(0, 40)));
    lignes.push({
      source: art ? 'NOMENCLATURE' : 'LIBRE',
      ref_article: art ? art.id : null,
      libelle: l.libelle,
      quantite: (l.qte !== undefined) ? l.qte : 1,
      quantite_saisie: false,
      unite: l.unite || (art ? art.unite : ''),
      note: l.note || '',
      package: nom            // origine : permet la condensation sur l'étiquette (v10 §4.3)
    });
  }
  return lignes;
}

export function nomsPackages() {
  return Object.keys((etat.nomenclature.regles && etat.nomenclature.regles.packages) || {});
}

/* ---------- Règles d'aide (jamais bloquantes) ---------- */
export function regles() {
  return (etat.nomenclature && etat.nomenclature.regles) || {};
}

/* Suffixe d'armement (54 / 70) conseillé d'après la section d'un faisceau BT. */
export function neutrePorteurConseille(section) {
  const r = regles().armement_bt_neutre_porteur;
  if (!r || !section) return null;
  const s = normaliser(section).replace(/ /g, '');
  for (const suffixe of ['54', '70']) {
    if ((r[suffixe] || []).some((x) => s.includes(normaliser(x).replace(/ /g, '')))) return suffixe;
  }
  return null;
}

/* Nombre de plages attendu pour une borne REMBT (RM300 → 6…). */
export function plagesRembt(sigle) {
  const r = regles().rembt_plages;
  if (!r || !sigle) return null;
  const cle = Object.keys(r).find((k) => normaliser(k).replace(/ /g, '').endsWith(normaliser(sigle).replace(/rm/, 'rembt')));
  return cle ? r[cle] : null;
}

/* Grilles conseillées pour une borne CIBE selon la section du câble entrant. */
export function grillesCibe(sectionReseau) {
  const r = regles().cibe_grille_selon_section;
  if (!r || !sectionReseau) return [];
  const n = String(sectionReseau).match(/\d+/g);
  if (!n) return [];
  for (const cle of ['240', '150', '35']) if (n.includes(cle) && r[cle]) return r[cle];
  return [];
}

/* Aides MALT : liste des situations où elle est systématique / jamais posée. */
export function aideMalt() {
  const r = regles().malt_implantation;
  if (!r) return null;
  return { systematique: r.systematique_si || [], jamais: r.jamais_si || [], convention: r.convention_plan || '' };
}

/* Orthographe imposée (PSS-A, PSS-B…) : corrige les variantes courantes. */
export function corrigerOrthographe(texte) {
  const liste = regles().orthographe_imposee || [];
  let t = texte;
  for (const bon of liste) {
    const motif = new RegExp(bon.replace(/-/g, '[- ]?'), 'gi');
    t = t.replace(motif, bon);
  }
  return t;
}

/* Types d'ancrage en façade proposés pour un réseau (v1.4.8) : BT → EAF / EADF ; branchement → ancrage de branchement ;
 * autre réseau ou réseau inconnu → les trois. Articles absents de la nomenclature ignorés. */
export function typesAncrage(domaine) {
  const tous = Object.entries(TYPES_SUPPORT.ancrages);
  const filtres = tous.filter(([, v]) => v.domaine === domaine);
  return (filtres.length ? filtres : tous).map(([id]) => articleParId(id)).filter(Boolean);
}
