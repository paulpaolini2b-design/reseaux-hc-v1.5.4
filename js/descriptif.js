/* descriptif.js — descriptif des travaux (v1.5.0 §2) : génération, regroupement des tronçons, extrémités, fourniture,
 * empreintes, mise à jour depuis le plan, opérations de l'éditeur. Module pur (aucun DOM) : essais sous Node
 * (descriptif.test.mjs). Mise en page et primitives : descriptif-rendu.js ; éditeur : ui/descriptif.js.
 *
 * Principes (§2.1, §2.7) :
 * - un descriptif PAR PLAN (`plan.descriptif`), portant sur les objets de ce plan ;
 * - les lignes `origine: 'auto'` sont recalculées à chaque validation (historique.js → valider) ; les lignes
 *   `manuelle`, les lignes libres, l'ordre, les sauts de colonne, `champs` ne sont jamais modifiés ; `inclure` suit la
 *   règle « existant sans travaux » tant que l'utilisateur ne l'a pas changé (`inclure_manuel`, H-283) ;
 * - mise à jour idempotente : la rejouer sur un état déjà à jour ne change rien (annuler / rétablir restaurent un
 *   couple objets + descriptif cohérent).
 * Les longueurs viennent du seul champ `longueur_m` saisi : la mesure n'est jamais reprise.
 */
import { CHARTE, MM, libelleEtiquetteMateriel, LIBELLES, ABREVIATIONS_ETIQUETTE } from './charte.js';
import { etat } from './etat.js';
import { genererId, sectionAffichee, formaterLongueur, formaterAngle, TYPES_PONCTUELS, estObjetDessin, cloner } from './modele.js';

const D = () => CHARTE.descriptif;
/* Objets repris dans « Ouvrages » (§2.5). ERAS et MALT : rattachées à un hôte proche, sinon entrée propre. */
export const TYPES_OUVRAGES = ['support', 'coffret', 'poste', 'boite_jonction', 'armoire_ep', 'point_lumineux', 'lanterne_ep', 'boucle_ep'];
const TYPES_HOTES = ['support', 'coffret', 'poste'];
const TYPES_RATTACHABLES = ['eras', 'malt'];
export const DETAILS = ['auto', 'aucun', 'total', 'troncons', 'les_deux'];

/* ---------- Outils de texte ---------- */

/* Applique un format de charte : {jeton} remplacé ; [ … ] retiré en entier si l'un de ses jetons est vide. */
export function appliquerFormat(format, valeurs = {}, { majuscule = false } = {}) {
  const vide = (v) => v === null || v === undefined || String(v).trim() === '';
  let s = String(format || '').replace(/\[([^[\]]*)\]/g, (m, g) => {
    let manque = false;
    const r = g.replace(/\{(\w+)\}/g, (mm, k) => { if (vide(valeurs[k])) { manque = true; return ''; } return String(valeurs[k]); });
    return manque ? '' : r;
  });
  s = s.replace(/\{(\w+)\}/g, (m, k) => (vide(valeurs[k]) ? '' : String(valeurs[k])));
  s = s.replace(/ {2,}/g, ' ').replace(/ +([,.:)])/g, (m, c) => (c === ':' ? ' :' : c)).trim();
  if (majuscule && s) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

/* Empreinte courte (djb2) d'une valeur sérialisable. */
export function empreinte(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* Texte brut d'une ligne (toutes ses sous-lignes). */
export function texteLigne(l) {
  return ((l && l.segments) || []).map((sl) => (sl || []).map((s) => s.t || '').join('')).join('\n');
}
export function texteSegments(segs) { return (segs || []).map((s) => s.t || '').join(''); }

/* Comparaison « naturelle » (S2 avant S10). */
export function comparerNaturel(a, b) {
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}
function comparerOrdres(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : comparerNaturel(x, y);
    if (c) return c;
  }
  return 0;
}

const unite = (d) => (d && d.unite_lineaire) || D().unite_lineaire;
const nombre = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const L = (v, u) => (nombre(v) === null ? '' : formaterLongueur(v) + ' ' + u);

/* ---------- Structure ---------- */

export function largeurParDefaut(colonnes = 1) {
  const K = D();
  return 2 * K.marge + colonnes * K.largeur_colonne + (colonnes - 1) * K.espace_colonnes;
}

export function descriptifParDefaut() {
  const K = D();
  return {
    visible: true, x: null, y: null,
    largeur: largeurParDefaut(1), echelle: K.echelle_defaut, colonnes: 1,
    cadre: K.cadre_defaut, couleur_cadre: K.couleur_cadre_defaut, fond: K.fond_defaut,
    sortie_pdf: 'plan', unite_lineaire: K.unite_lineaire,
    entete: { lignes: [] },
    sections: [nouvelleSection('ouvrages'), nouvelleSection('troncons')],
    exclus: [],
    maj_le: new Date().toISOString()
  };
}

export function nouvelleSection(cle = 'libre', titre = null) {
  return { id: genererId('ds'), cle, titre, entrees: [] };
}

export function nouvelleLigne({ cle_auto = null, origine = 'manuelle', texte = '', segments = null, niveau = 0, puce = '', alignement = 'gauche', role = null, gras = false, couleur = null } = {}) {
  const seg = { t: texte };
  if (gras) seg.g = true;
  if (couleur) seg.c = couleur;
  const l = { id: genererId('dl'), cle_auto, origine, segments: segments || [texte ? [seg] : []], niveau, puce, alignement };
  if (role) l.role = role;
  return l;
}

export function nouvelleEntree(source, { inclure = true } = {}) {
  return {
    id: genererId('de'),
    source: { type: source.type, objet_ids: [...(source.objet_ids || [])], cle_groupe: source.cle_groupe ?? null },
    inclure, inclure_manuel: false,
    repere: [], repere_manuel: false,
    lignes: [],
    echantillon: source.type === 'groupe_troncons',
    saut_colonne_avant: false,
    champs: { tranchee: '', fourniture: null, detail: 'auto', sens: 'auto' },
    empreinte: '',
    alertes: []
  };
}

/* Complète un descriptif lu (ancien, importé, partiellement édité) sans rien retirer. */
export function normaliserDescriptif(d) {
  if (!d) return d;
  const def = descriptifParDefaut();
  for (const k of ['visible', 'x', 'y', 'largeur', 'echelle', 'colonnes', 'cadre', 'couleur_cadre', 'fond', 'sortie_pdf', 'unite_lineaire']) if (d[k] === undefined) d[k] = def[k];
  if (![1, 2, 3].includes(Number(d.colonnes))) d.colonnes = 1; else d.colonnes = Number(d.colonnes);
  if (!d.entete || !Array.isArray(d.entete.lignes)) d.entete = { lignes: [] };
  if (!Array.isArray(d.sections)) d.sections = [];
  for (const cle of ['ouvrages', 'troncons']) if (!d.sections.some((s) => s.cle === cle)) d.sections.push(nouvelleSection(cle));
  for (const s of d.sections) {
    if (!Array.isArray(s.entrees)) s.entrees = [];
    for (const e of s.entrees) {
      if (!e.champs) e.champs = { tranchee: '', fourniture: null, detail: 'auto', sens: 'auto' };
      if (e.champs.detail === undefined) e.champs.detail = 'auto';
      if (e.champs.sens !== 'inverse') e.champs.sens = 'auto';   // v1.5.3
      if (!Array.isArray(e.lignes)) e.lignes = [];
      if (!Array.isArray(e.alertes)) e.alertes = [];
      if (!Array.isArray(e.repere)) e.repere = [];
      if (!e.source) e.source = { type: 'libre', objet_ids: [], cle_groupe: null };
    }
  }
  if (!Array.isArray(d.exclus)) d.exclus = [];
  return d;
}

