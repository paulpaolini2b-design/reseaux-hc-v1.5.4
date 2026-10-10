/* mesure-calcul.js — calculs de l'outil Mesure (v1.4.3).
 *
 * Fonctions PURES : aucun accès au DOM, à `etat` ni à la vue. Toutes les valeurs d'entrée sont passées en
 * paramètre, ce qui les rend testables sous Node (js/mesure.test.mjs).
 *
 * Unités :
 * - « unité plan » : point PDF pour un fond PDF (1 pt = 25,4 / 72 mm de papier), pixel normalisé pour une image
 *   (H-17 : grand côté = 1190 unités, sans aucune signification physique) ;
 * - distances réelles en mètres.
 */

/* Longueur d'un point PDF en mètres de papier (25,4 / 72 mm). */
export const METRE_PAR_POINT_PDF = 0.0254 / 72;

/* États de fiabilité, du plus sûr au moins sûr. */
export const FIABILITE = {
  CALIBREE_CONTROLEE: 'CALIBREE_CONTROLEE',
  CALIBREE: 'CALIBREE',
  NOMINALE: 'NOMINALE',
  AUCUNE: 'AUCUNE'
};

/* Distance entre deux points, en unités plan. */
export function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/* Longueurs d'une polyligne : { segments: [unités…], total: unités }. */
export function longueurs(points) {
  const segments = [];
  let total = 0;
  for (let i = 1; i < (points || []).length; i++) {
    const d = distance(points[i - 1], points[i]);
    segments.push(d);
    total += d;
  }
  return { segments, total };
}

/* Vrai si v est un nombre fini strictement positif. */
function positif(v) {
  return typeof v === 'number' && isFinite(v) && v > 0;
}

/* Mètres par unité plan déduits de l'échelle DÉCLARÉE 1/N d'un PDF.
 * Exacte seulement si le PDF a été produit à cette échelle et n'a été ni réduit ni agrandi depuis. */
export function mParUniteNominal(denominateur) {
  if (!positif(Number(denominateur))) return null;
  return METRE_PAR_POINT_PDF * Number(denominateur);
}

/* Mètres par unité plan d'une calibration : distance réelle / distance plan. */
export function mParUniteCalibration(a, b, distance_m) {
  const d = distance(a, b);
  if (!positif(d) || !positif(distance_m)) return null;
  return distance_m / d;
}

/* Échelle papier équivalente (dénominateur N de 1/N) d'un rapport mètres par unité, pour un fond PDF. */
export function equivalentEchelle(m_par_unite) {
  if (!positif(m_par_unite)) return null;
  return m_par_unite / METRE_PAR_POINT_PDF;
}

/* Écart relatif en % entre une valeur mesurée et une valeur de référence (signé). */
export function ecartPct(mesure, reference) {
  if (!positif(reference) || typeof mesure !== 'number' || !isFinite(mesure)) return null;
  return (mesure - reference) / reference * 100;
}

/* Incertitude relative d'une calibration : lecture de ±1 pixel écran à chaque extrémité de la référence,
 * composée en quadrature (√2 px), rapportée à la longueur de la référence. `u_plan` = 1 px écran en unités plan
 * au moment du calage (plus on zoome, plus elle est faible). */
export function incertitudeRelativeCalage(longueur_unites, u_plan) {
  if (!positif(longueur_unites) || !positif(u_plan)) return null;
  return Math.SQRT2 * u_plan / longueur_unites;
}

/* Incertitude de lecture d'une polyligne, en mètres : chaque point porte sa propre incertitude `u` (1 px écran en
 * unités plan au moment où il a été posé ou ajusté), composée en quadrature. Deux points → √2 px. */
export function incertitudeLecture(points, m_par_unite) {
  if (!positif(m_par_unite) || !points || points.length < 2) return 0;
  let s = 0;
  for (const p of points) { const u = positif(p.u) ? p.u : 0; s += u * u; }
  return Math.sqrt(s) * m_par_unite;
}

