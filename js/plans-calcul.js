/* plans-calcul.js — calculs purs de la gestion des plans (v1.4.5 : PDF multi-pages, un plan par page).
 *
 * Aucune dépendance : ni DOM, ni `etat`, ni import. Tout passe en paramètre, ce qui rend ces fonctions testables
 * sous Node (js/plans-calcul.test.mjs), comme mesure-calcul.js (H-199).
 *
 * Rappel du modèle (schéma 8, inchangé) : projet → plans[] → objets[]. Chaque plan porte son propre objet `fond`
 * ({ fond_id, type, page, nb_pages, largeur, hauteur, rotation, transform_pdf, opacite, nom_fichier, calibrations? }).
 * Plusieurs plans peuvent partager le même `fond_id` : le fichier n'est stocké qu'une fois (magasin `fonds`).
 */

/* Nom par défaut d'un plan créé par l'application (« Plan 1 », « Plan 2 »…) : un tel plan peut être renommé
 * automatiquement d'après sa page à l'import ; un nom saisi par l'utilisateur ne l'est jamais. */
export function nomParDefaut(nom) {
  return /^Plan \d+$/.test(String(nom || '').trim());
}

/* Nom proposé pour un plan issu d'un fichier. PDF : « Page k » ; photo : « Photo » ; image : nom sans extension. */
export function nomPlanPour({ type, page = 1, nom_fichier = '', photo = false }) {
  if (type === 'pdf') return 'Page ' + page;
  if (photo) return 'Photo';
  const base = String(nom_fichier || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return base || 'Image';
}

/* Vrai si le nom d'un plan est automatique : « Plan N », ou le nom que l'application donne à son fond actuel
 * (« Page k », nom du fichier image, « Photo »). Un tel nom suit le fond quand celui-ci est remplacé ; un nom saisi
 * par l'utilisateur ne change jamais. */
export function nomAutomatique(nom, fond) {
  if (nomParDefaut(nom)) return true;
  if (!fond) return false;
  const n = String(nom || '').trim();
  return n === nomPlanPour({ type: fond.type, page: fond.page || 1, nom_fichier: fond.nom_fichier }) || (fond.type === 'image' && n === 'Photo');
}

/* Nettoie et borne un nom saisi. Retourne null si le nom est vide. */
export function nettoyerNomPlan(nom, max = 40) {
  const t = String(nom ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max).trim() : t;
}

/* Analyse une saisie de pages : « 2 », « 1-3 », « 1,3 », « 1-3; 5 », tirets court / long, espaces libres.
 * Retourne { pages: [n…] } (triées, sans doublon) ou { erreur: '…' }. `max` : plafond de sécurité du nombre de pages. */
export function analyserPages(texte, nbPages, max = Infinity) {
  const t = String(texte ?? '').replace(/[\u2012\u2013\u2014\u2212]/g, '-').replace(/\s+/g, '');
  if (!t) return { erreur: 'Indiquez au moins une page' };
  const morceaux = t.split(/[,;]+/).filter(Boolean);
  if (!morceaux.length) return { erreur: 'Indiquez au moins une page' };
  const pages = new Set();
  for (const m of morceaux) {
    const r = /^(\d+)(?:-(\d+))?$/.exec(m);
    if (!r) return { erreur: 'Saisie non comprise : « ' + m + ' » (exemples : 2 · 1-3 · 1,3 · 1-3; 5)' };
    let a = parseInt(r[1], 10);
    let b = r[2] !== undefined ? parseInt(r[2], 10) : a;
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > nbPages) return { erreur: 'Pages de 1 à ' + nbPages };
    for (let k = a; k <= b; k++) pages.add(k);
  }
  const liste = [...pages].sort((x, y) => x - y);
  if (liste.length > max) return { erreur: 'Au plus ' + max + ' pages par import' };
  return { pages: liste };
}

/* Toutes les pages 1..n (bornées au plafond). */
export function toutesLesPages(nbPages, max = Infinity) {
  const n = Math.max(1, Math.min(nbPages, max));
  return Array.from({ length: n }, (_, i) => i + 1);
}

/* Résumé « pages 1 à 3 », « page 2 », « pages 1, 3 et 5 ». */
export function resumePages(pages) {
  const p = [...pages];
  if (!p.length) return '';
  if (p.length === 1) return 'page ' + p[0];
  const contigu = p.every((v, i) => i === 0 || v === p[i - 1] + 1);
  if (contigu) return 'pages ' + p[0] + ' à ' + p[p.length - 1];
  return 'pages ' + p.slice(0, -1).join(', ') + ' et ' + p[p.length - 1];
}

/* Ensemble des fond_id référencés par un projet (plans ET plan.fonds[] réservé), chacun une seule fois.
 * v1.4.6 §2 : les images libres (objets `image`) aussi. C'est cette liste qui protège un binaire de la purge des
 * orphelins au démarrage, et qui pilote duplication, suppression, taille et export .json d'un projet. */