export function toutesEntrees(d) { return d ? d.sections.flatMap((s) => s.entrees) : []; }
export function trouverEntree(d, id) {
  for (const s of (d ? d.sections : [])) { const i = s.entrees.findIndex((e) => e.id === id); if (i >= 0) return { section: s, index: i, entree: s.entrees[i] }; }
  return null;
}
export function aDuManuel(e) { return !!e && ((e.lignes || []).some((l) => l.origine === 'manuelle') || !!e.repere_manuel); }

/* ---------- Contexte d'une mise à jour (rattachements, voisinages) ---------- */

export function toleranceDescriptif() { return D().tolerance_accrochage_mm * MM; }

function contexte(plan, projet) {
  const objets = (plan.objets || []).filter((o) => !estObjetDessin(o));
  const parId = new Map(objets.map((o) => [o.id, o]));
  const tol = toleranceDescriptif();
  const dist = (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  const hotes = objets.filter((o) => TYPES_HOTES.includes(o.type));
  const attaches = new Map();   // hôte → [ERAS / MALT]
  const hoteDe = new Map();     // ERAS / MALT → hôte
  for (const o of objets) {
    if (!TYPES_RATTACHABLES.includes(o.type)) continue;
    let best = null;
    for (const h of hotes) { const d = dist(o, h); if (d <= tol && (!best || d < best.d)) best = { h, d }; }
    if (best) { hoteDe.set(o.id, best.h.id); if (!attaches.has(best.h.id)) attaches.set(best.h.id, []); attaches.get(best.h.id).push(o); }
  }
  for (const l of attaches.values()) l.sort((a, b) => comparerNaturel(a.repere || '', b.repere || ''));
  const candidats = objets.filter((o) => TYPES_PONCTUELS.includes(o.type) && !hoteDe.has(o.id));
  const objetProche = (p) => {
    let best = null;
    for (const o of candidats) { const d = dist(p, o); if (d <= tol && (!best || d < best.d)) best = { o, d }; }
    return best ? best.o : null;
  };
  // v1.5.3 (H-304) : rang d'un ouvrage dans la section « Ouvrages » telle qu'elle est (ordre par défaut ou déplacé à la
  // main) ; -1 s'il n'y figure pas. Lu à chaque appel : reflète les entrées insérées pendant la mise à jour.
  const rangOuvrage = (o) => {
    const d = plan.descriptif;
    const s = d && (d.sections || []).find((x) => x.cle === 'ouvrages');
    if (!s || !o) return -1;
    return s.entrees.findIndex((e) => e.source && Array.isArray(e.source.objet_ids) && e.source.objet_ids.includes(o.id));
  };
  return { plan, projet, objets, parId, tol, attaches, hoteDe, objetProche, dist, rangOuvrage, u: unite(plan.descriptif) };
}

/* ---------- En-tête (§2.4) ---------- */

function lignesEntete(projet) {
  const E = D().entete;
  const p = projet || {};
  const res = [];
  const opt = { niveau: 0, puce: '', alignement: 'centre', gras: true };
  if (p.commune && String(p.commune).trim()) res.push({ cle: 'entete.commune', texte: String(p.commune).trim().toUpperCase(), ...opt, role: 'titre' });
  if (p.nom && String(p.nom).trim()) res.push({ cle: 'entete.affaire', texte: String(p.nom).trim().toUpperCase(), ...opt, role: 'titre' });
  // v1.5.1 : point GPS de l'affaire (facultatif) ; vide → ligne de l'éditeur seulement, absente du rendu
  const gps = formaterGps(p.gps);
  res.push({ cle: 'entete.gps', texte: gps ? appliquerFormat(E.gps, { gps }) : '', ...opt });
  if (p.num_edf && String(p.num_edf).trim()) res.push({ cle: 'entete.edf', texte: appliquerFormat(E.edf, { num_edf: String(p.num_edf).trim() }), ...opt });
  if (p.num_sieep && String(p.num_sieep).trim()) res.push({ cle: 'entete.sieep', texte: appliquerFormat(E.sieep, { num_sieep: String(p.num_sieep).trim() }), ...opt });
  return res;
}

/* ---------- Point GPS de l'affaire (v1.5.1) ----------
 * Saisie souple : « 42.1028902, 9.2117636 » (copie Google Maps), « 42,1028902. 9,2117636 », « 42,1028902 9,2117636 »,
 * lien Google Maps (…@42.1028902,9.2117636… ou …q=42.1028902,9.2117636…). Retourne { lat, lon } ou null.
 * Stockage et affichage au format Google Maps (point décimal, virgule + espace) : collable tel quel dans Google Maps. */
export function analyserGps(texte) {
  const s = String(texte || '').trim();
  if (!s) return null;
  let m = /[@=](-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(s);
  let lat, lon;
  if (m) { lat = Number(m[1]); lon = Number(m[2]); }
  else {
    const n = s.match(/-?\d+(?:[.,]\d+)?/g) || [];
    if (n.length !== 2) return null;
    lat = Number(n[0].replace(',', '.')); lon = Number(n[1].replace(',', '.'));
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
export function formaterGps(v) {
  const g = typeof v === 'string' ? analyserGps(v) : v;
  if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return '';
  const f = (x) => String(Math.round(x * 1e7) / 1e7);
  return f(g.lat) + ', ' + f(g.lon);
}
export function lienGoogleMaps(v) {
  const t = formaterGps(v);
  return t ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.replace(' ', '')) : '';
}

/* ---------- Ouvrages (§2.5) ---------- */

function article(id) {
  const n = etat.nomenclature;
  return id && n && n.articles ? n.articles.find((a) => a.id === id) || null : null;
}

function designationBase(o) {
  const m = o.designation_manuelle && String(o.designation_manuelle).trim();
  if (m) return m;
  if (o.designation_auto) return o.designation_auto;
  return LIBELLES.types[o.type] || o.type;
}

function cibleRemplacement(o) {
  const r = o.remplacement_par;
  return r && r.designation ? String(r.designation).trim() : '';
}

export function abreviationReseau(domaine, pose) {
  const r = D().reseaux[domaine];
  if (!r) return domaine || '';
  return r[pose] || r.aerien || '';
}

function libelleCoffret(o) {
  const a = o.attributs || {};
  return D().libelles_coffret[o.ref_article] || a.sigle || '';
}

function plagesCoffret(o) {
  const a = o.attributs || {};
  if (nombre(a.nb_plages)) return nombre(a.nb_plages);
  const art = article(o.ref_article);
  return art && art.attributs && nombre(art.attributs.nb_plages) ? nombre(art.attributs.nb_plages) : null;
}

export function premiereLigneOuvrage(o) {
  const F = D().formats;
  const a = o.attributs || {};
  const cible = cibleRemplacement(o);
  const v = { designation: designationBase(o), cible };
  let table;
  switch (o.type) {
    case 'support': table = F.support; v.angle = formaterAngle(a.angle_gr); break;
    case 'coffret': table = F.coffret; v.libelle = libelleCoffret(o); v.nb_plages = plagesCoffret(o); break;
    case 'poste': table = F.poste; v.nom = a.nom; v.sigle = a.sigle; v.puissance = nombre(a.puissance_kva); break;
    case 'boite_jonction': table = F.boite_jonction; v.reseau = abreviationReseau(o.domaine, o.pose); v.sections = a.sections; break;
    case 'eras': table = F.eras; v.type = D().types_eras[a.sous_type] || ''; break;
    case 'malt': table = F.malt; break;
    default: table = F.ep;
  }
  let fmt = table[o.etat];
  if (o.etat === 'a_reprendre' && !cible && table.a_reprendre_sans_cible) fmt = table.a_reprendre_sans_cible;
  if (!fmt) fmt = table.existant;
  return appliquerFormat(fmt, v);
}

function commenceParVerbe(lib) {
  const premier = String(lib || '').trim().split(/\s+/)[0] || '';
  return D().materiel.verbes.some((v) => v.toLowerCase() === premier.toLowerCase());
}

function abreviationArticle(m, art) {
  if (D().materiel.abreviation === 'sigle' && art && art.attributs && art.attributs.sigle) return art.attributs.sigle;
  return libelleEtiquetteMateriel(m);
}

/* Lignes de matériel associé : package MALT condensé, verbes repris, articles « Pose q abréviation », libres. */
function lignesMateriel(o, prefixe) {
  const F = D().formats;
  const res = [];
  const occ = new Map();
  let malt = false;
  for (const m of o.materiel_associe || []) {
    if (m.package === 'MALT') { if (!malt) { res.push({ cle: prefixe + 'malt', texte: F.malt_confection }); malt = true; } continue; }
    const q = nombre(m.quantite);
    const k = m.ref_article || m.libelle || '';
    const n = (occ.get(k) || 0) + 1; occ.set(k, n);
    const cle = prefixe + 'mat:' + k + ':' + n;
    const art = m.ref_article ? article(m.ref_article) : null;
    let texte;
    if (m.ref_article && (art || m.source === 'NOMENCLATURE')) {
      const lib = (art && art.libelle) || m.libelle || '';
      if (commenceParVerbe(lib)) texte = appliquerFormat(F.materiel_verbe, { libelle: lib, q: q !== null && q > 1 ? formaterLongueur(q) : '' });
      else {
        // v1.5.1 (H-295) : jonctions, dérivations, EAJSE, ERAS / RAS → « Confection q … »
        const fmt = (D().materiel.confection || []).includes(m.ref_article) ? F.materiel_confection : F.materiel_article;
        texte = appliquerFormat(fmt, { q: formaterLongueur(q ?? 1), abreviation: abreviationArticle(m, art) });
      }
    } else {
      const afficherQ = (q !== null && q !== 1) || (m.quantite_saisie && q !== null);
      texte = appliquerFormat(F.materiel_libre, { q: afficherQ ? formaterLongueur(q) : '', libelle: String(m.libelle || '').trim() });
    }
    if (texte) res.push({ cle, texte });
  }
  return { lignes: res, malt };
}

function lignesObjet(o, ctx, k) {
  const F = D().formats;
  const pre = o.id + ':';
  const lignes = [];
  const prefixeRepere = k > 0 && o.repere ? o.repere + '. ' : '';
  lignes.push({ cle: pre + 'tete', texte: prefixeRepere + premiereLigneOuvrage(o) });
  const att = ctx.attaches.get(o.id) || [];
  let travaux = o.etat !== 'existant';
  // 1. ERAS rattachées (l'ERAS existante qui reste en place n'est pas un travail : non reprise, H-277)
  for (const r of att.filter((x) => x.type === 'eras')) {
    if (r.etat === 'existant') continue;
    lignes.push({ cle: pre + 'eras:' + r.id, texte: premiereLigneOuvrage(r) });
    travaux = true;
  }
  // 2. Armement d'un support à poser (attribut de la fiche, porté sur l'étiquette — H-279)
  const a = o.attributs || {};
  if (o.type === 'support' && o.etat === 'a_poser' && a.armement && a.materiau !== 'ANCRAGE') {
    const art = article(a.armement_ref);
    const ab = art ? abreviationArticle({ ref_article: art.id, libelle: art.libelle }, art) : (ABREVIATIONS_ETIQUETTE[a.armement_ref] || a.armement);
    lignes.push({ cle: pre + 'armement', texte: appliquerFormat(F.armement, { armement: ab }) });
  }
  // 3. Matériel associé
  const mat = lignesMateriel(o, pre);
  if (mat.lignes.length) travaux = true;
  lignes.push(...mat.lignes);
  // 4. MALT rattachée : « Confection MALT » à poser (si le package n'est pas déjà listé) ; dépose / remplacement par sa ligne
  for (const m of att.filter((x) => x.type === 'malt')) {
    if (m.etat === 'existant') continue;
    travaux = true;
    if (m.etat === 'a_poser') { if (!mat.malt && !lignes.some((l) => l.cle === pre + 'malt_rattachee')) lignes.push({ cle: pre + 'malt_rattachee', texte: F.malt_confection }); }
    else lignes.push({ cle: pre + 'malt:' + m.id, texte: premiereLigneOuvrage(m) });
  }
  // 5. Mention libre (le commentaire n'est jamais repris)
  if (o.mention && String(o.mention).trim()) { lignes.push({ cle: pre + 'mention', texte: String(o.mention).trim() }); travaux = true; }
  return { lignes, travaux };
}

function ordreObjet(o) {
  const K = D();
  const r = String(o.repere || '').trim();
  if (!r) return [9, 999, '', 0, o.id];
  const m = /^([A-Za-zÀ-ÿ]+)\s*(\d+)?/.exec(r);
  const fam = m ? m[1].toUpperCase() : r.toUpperCase();
  const i = K.ordre_familles.indexOf(fam);
  return [0, i < 0 ? K.ordre_familles.length : i, fam, m && m[2] !== undefined ? Number(m[2]) : -1, r];
}

function contenuObjets(entree, ctx) {
  const objs = entree.source.objet_ids.map((id) => ctx.parId.get(id))
    .filter((o) => o && !(TYPES_RATTACHABLES.includes(o.type) && ctx.hoteDe.has(o.id)));
  if (!objs.length) return null;
  const principal = objs[0];
  const lignes = [];
  let travaux = false;
  objs.forEach((o, k) => { const r = lignesObjet(o, ctx, k); lignes.push(...r.lignes); travaux = travaux || r.travaux; });
  const alertes = principal.repere ? [] : ['sans_repere'];
  return {
    repere: principal.repere ? principal.repere + '.' : '',
    lignes, alertes,
    inclure: travaux,
    ordre: ordreObjet(principal),
    objet_ids: objs.map((o) => o.id)
  };
}

/* ---------- Tronçons (§2.6) ---------- */

export function cleGroupe(t) {
  return [t.domaine, t.pose, t.etat, sectionAffichee(t) || ''].join('|');
}
const clesDe = (entree) => String(entree.source.cle_groupe || '').split('\n').filter(Boolean);

/* Analyse des tronçons d'un groupe : nœuds d'extrémité (fusionnés à la tolérance), objet repéré de chaque nœud,
 * chaîne unique orientée (depuis un poste, sinon un coffret, sinon le sens du tracé du premier tronçon). */
export function analyserTroncons(troncons, ctx) {
  const noeuds = [];
  const noeudDe = (p) => {
    for (const n of noeuds) if (Math.hypot(n.x - p.x, n.y - p.y) <= ctx.tol) return n;
    const n = { x: p.x, y: p.y, degre: 0, objet: ctx.objetProche(p) };
    noeuds.push(n);
    return n;
  };
  const aretes = troncons.filter((t) => t.points && t.points.length >= 2).map((t) => {
    const a = noeudDe(t.points[0]), b = noeudDe(t.points[t.points.length - 1]);
    a.degre++; b.degre++;
    return { t, a, b };
  });
  const ordreTrace = aretes.map((r) => ({ t: r.t, de: r.a, vers: r.b }));
  let chaine = null;
  if (aretes.length && aretes.length === noeuds.length - 1 && noeuds.every((n) => n.degre <= 2)) {
    const bouts = noeuds.filter((n) => n.degre === 1);
    const parcours = (depart) => {
      const res = []; const vus = new Set(); let n = depart;
      while (true) {
        const r = aretes.find((x) => !vus.has(x) && (x.a === n || x.b === n));
        if (!r) break;
        vus.add(r);
        const vers = r.a === n ? r.b : r.a;
        res.push({ t: r.t, de: n, vers });
        n = vers;
      }
      return res;
    };
    if (bouts.length === 2) {
      const p1 = parcours(bouts[0]);
      if (p1.length === aretes.length) {
        const typeDe = (n) => (n.objet ? n.objet.type : '');
        const repere = (n) => (n.objet && String(n.objet.repere || '').trim() ? n.objet : null);
        let depart;
        // v1.5.3 (H-304) : sens par défaut = ordre de la section « Ouvrages » du descriptif (S1 → A1 → … → A6, y compris
        // après un déplacement manuel des entrées) quand les deux extrémités y figurent ; sinon ordre par défaut des repères
        // si les deux en portent ; sinon règle v1.5.0 (poste, puis coffret, puis sens du premier tronçon tracé)
        // Critère : le parcours depuis bouts[0] « monte »-t-il dans cet ordre ? (pas montants − pas descendants entre
        // ouvrages consécutifs connus) — S1-A1-…-A6 part de S1 même si S1 est classé après les A dans les Ouvrages.
        const noeudsP1 = [bouts[0], ...p1.map((x) => x.vers)];
        const score = (cle, cmpCles) => {
          const k = noeudsP1.map((n) => cle(n)).filter((x) => x !== null);
          let sc = 0;
          for (let i = 1; i < k.length; i++) sc += Math.sign(cmpCles(k[i], k[i - 1]));
          if (!sc && k.length >= 2) sc = Math.sign(cmpCles(k[k.length - 1], k[0]));
          return sc;
        };
        const parRang = score((n) => { const r = ctx.rangOuvrage ? ctx.rangOuvrage(n.objet) : -1; return r >= 0 ? r : null; }, (a, b) => a - b);
        const parRepere = score((n) => (repere(n) ? ordreObjet(repere(n)) : null), comparerOrdres);
        const cmp = parRang ? -parRang : -parRepere;   // cmp < 0 : départ = bouts[0]
        if (cmp) depart = cmp < 0 ? bouts[0] : bouts[1];
        else if (typeDe(bouts[0]) === 'poste' || typeDe(bouts[1]) === 'poste') depart = typeDe(bouts[0]) === 'poste' ? bouts[0] : bouts[1];
        else if (typeDe(bouts[0]) === 'coffret' || typeDe(bouts[1]) === 'coffret') depart = typeDe(bouts[0]) === 'coffret' ? bouts[0] : bouts[1];
        else {
          const premier = p1.find((x) => x.t === aretes[0].t);
          depart = premier && premier.de === aretes[0].a ? bouts[0] : bouts[1];
        }
        const ordre = depart === bouts[0] ? p1 : parcours(bouts[1]);
        chaine = { ordre, debut: depart, fin: ordre.length ? ordre[ordre.length - 1].vers : depart };
      }
    }
  }
  return { noeuds, aretes, chaine, ordre: chaine ? chaine.ordre : ordreTrace };
}

/* Émergence (§2.6) : extrémité accrochée à un objet qui fait sortir le câble de la tranchée. */
export function estEmergence(obj, domaine, ctx) {
  const R = D().fourniture.emergences[domaine];
  if (!R || !obj) return false;
  const typeEras = (x) => D().types_eras[(x.attributs || {}).sous_type];
  const erasOk = (x) => !R.eras_types || R.eras_types.includes(typeEras(x));
  if (obj.type === 'eras') return R.types.includes('eras') && erasOk(obj);
  if (R.types.includes(obj.type)) return true;
  if (obj.type === 'support' && R.support_avec_eras) return (ctx.attaches.get(obj.id) || []).some((x) => x.type === 'eras' && erasOk(x));
  return false;
}

/* Fourniture d'un ensemble de tronçons (§2.6). Retourne null s'il n'y a pas de règle (BRT, EP), sinon
 * { valeur, incomplete, explication }. Partie par partie (réseau + pose), sommées. */
export function calculerFourniture(troncons, ctx) {
  const F = D().fourniture;
  const u = ctx.u;
  const parties = new Map();
  for (const t of troncons) {
    const k = t.domaine + '|' + t.pose;
    if (!parties.has(k)) parties.set(k, { domaine: t.domaine, pose: t.pose, troncons: [] });
    parties.get(k).troncons.push(t);
  }
  if ([...parties.values()].some((p) => F.sans_regle.includes(p.domaine))) return null;
  let total = 0, incomplete = false;
  const expl = [];
  for (const p of parties.values()) {
    let lin = 0;
    for (const t of p.troncons) { const v = nombre(t.attributs && t.attributs.longueur_m); if (v === null) incomplete = true; else lin += v; }
    lin = Math.round(lin * 1000) / 1000;
    if (p.pose === 'souterrain' && F.par_extremite_souterrain && F.par_extremite_souterrain[p.domaine] !== undefined) {
      // v1.5.1 (H-296) : BT souterraine — + k ml au départ et + k ml à l'arrivée de chaque tronçon tracé
      const k = F.par_extremite_souterrain[p.domaine];
      const nt = p.troncons.length;
      total += lin + nt * 2 * k;
      expl.push(formaterLongueur(lin) + ' ' + u + ' + ' + nt + ' tronçon' + (nt > 1 ? 's' : '') + ' × 2 extrémités × ' + formaterLongueur(k) + ' ' + u);
    } else if (p.pose === 'souterrain') {
      const k = F.par_emergence[p.domaine];
      if (k === undefined) return null;
      let n = 0;
      for (const t of p.troncons) {
        if (!t.points || t.points.length < 2) { incomplete = true; continue; }
        for (const q of [t.points[0], t.points[t.points.length - 1]]) {
          const o = ctx.objetProche(q);
          if (!o) incomplete = true;
          else if (estEmergence(o, p.domaine, ctx)) n++;
        }
      }
      total += lin + n * k;
      expl.push(formaterLongueur(lin) + ' ' + u + ' + ' + n + ' émergence' + (n > 1 ? 's' : '') + ' × ' + formaterLongueur(k) + ' ' + u);
    } else if (F.sans_majoration.includes(p.pose)) {
      total += lin;
      expl.push(formaterLongueur(lin) + ' ' + u + ' (façade, sans majoration)');
    } else {
      const brut = Math.round(lin * F.coefficient_aerien * 1e6) / 1e6;   // 100 × 1,08 = 108,00000000000001 sans arrondi préalable
      const v = Math.ceil(brut);
      total += v;
      expl.push(formaterLongueur(lin) + ' ' + u + ' × ' + String(F.coefficient_aerien).replace('.', ',') + ' = ' + String(brut).replace('.', ',') + ' → ' + v + ' ' + u);
    }
  }
  total = Math.round(total * 1000) / 1000;
  return { valeur: total, incomplete, explication: expl.join(' ; ') };
}

function libelleFourreau(f) {
  const a = f.attributs || {};
  if (a.notation && String(a.notation).trim()) return String(a.notation).trim();
  const mat = String(a.matiere || 'TPC').toUpperCase() === 'ACIER' ? 'acier' : 'TPC';
  return a.diametre_mm ? mat + ' Ø' + a.diametre_mm : mat;
}

function detailEffectif(entree, etatT, pose, n) {
  const d = (entree.champs && entree.champs.detail) || 'auto';
  if (d !== 'auto') return d;
  // auto (H-284) : souterrain à poser → détail par tronçon s'il y en a plusieurs, sinon le total ; les autres têtes
  // portent déjà le total (« Long = », « = ») : aucun détail (recette 5055 : tête + fourniture).
  if (etatT === 'a_poser' && pose === 'souterrain') return n > 1 ? 'les_deux' : 'total';
  return 'aucun';
}

function joindreDistincts(valeurs) {
  const v = [];
  for (const x of valeurs) { const s = String(x || '').trim(); if (s && !v.includes(s)) v.push(s); }
  return v.join(' et ');
}

function contenuGroupe(entree, ctx) {
  const F = D().formats.troncon;
  const cles = clesDe(entree);
  const troncons = ctx.objets.filter((o) => o.type === 'troncon' && cles.includes(cleGroupe(o)));
  if (!troncons.length) return null;
  const u = ctx.u;
  const t0 = troncons[0];
  const etatT = t0.etat, pose = t0.pose;
  const reseau = joindreDistincts(troncons.map((t) => abreviationReseau(t.domaine, t.pose)));
  const section = joindreDistincts(troncons.map((t) => sectionAffichee(t)));
  const an = analyserTroncons(troncons, ctx);
  // v1.5.3 (H-304) : sens inversé à la main (champ « Sens » de l'entrée)
  if (entree.champs && entree.champs.sens === 'inverse') {
    an.ordre = an.ordre.slice().reverse().map((r) => ({ t: r.t, de: r.vers, vers: r.de }));
    if (an.chaine) an.chaine = { ordre: an.ordre, debut: an.chaine.fin, fin: an.chaine.debut };
  }
  let somme = 0, manquants = 0;
  for (const t of troncons) { const v = nombre(t.attributs && t.attributs.longueur_m); if (v === null) manquants++; else somme += v; }
  somme = Math.round(somme * 1000) / 1000;
  const totalTxt = manquants ? appliquerFormat(F.incomplet, { total: formaterLongueur(somme) + ' ' + u, n: manquants }) : formaterLongueur(somme) + ' ' + u;
  const rep = (n) => (n && n.objet && n.objet.repere ? n.objet.repere : '');
  const debut = an.chaine ? rep(an.chaine.debut) : '';
  const fin = an.chaine ? rep(an.chaine.fin) : '';
  const tranchee = String((entree.champs && entree.champs.tranchee) || '').trim().replace(/^\((.*)\)$/, '$1');
  const cible = joindreDistincts(troncons.map((t) => cibleRemplacement(t)));
  const v = { reseau, section, total: totalTxt, debut, fin, tranchee, cible };
  let fmt;
  if (etatT === 'existant') fmt = F.existant;
  else if (etatT === 'a_deposer') fmt = F.a_deposer;
  else if (etatT === 'a_reprendre') fmt = F.a_reprendre;
  else fmt = pose === 'souterrain' ? F.a_poser_souterrain : F.a_poser_aerien;
  const alertes = [];
  const lignes = [{ cle: 'tete', texte: appliquerFormat(fmt, v) }];
  const teteAvecExtremites = /\{debut\}/.test(fmt) && an.chaine;
  if (teteAvecExtremites && (!debut || !fin)) alertes.push('extremite_inconnue');
  // Mentions (une par texte distinct)
  const vusM = new Set();
  for (const t of troncons) {
    const m = String(t.mention || '').trim();
    if (m && !vusM.has(m)) { vusM.add(m); lignes.push({ cle: 'mention:' + t.id, texte: m }); }
  }
  if (etatT !== 'existant') {
    const detail = detailEffectif(entree, etatT, pose, troncons.length);
    // v1.5.1 : revêtements (plusieurs par tronçon souterrain, chacun avec son linéaire)
    const revs = new Map(troncons.map((t) => [t.id, revetementsTroncon(t)]));
    for (const t of troncons) if (pose === 'souterrain' && revs.get(t.id).ecart) { if (!alertes.includes('revetements')) alertes.push('revetements'); }
    if (detail === 'troncons' || detail === 'les_deux') {
      for (const r of an.ordre) {
        const a = rep(r.de), b = rep(r.vers);
        if (!a || !b) { if (!alertes.includes('extremite_inconnue')) alertes.push('extremite_inconnue'); }
        const lt = L(r.t.attributs && r.t.attributs.longueur_m, u);
        const rv = pose === 'souterrain' ? revs.get(r.t.id) : { liste: [] };
        const unique = rv.liste.length === 1 && rv.liste[0].longueur === null;
        lignes.push({ cle: 'tr:' + r.t.id, texte: appliquerFormat(F.detail, { a, b, longueur: lt, nature: unique ? rv.liste[0].libelle : '' }, { majuscule: true }), niveau: 1 });
        if (!unique) rv.liste.forEach((x, i) => lignes.push({ cle: 'tr:' + r.t.id + ':nature:' + i, texte: appliquerFormat(F.nature, { nature: x.libelle, longueur: L(x.longueur, u) }), niveau: 2, puce: '•' }));
      }
    }
    if (detail === 'total' || detail === 'les_deux') lignes.push({ cle: 'total', texte: appliquerFormat(F.total, { total: totalTxt }) });
    if (detail === 'total' && pose === 'souterrain') {
      // Total seul : revêtements cumulés par nature sur l'ensemble des tronçons du groupe
      for (const [i, x] of cumulerRevetements(troncons, revs).entries()) lignes.push({ cle: 'nature:' + x.cle + ':' + i, texte: appliquerFormat(F.nature, { nature: x.libelle, longueur: L(x.longueur, u) }), niveau: 1, puce: '•' });
    }
    // Fourreaux accrochés à un tronçon du groupe
    const ids = new Set(troncons.map((t) => t.id));
    for (const f of ctx.objets.filter((o) => o.type === 'fourreau' && o.troncon_id && ids.has(o.troncon_id))) {
      lignes.push({ cle: 'fourreau:' + f.id, texte: appliquerFormat(F.fourreau, { fourreau: libelleFourreau(f), longueur: L(f.attributs && f.attributs.longueur_m, u) }) });
    }
  }
  if (manquants && etatT !== 'existant') alertes.push('longueur_manquante');
  // Fourniture : à poser et à remplacer
  let calcul = null;
  if (etatT === 'a_poser' || etatT === 'a_reprendre') {
    const saisie = entree.champs && entree.champs.fourniture !== null && entree.champs.fourniture !== undefined && String(entree.champs.fourniture).trim() !== '' ? String(entree.champs.fourniture).trim() : null;
    calcul = calculerFourniture(troncons, ctx);
    let valeur = '';
    if (saisie !== null) valeur = /^\d+([,.]\d+)?$/.test(saisie) ? saisie.replace('.', ',') + ' ' + u : saisie;
    else if (calcul) {
      valeur = formaterLongueur(calcul.valeur) + ' ' + u;
      if (calcul.incomplete) { valeur = appliquerFormat(F.incomplete, { valeur }); alertes.push('fourniture_incomplete'); }
    }
    if (valeur) lignes.push({ cle: 'fourniture', texte: appliquerFormat(F.fourniture, { section, fourniture: valeur }) });
  }
  if (troncons.some((t) => t.attributs && t.attributs.tranchee_commune)) lignes.push({ cle: 'tranchee_commune', texte: F.tranchee_commune });
  const K = D();
  const idx = (liste, v) => { const i = liste.indexOf(v); return i < 0 ? liste.length : i; };
  return {
    repere: '', lignes, alertes, inclure: true,
    ordre: [1, idx(K.ordre_etats, etatT), idx(K.ordre_reseaux, t0.domaine), idx(K.ordre_poses, pose), sectionAffichee(t0) || ''],
    objet_ids: troncons.map((t) => t.id),
    style_echantillon: { domaine: t0.domaine, pose: t0.pose, etat: etatT },
    calcul_fourniture: calcul ? calcul.explication : null
  };
}

/* v1.5.1 — Revêtements d'un tronçon : [{ cle, libelle, longueur }] (longueur null = tout le tronçon, revêtement unique).
 * `ecart` : plusieurs revêtements dont un linéaire manque, ou somme différente (> 0,05 ml) de la longueur saisie. */
export function revetementsTroncon(t) {
  const a = (t && t.attributs) || {};
  const brut = Array.isArray(a.revetements) && a.revetements.length ? a.revetements : (a.nature_terrain ? [{ nature: a.nature_terrain, longueur_m: null }] : []);
  const liste = brut.filter((r) => r && r.nature).map((r) => ({
    cle: r.nature,
    libelle: D().natures_terrain[r.nature] || String(r.nature).replace(/_/g, ' ').toLowerCase(),
    longueur: nombre(r.longueur_m)
  }));
  let ecart = false;
  if (liste.length > 1 || (liste.length === 1 && liste[0].longueur !== null)) {
    if (liste.some((x) => x.longueur === null)) ecart = true;
    else {
      const lt = nombre(a.longueur_m);
      const somme = liste.reduce((s, x) => s + x.longueur, 0);
      if (lt !== null && Math.abs(somme - lt) > 0.05) ecart = true;
    }
  }
  return { liste, ecart };
}

function cumulerRevetements(troncons, revs) {
  const parCle = new Map();
  for (const t of troncons) {
    const lt = nombre(t.attributs && t.attributs.longueur_m);
    for (const x of revs.get(t.id).liste) {
      const v = x.longueur !== null ? x.longueur : lt;
      if (!parCle.has(x.cle)) parCle.set(x.cle, { cle: x.cle, libelle: x.libelle, longueur: 0, manque: false });
      const c = parCle.get(x.cle);
      if (v === null) c.manque = true; else c.longueur = Math.round((c.longueur + v) * 1000) / 1000;
    }
  }
  return [...parCle.values()].map((c) => ({ ...c, longueur: c.manque && !c.longueur ? null : c.longueur }));
}

function contenuFourreau(entree, ctx) {
  const F = D().formats.troncon;
  const f = ctx.parId.get(entree.source.objet_ids[0]);
  if (!f || f.type !== 'fourreau' || (f.troncon_id && ctx.parId.has(f.troncon_id))) return null;
  const K = D();
  const idx = (liste, v) => { const i = liste.indexOf(v); return i < 0 ? liste.length : i; };
  return {
    repere: '', alertes: [], inclure: true,
    lignes: [{ cle: 'tete', texte: appliquerFormat(F.fourreau_seul, { fourreau: libelleFourreau(f), etat: K.etats_fourreau[f.etat] || '', longueur: L(f.attributs && f.attributs.longueur_m, ctx.u) }) }],
    ordre: [1, idx(K.ordre_etats, f.etat), K.ordre_reseaux.length + 1, 0, libelleFourreau(f)],
    objet_ids: [f.id],
    style_echantillon: null
  };
}

function contenuEntree(entree, ctx) {
  switch (entree.source.type) {
    case 'objet': return contenuObjets(entree, ctx);
    case 'groupe_troncons': return contenuGroupe(entree, ctx);
    case 'fourreau': return contenuFourreau(entree, ctx);
    default: return null;
  }
}

/* Sources « naturelles » du plan : une par ouvrage, par groupe de tronçons, par fourreau seul. */
function sourcesNaturelles(ctx) {
  const res = [];
  for (const o of ctx.objets) {
    if (TYPES_OUVRAGES.includes(o.type) || (TYPES_RATTACHABLES.includes(o.type) && !ctx.hoteDe.has(o.id))) {
      res.push({ section: 'ouvrages', source: { type: 'objet', objet_ids: [o.id], cle_groupe: null }, exclu: o.id });
    }
  }
  const vues = new Set();
  for (const t of ctx.objets.filter((o) => o.type === 'troncon')) {
    const k = cleGroupe(t);
    if (vues.has(k)) continue;
    vues.add(k);
    res.push({ section: 'troncons', source: { type: 'groupe_troncons', objet_ids: [], cle_groupe: k }, exclu: 'groupe:' + k });
  }
  for (const f of ctx.objets.filter((o) => o.type === 'fourreau' && !(o.troncon_id && ctx.parId.has(o.troncon_id)))) {
    res.push({ section: 'troncons', source: { type: 'fourreau', objet_ids: [f.id], cle_groupe: null }, exclu: f.id });
  }
  return res;
}

/* ---------- Fusion des lignes générées dans les lignes existantes ---------- */

function segmentsAuto(n) {
  const seg = { t: n.texte || '' };
  if (n.gras) seg.g = true;
  if (n.couleur) seg.c = n.couleur;
  return [n.texte ? [seg] : []];
}

function ligneDepuis(n, existante = null) {
  const l = existante || { id: genererId('dl'), cle_auto: n.cle, origine: 'auto' };
  l.cle_auto = n.cle;
  l.origine = 'auto';
  l.segments = segmentsAuto(n);
  l.niveau = n.niveau || 0;
  l.puce = n.puce || '';
  l.alignement = n.alignement || 'gauche';
  if (n.role) l.role = n.role; else delete l.role;
  delete l.supprimee;
  return l;
}

/* Remplace les lignes auto par leur nouvelle version (même id), retire celles qui ne s'appliquent plus, insère les
 * nouvelles après leur voisine générée précédente ; les lignes manuelles (modifiées, libres, supprimées) restent. */
export function fusionnerLignes(existantes, nouvelles) {
  const parCle = new Map(nouvelles.map((n) => [n.cle, n]));
  const res = [];
  const vues = new Set();
  for (const l of existantes || []) {
    if (l.origine === 'auto') {
      const n = parCle.get(l.cle_auto);
      if (n && !vues.has(n.cle)) { res.push(ligneDepuis(n, l)); vues.add(n.cle); }
    } else { res.push(l); if (l.cle_auto) vues.add(l.cle_auto); }
  }
  nouvelles.forEach((n, i) => {
    if (vues.has(n.cle)) return;
    let pos = -1;
    for (let j = i - 1; j >= 0 && pos < 0; j--) pos = res.findIndex((x) => x.cle_auto === nouvelles[j].cle);
    res.splice(pos + 1, 0, ligneDepuis(n));
    vues.add(n.cle);
  });
  return res;
}

const ALERTES_COLLANTES = ['source_modifiee', 'objet_supprime'];

/* Applique le contenu généré à une entrée existante (ou neuve). */
function appliquerContenu(entree, c) {
  entree.lignes = fusionnerLignes(entree.lignes, c.lignes);
  // v1.5.3 (H-304) : si l'ordre généré des tronçons a changé (sens inversé, ouvrages réordonnés), les lignes de détail
  // (« De … à … » et leurs revêtements, manuelles comprises) sont remises dans le nouvel ordre, aux mêmes emplacements ;
  // tant que l'ordre généré ne change pas, un déplacement manuel de ces lignes est conservé.
  const ordreTr = c.lignes.filter((l) => /^tr:/.test(l.cle)).map((l) => l.cle);
  const signature = ordreTr.join('|');
  if (entree.source.type === 'groupe_troncons' && entree.ordre_troncons !== undefined && entree.ordre_troncons !== signature) {
    const rang = new Map(ordreTr.map((k, i) => [k, i]));
    const slots = [];
    entree.lignes.forEach((l, i) => { if (l.cle_auto && rang.has(l.cle_auto)) slots.push(i); });
    const tri = slots.map((i) => entree.lignes[i]).sort((a, b) => rang.get(a.cle_auto) - rang.get(b.cle_auto));
    slots.forEach((i, j) => { entree.lignes[i] = tri[j]; });
  }
  if (entree.source.type === 'groupe_troncons') entree.ordre_troncons = signature;
  if (!entree.repere_manuel) entree.repere = c.repere ? [{ t: c.repere, g: true, c: D().repere.couleur }] : [];
  const e = empreinte({ r: c.repere, l: c.lignes.map((l) => [l.cle, l.texte, l.niveau || 0, l.puce || '']) });
  const collantes = (entree.alertes || []).filter((a) => ALERTES_COLLANTES.includes(a) && a !== 'objet_supprime');
  if (entree.empreinte && entree.empreinte !== e && aDuManuel(entree) && !collantes.includes('source_modifiee')) collantes.push('source_modifiee');
  entree.empreinte = e;
  // Alertes dérivées, levées dès que la ligne concernée est saisie à la main (ou la fourniture saisie)
  const manuelle = (cle) => entree.lignes.some((l) => l.cle_auto === cle && l.origine === 'manuelle');
  const derivees = c.alertes.filter((a) => {
    if (a === 'longueur_manquante') return !(manuelle('tete') && (manuelle('total') || !entree.lignes.some((l) => l.cle_auto === 'total')));
    if (a === 'fourniture_incomplete') return !manuelle('fourniture');
    if (a === 'sans_repere') return !entree.repere_manuel;
    return true;
  });
  entree.alertes = [...new Set([...collantes, ...derivees])];
  if (!entree.inclure_manuel) entree.inclure = c.inclure;
  entree.source.objet_ids = [...c.objet_ids];
  if (c.style_echantillon !== undefined) entree.style_echantillon = c.style_echantillon;
  if (c.calcul_fourniture !== undefined) entree.calcul_fourniture = c.calcul_fourniture;
}

/* ---------- Mise à jour (§2.7) ---------- */

/* Met à jour le descriptif du plan d'après ses objets et le projet. Retourne true si quelque chose a changé. */
export function mettreAJourDescriptif(plan, projet) {
  const d = plan && plan.descriptif;
  if (!d) return false;
  const avant = JSON.stringify({ ...d, maj_le: null });
  normaliserDescriptif(d);
  const ctx = contexte(plan, projet);
  d.entete.lignes = fusionnerLignes(d.entete.lignes, lignesEntete(projet));
  const couverts = new Set();
  const ordres = new Map();
  for (const s of d.sections) {
    s.entrees = s.entrees.filter((e) => {
      if (e.source.type === 'libre') return true;
      const c = contenuEntree(e, ctx);
      if (!c) {
        if (!aDuManuel(e)) return false;   // entrée entièrement automatique : retirée
        if (!e.alertes.includes('objet_supprime')) e.alertes.push('objet_supprime');
        e.alertes = e.alertes.filter((a) => !['longueur_manquante', 'extremite_inconnue', 'fourniture_incomplete', 'sans_repere', 'revetements'].includes(a));
        if (e.source.type === 'groupe_troncons') for (const k of clesDe(e)) couverts.add('groupe:' + k);
        else for (const id of e.source.objet_ids) couverts.add(id);
        return true;
      }
      e.alertes = e.alertes.filter((a) => a !== 'objet_supprime');
      appliquerContenu(e, c);
      ordres.set(e.id, c.ordre);
      if (e.source.type === 'groupe_troncons') for (const k of clesDe(e)) couverts.add('groupe:' + k);
      else for (const id of c.objet_ids) couverts.add(id);
      return true;
    });
  }
  // Nouvelles sources : insérées à leur place par défaut parmi les entrées voisines
  const exclus = new Set(d.exclus);
  const nouvelles = [];
  for (const src of sourcesNaturelles(ctx)) {
    if (couverts.has(src.exclu) || exclus.has(src.exclu)) continue;
    const e = nouvelleEntree(src.source);
    const c = contenuEntree(e, ctx);
    if (!c) continue;
    appliquerContenu(e, c);
    nouvelles.push({ e, section: src.section, ordre: c.ordre });
  }
  nouvelles.sort((a, b) => comparerOrdres(a.ordre, b.ordre));
  for (const n of nouvelles) {
    const s = d.sections.find((x) => x.cle === n.section) || d.sections[0];
    const i = s.entrees.findIndex((x) => ordres.has(x.id) && comparerOrdres(ordres.get(x.id), n.ordre) > 0);
    if (i < 0) s.entrees.push(n.e); else s.entrees.splice(i, 0, n.e);
    ordres.set(n.e.id, n.ordre);
  }
  // v1.5.3 (H-304) : second passage des groupes de tronçons, une fois la section « Ouvrages » complète (le sens par
  // défaut d'une chaîne suit l'ordre de ses entrées, nouvelles comprises)
  for (const s of d.sections) for (const e of s.entrees) {
    if (e.source.type !== 'groupe_troncons') continue;
    const c = contenuEntree(e, ctx);
    if (c) appliquerContenu(e, c);
  }
  const change = JSON.stringify({ ...d, maj_le: null }) !== avant;
  if (change) d.maj_le = new Date().toISOString();
  return change;
}

/* Crée (ou recrée entièrement) le descriptif d'un plan. `base` : réglages de bloc à conserver (position, largeur,
 * colonnes, aspect, sortie) — seul geste qui efface le manuel (§2.8). */
export function genererDescriptif(plan, projet, base = null) {
  const d = descriptifParDefaut();
  if (base) for (const k of ['visible', 'x', 'y', 'largeur', 'echelle', 'colonnes', 'cadre', 'couleur_cadre', 'fond', 'sortie_pdf', 'unite_lineaire']) if (base[k] !== undefined) d[k] = base[k];
  plan.descriptif = d;
  mettreAJourDescriptif(plan, projet);
  return d;
}

/* ---------- Alertes ---------- */

export function libelleAlerte(a) { return D().alertes[a] || a; }

/* Alertes des entrées incluses : [{ plan, entree, alerte, libelle, titre }]. */
export function alertesDescriptif(plan) {
  const d = plan && plan.descriptif;
  if (!d) return [];
  const res = [];
  for (const e of toutesEntrees(d)) {
    if (!e.inclure) continue;
    for (const a of e.alertes || []) res.push({ plan, entree: e, alerte: a, libelle: libelleAlerte(a), titre: titreEntree(e) });
  }
  return res;
}

export function alertesProjet(projet, plans = null) {
  return (plans || (projet ? projet.plans : [])).flatMap((p) => alertesDescriptif(p));
}

/* Titre court d'une entrée (listes, dialogues) : repère + début de la première ligne. */
export function titreEntree(e) {
  const r = texteSegments(e.repere);
  const l = (e.lignes || []).find((x) => !x.supprimee && texteLigne(x).trim());
  const t = l ? texteLigne(l).split('\n')[0] : '';
  const s = (r ? r + ' ' : '') + t;
  return s.length > 70 ? s.slice(0, 69) + '…' : s || '(entrée vide)';
}

/* ---------- Opérations de l'éditeur (toutes suivies de valider() par l'appelant) ---------- */

/* Supprime une entrée ; ses objets (ou son groupe) entrent dans `exclus` et ne sont jamais recréés. */
export function supprimerEntree(d, id) {
  const r = trouverEntree(d, id);
  if (!r) return false;
  const e = r.entree;
  if (e.source.type === 'groupe_troncons') for (const k of clesDe(e)) d.exclus.push('groupe:' + k);
  else if (e.source.type !== 'libre') d.exclus.push(...e.source.objet_ids);
  d.exclus = [...new Set(d.exclus)];
  r.section.entrees.splice(r.index, 1);
  return true;
}

export function reintegrer(d, cleExclu) {
  d.exclus = (d.exclus || []).filter((x) => x !== cleExclu);
}

/* Libellé d'un élément exclu (objet ou groupe de tronçons), pour « Réintégrer ». */
export function libelleExclu(plan, cle) {
  if (String(cle).startsWith('groupe:')) {
    const [domaine, pose, etatT, section] = String(cle).slice(7).split('|');
    return abreviationReseau(domaine, pose) + ' ' + (D().etats_troncon[etatT] || '') + (section ? ' ' + section : '');
  }
  const o = (plan.objets || []).find((x) => x.id === cle);
  if (!o) return null;
  return (o.repere ? o.repere + ' — ' : '') + (o.designation_manuelle || o.designation_auto || LIBELLES.types[o.type] || o.type);
}

export function deplacerEntree(d, id, delta) {
  const r = trouverEntree(d, id);
  if (!r) return false;
  const j = r.index + delta;
  if (j < 0 || j >= r.section.entrees.length) return false;
  const [e] = r.section.entrees.splice(r.index, 1);
  r.section.entrees.splice(j, 0, e);
  return true;
}

export function deplacerEntreeVers(d, id, index) {
  const r = trouverEntree(d, id);
  if (!r) return false;
  const [e] = r.section.entrees.splice(r.index, 1);
  r.section.entrees.splice(Math.max(0, Math.min(index, r.section.entrees.length)), 0, e);
  return true;
}

/* Fusionne une entrée avec la suivante de sa section (§2.9). Deux groupes de tronçons : sources réunies, ligne de tête
 * régénérée sur l'ensemble (« T70 et T35 », totaux additionnés) si les deux têtes sont automatiques ; sinon les
 * lignes de tête sont concaténées en une ligne manuelle. Autres entrées : lignes mises bout à bout. */
export function fusionnerAvecSuivante(d, id) {
  const r = trouverEntree(d, id);
  if (!r || r.index + 1 >= r.section.entrees.length) return false;
  const a = r.entree, b = r.section.entrees[r.index + 1];
  const teteA = a.lignes.find((l) => l.cle_auto === 'tete'), teteB = b.lignes.find((l) => l.cle_auto === 'tete');
  if (a.source.type === 'groupe_troncons' && b.source.type === 'groupe_troncons') {
    a.source.cle_groupe = [...new Set([...clesDe(a), ...clesDe(b)])].join('\n');
    a.source.objet_ids = [...new Set([...a.source.objet_ids, ...b.source.objet_ids])];
    const autoTetes = (!teteA || teteA.origine === 'auto') && (!teteB || teteB.origine === 'auto');
    if (!autoTetes && teteA) {
      teteA.origine = 'manuelle';
      teteA.segments = [[...(teteA.segments[0] || []), { t: ' et ' }, ...(teteB ? (teteB.segments[0] || []) : [])]];
    }
    a.lignes.push(...b.lignes.filter((l) => l.origine === 'manuelle' && l !== teteB));
  } else {
    if (b.source.type !== 'libre') {
      if (a.source.type === 'libre') a.source = { type: b.source.type, objet_ids: [], cle_groupe: b.source.cle_groupe };
      a.source.objet_ids = [...new Set([...a.source.objet_ids, ...b.source.objet_ids])];
      if (a.source.type === 'groupe_troncons' || b.source.type === 'groupe_troncons') a.source.cle_groupe = [...new Set([...clesDe(a), ...clesDe(b)])].join('\n');
    }
    // lignes de B ajoutées sous A ; les clés auto de B sont déjà préfixées par l'id d'objet (ouvrages)
    a.lignes.push(...b.lignes.map((l) => (l.cle_auto && a.lignes.some((x) => x.cle_auto === l.cle_auto) ? { ...l, origine: 'manuelle', cle_auto: null } : l)));
  }
  a.alertes = [...new Set([...a.alertes, ...b.alertes.filter((x) => ALERTES_COLLANTES.includes(x))])];
  r.section.entrees.splice(r.index + 1, 1);
  return true;
}

/* Rétablit l'automatique d'une entrée : toute saisie manuelle de l'entrée est retirée (lignes modifiées, libres,
 * supprimées, repère), l'alerte « source modifiée » levée ; la mise à jour suivante régénère les lignes. */
export function retablirAutoEntree(e) {
  e.lignes = e.lignes.filter((l) => l.origine === 'auto');
  e.repere_manuel = false;
  e.alertes = e.alertes.filter((a) => a !== 'source_modifiee');
}

/* Rétablit une ligne générée modifiée (ou supprimée) : elle redevient automatique. */
export function retablirAutoLigne(lignes, idLigne) {
  const l = lignes.find((x) => x.id === idLigne);
  if (!l || !l.cle_auto) return false;
  l.origine = 'auto';
  delete l.supprimee;
  return true;
}

export function marquerVu(e) { e.alertes = e.alertes.filter((a) => a !== 'source_modifiee'); }

/* Supprime une ligne : une ligne générée devient une « suppression manuelle » (jamais recréée, rétablissable). */
export function supprimerLigne(lignes, idLigne) {
  const i = lignes.findIndex((x) => x.id === idLigne);
  if (i < 0) return false;
  const l = lignes[i];
  if (l.cle_auto) { l.origine = 'manuelle'; l.supprimee = true; } else lignes.splice(i, 1);
  return true;
}

/* v1.5.1 — Colore les caractères [debut, fin[ d'une ligne (sous-lignes jointes par « \n » dans le décompte).
 * debut === fin : toute la ligne. Couleur '#000000' ou null : couleur retirée (noir par défaut). Retourne de nouvelles
 * sous-lignes de segments, styles voisins identiques fusionnés. Module pur : essayé sous Node. */
export function colorierSegments(sousLignes, debut, fin, couleur) {
  const c = couleur && String(couleur).toUpperCase() !== '#000000' ? String(couleur).toUpperCase() : null;
  const tout = !(fin > debut);
  let pos = 0;
  return (sousLignes && sousLignes.length ? sousLignes : [[]]).map((segs, iSL) => {
    if (iSL) pos++;   // le « \n » entre deux sous-lignes
    const res = [];
    const pousser = (t, st) => {
      if (!t) return;
      const der = res[res.length - 1];
      if (der && !!der.g === !!st.g && !!der.i === !!st.i && !!der.s === !!st.s && (der.c || null) === (st.c || null)) { der.t += t; return; }
      const seg = { t };
      if (st.g) seg.g = true; if (st.i) seg.i = true; if (st.s) seg.s = true; if (st.c) seg.c = st.c;
      res.push(seg);
    };
    for (const sg of segs || []) {
      const t = String(sg.t || '');
      for (let k = 0; k < t.length; k++) {
        const dans = tout || (pos >= debut && pos < fin);
        pousser(t[k], { g: sg.g, i: sg.i, s: sg.s, c: dans ? c : (sg.c || null) });
        pos++;
      }
    }
    return res;
  });
}

/* Remplace le contenu d'une ligne (édition dans l'éditeur) : une ligne générée passe en manuelle. */
export function modifierLigne(l, { segments, niveau, puce, alignement } = {}) {
  let change = false;
  if (segments !== undefined && JSON.stringify(segments) !== JSON.stringify(l.segments)) { l.segments = segments; change = true; }
  if (niveau !== undefined && niveau !== l.niveau) { l.niveau = niveau; change = true; }
  if (puce !== undefined && puce !== l.puce) { l.puce = puce; change = true; }
  if (alignement !== undefined && alignement !== l.alignement) { l.alignement = alignement; change = true; }
  if (change) { l.origine = 'manuelle'; delete l.supprimee; }
  return change;
}

export function ajouterLigneApres(lignes, idLigne, modele = null) {
  const i = idLigne ? lignes.findIndex((x) => x.id === idLigne) : lignes.length - 1;
  const l = nouvelleLigne({ niveau: modele ? modele.niveau : 0, puce: modele ? modele.puce : '', alignement: modele ? modele.alignement : 'gauche' });
  lignes.splice(i + 1, 0, l);
  return l;
}

export function ajouterEntreeLibre(d, sectionId, apresId = null) {
  const s = d.sections.find((x) => x.id === sectionId) || d.sections[d.sections.length - 1];
  const e = nouvelleEntree({ type: 'libre', objet_ids: [], cle_groupe: null });
  e.echantillon = false;
  e.lignes.push(nouvelleLigne({}));
  const i = apresId ? s.entrees.findIndex((x) => x.id === apresId) : -1;
  if (i < 0) s.entrees.push(e); else s.entrees.splice(i + 1, 0, e);
  return e;
}

export function ajouterSectionLibre(d, titre = 'Section') {
  const s = nouvelleSection('libre', [{ t: titre, g: true }]);
  d.sections.push(s);
  return s;
}

/* Saisie de la tranchée : texte libre sans parenthèses (le format les ajoute). */
export function normaliserTranchee(t) { return String(t || '').trim().replace(/^\((.*)\)$/, '$1').trim(); }

/* Copie profonde (exports depuis un clone de projet). */
export { cloner };