/* Incertitude totale en mètres : lecture ⊕ calibration (relative, appliquée à la longueur mesurée). */
export function incertitudeTotale(longueur_m, lecture_m, incertitude_rel) {
  const c = positif(incertitude_rel) && positif(longueur_m) ? incertitude_rel * longueur_m : 0;
  const l = positif(lecture_m) ? lecture_m : 0;
  return Math.sqrt(l * l + c * c);
}

/* Lecture d'une distance saisie au clavier : « 35 », « 35,5 », « 35.5 m », espaces tolérés.
 * Retourne un nombre > 0 ou null. */
export function lireDistance(texte) {
  if (texte === null || texte === undefined) return null;
  const t = String(texte).trim().replace(/\s+/g, '').replace(/m$/i, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const v = Number(t);
  return positif(v) ? v : null;
}

/* Clé de calibration d'un fond : numéro de page pour un PDF, « 1 » pour une image. */
export function clePage(fond) {
  if (!fond) return '1';
  return String(fond.type === 'pdf' ? (fond.page || 1) : 1);
}

/* Calibration enregistrée si elle est exploitable, sinon null (champ absent, page absente, valeur non finie ≤ 0). */
export function calibrationValide(cal) {
  if (!cal || typeof cal !== 'object') return null;
  if (!positif(cal.m_par_unite)) return null;
  return cal;
}

/* Vrai si le dernier contrôle de la calibration est dans la tolérance. */
export function controleReussi(cal, seuil_pct) {
  if (!cal || !cal.controle || typeof cal.controle.ecart_pct !== 'number' || !isFinite(cal.controle.ecart_pct)) return false;
  return Math.abs(cal.controle.ecart_pct) <= seuil_pct;
}

/* État de fiabilité de la mesure sur un fond donné.
 * Entrées : fond (plan.fond ou null), echelle_plan (projet.echelle_plan ou null), seuil de contrôle en %.
 * Sortie : { code, m_par_unite, calibration, controle_en_ecart }. */
export function evaluerFiabilite({ fond, echelle_plan, seuil_controle_pct }) {
  if (!fond) return { code: FIABILITE.AUCUNE, m_par_unite: null, calibration: null, controle_en_ecart: false };
  const cal = calibrationValide(fond.calibrations && fond.calibrations[clePage(fond)]);
  if (cal) {
    const ok = controleReussi(cal, seuil_controle_pct);
    return {
      code: ok ? FIABILITE.CALIBREE_CONTROLEE : FIABILITE.CALIBREE,
      m_par_unite: cal.m_par_unite,
      calibration: cal,
      controle_en_ecart: !!cal.controle && !ok
    };
  }
  if (fond.type === 'pdf') {
    const m = mParUniteNominal(echelle_plan);
    if (m) return { code: FIABILITE.NOMINALE, m_par_unite: m, calibration: null, controle_en_ecart: false };
  }
  return { code: FIABILITE.AUCUNE, m_par_unite: null, calibration: null, controle_en_ecart: false };
}

/* Écart en % entre l'échelle équivalente d'une calibration et l'échelle déclarée (PDF seulement), ou null. */
export function ecartEchelleDeclaree(fond, echelle_plan, m_par_unite) {
  if (!fond || fond.type !== 'pdf' || !positif(Number(echelle_plan)) || !positif(m_par_unite)) return null;
  return ecartPct(equivalentEchelle(m_par_unite), Number(echelle_plan));
}

/* Nombre au format français, `decimales` au plus, zéros de fin retirés (0,175 ; 17,5 ; 496). */
export function formaterNombre(v, decimales = 1) {
  if (typeof v !== 'number' || !isFinite(v)) return '';
  const f = Math.pow(10, decimales);
  const n = Math.round(v * f) / f;
  return String(n).replace('.', ',');
}

/* Rapport mètres par unité avec trois chiffres significatifs (0,175 ; 1,25 ; 12,5). */
export function formaterRapport(v) {
  if (!positif(v)) return '';
  const dec = Math.max(0, 2 - Math.floor(Math.log10(v)));
  return formaterNombre(v, Math.min(dec, 6));
}