export function fondsReferences(projet) {
  const s = new Set();
  for (const plan of (projet && projet.plans) || []) {
    if (plan && plan.fond && plan.fond.fond_id) s.add(plan.fond.fond_id);
    for (const f of (plan && plan.fonds) || []) if (f && f.fond_id) s.add(f.fond_id);
    for (const o of (plan && plan.objets) || []) if (o && o.type === 'image' && o.fond_id) s.add(o.fond_id);
  }
  return s;
}

/* Images libres (v1.4.6 §2) : remplace les fond_id selon la table `corr` (ancien → nouveau). Avec `retirerAbsentes`
 * (import .json), une image dont le binaire manque est retirée du plan. Retourne le nombre d'images retirées. */
export function remapperImages(projet, corr, { retirerAbsentes = false } = {}) {
  let retirees = 0;
  for (const plan of (projet && projet.plans) || []) {
    if (!plan || !Array.isArray(plan.objets)) continue;
    plan.objets = plan.objets.filter((o) => {
      if (!o || o.type !== 'image') return true;
      if (o.fond_id && corr[o.fond_id]) { o.fond_id = corr[o.fond_id]; return true; }
      if (retirerAbsentes) { retirees++; return false; }
      return true;
    });
  }
  return retirees;
}

/* Vrai si un autre plan que `planId` utilise encore `fond_id`. */
export function fondPartage(plans, fond_id, planId) {
  return (plans || []).some((pl) => pl.id !== planId && pl.fond && pl.fond.fond_id === fond_id);
}

/* Objet `fond` d'un plan à partir d'une description de fichier et des dimensions d'une page. */
export function fondPourPage(fichier, infosPage) {
  const f = {
    fond_id: fichier.fond_id,
    type: fichier.type,
    page: infosPage.page || 1,
    nb_pages: fichier.nb_pages || 1,
    largeur: infosPage.largeur,
    hauteur: infosPage.hauteur,
    opacite: 1,
    nom_fichier: fichier.nom_fichier,
    rotation: infosPage.rotation || 0,
    transform_pdf: infosPage.transform_pdf || null
  };
  if (infosPage.echelle_image !== undefined) f.echelle_image = infosPage.echelle_image;
  return f;
}

/* Pages d'un PDF (fond_id) qui n'ont encore aucun plan dans le projet. */
export function pagesManquantes(plans, fond_id, nbPages) {
  const presentes = new Set((plans || []).filter((pl) => pl.fond && pl.fond.fond_id === fond_id && pl.fond.type === 'pdf').map((pl) => pl.fond.page || 1));
  const r = [];
  for (let k = 1; k <= nbPages; k++) if (!presentes.has(k)) r.push(k);
  return r;
}

/* Insère des plans neufs d'un même PDF et regroupe tout le groupe (plans de ce fond_id) par ordre de page, à la
 * place du premier membre du groupe dans la liste. Les autres plans gardent leur ordre relatif.
 * Retourne la nouvelle liste (la liste d'entrée n'est pas modifiée). */
export function insererGroupeParPage(plans, fond_id, nouveaux) {
  const estDuGroupe = (pl) => pl.fond && pl.fond.fond_id === fond_id;
  const groupe = [...plans.filter(estDuGroupe), ...nouveaux]
    .map((pl, i) => ({ pl, i }))
    .sort((a, b) => ((a.pl.fond.page || 1) - (b.pl.fond.page || 1)) || (a.i - b.i))
    .map((x) => x.pl);
  const premier = plans.findIndex(estDuGroupe);
  const autres = plans.filter((pl) => !estDuGroupe(pl));
  if (premier < 0) return [...plans, ...groupe];
  // position d'insertion : nombre de plans « autres » situés avant le premier membre du groupe
  const avant = plans.slice(0, premier).filter((pl) => !estDuGroupe(pl)).length;
  return [...autres.slice(0, avant), ...groupe, ...autres.slice(avant)];
}

/* Déplace (sans les dupliquer) les calibrations de mesure du fond source vers le fond du plan de chaque page.
 * `source` : objet fond du plan d'origine ; `cibles` : plans neufs. La calibration de la page propre au plan
 * d'origine reste où elle est. Retourne le nombre de calibrations déplacées. */
export function deplacerCalibrations(source, cibles) {
  if (!source || !source.calibrations || typeof source.calibrations !== 'object') return 0;
  let n = 0;
  for (const pl of cibles) {
    const cle = String((pl.fond && pl.fond.page) || 1);
    if (cle === String(source.page || 1)) continue;
    if (source.calibrations[cle] === undefined) continue;
    pl.fond.calibrations = { ...(pl.fond.calibrations || {}), [cle]: source.calibrations[cle] };
    delete source.calibrations[cle];
    n++;
  }
  if (!Object.keys(source.calibrations).length) delete source.calibrations;
  return n;
}

/* Indice de plan borné (entier dans [0, n-1], sinon 0). */
export function indicePlanBorne(i, n) {
  return Number.isInteger(i) && i >= 0 && i < n ? i : 0;
}

/* Libellé court de position « 2/3 ». */
export function positionPlan(i, n) {
  return (i + 1) + '/' + n;
}
