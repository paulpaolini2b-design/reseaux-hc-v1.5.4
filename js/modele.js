/* modele.js — schéma des données, valeurs par défaut, repères, indicateur « complet ».
 *
 * Structure : projet → plans[] → objets[]  (un seul plan exposé en V1, §10.1)
 */
import { CHARTE, libelleEtiquetteMateriel, MALT_CONDENSE, SECTIONS_DERIVEES, estSectionNu, sectionsNusApplicables, sectionsEpPour, defautsEchellePlan, regleMaltSousType, regleMaltEras, regleMaltDomaine, categorieMalt, SOUS_TYPE_ERAS_PAR_DOMAINE, DOMAINE_PAR_SOUS_TYPE_ERAS, effortHorsMarche } from './charte.js';
import { etat } from './etat.js';
import { bornerRecadrage } from './forme-calcul.js';

export const VERSION_SCHEMA = 13;
/* v13 (v1.5.1) : point GPS facultatif de l'affaire (`gps`, texte au format Google Maps « lat, lon », '' si absent),
 * revêtements multiples des tronçons (`attributs.revetements` [{ nature, longueur_m }], longueur null = tout le
 * tronçon ; `nature_terrain` conservé = nature du premier revêtement), symbole MALT porté par un ouvrage
 * (`malt_symbole` { visible, dx, dy, longueur_tige }, absent tant que « + MALT ex » / « + Confection MALT » n'a pas été
 * utilisé). Migration 12 → 13 sans changement d'aspect : aucun symbole MALT n'est ajouté aux ouvrages existants.
 * Une v1.5.0 refuse un .json v13 (elle perdrait revêtements et GPS sans le dire). */
/* v12 (v1.5.0) : descriptif des travaux par plan (`plan.descriptif`, null tant qu'il n'est pas créé — voir descriptif.js)
 * et nom facultatif des postes (`attributs.nom`). Migration 11 → 12 sans autre transformation : aucun changement
 * d'aspect du plan. Une v1.4.9 refuse un .json v12 (elle perdrait le descriptif sans le dire). */
/* v11 (v1.4.9) : propriétés facultatives `retour_ligne` des blocs etiquette / materiel ('defaut' | 'auto' | 'jamais')
 * et `couleur_manuelle` des tronçons et fourreaux (#RRGGBB). Migration 10 → 11 sans transformation : propriété absente =
 * comportement par défaut. Une v1.4.8 refuse un projet v11 (elle perdrait les couleurs manuelles sans le dire). */
/* v10 (v1.4.7) : rognage non destructif des images libres — o.recadrage { g, h, d, b } (fractions retirées à gauche,
 * en haut, à droite, en bas, repère de l'image). Migration explicite sans changement d'aspect : une image sans
 * recadrage reçoit { g: 0, h: 0, d: 0, b: 0 }. Une v1.4.6 refuse un projet v10 (elle afficherait l'image non rognée). */
/* v9 (v1.4.6) : notes mises en forme (segments [[{ t, g, i, s }]], alignement), départ de la flèche de note
 * (fleche_depart : bord | coin — étiquette fléchée), rotation des dessins rectangle / rectangle arrondi / ellipse
 * (champ `rotation` déjà présent sur tout objet, resté à 0 jusqu'ici), attributs.ratio_fixe (carré, rond), type
 * d'objet `image` (image / photo libre) et calque « images ». Aucune donnée existante n'est transformée. */
/* v8 (lot 1.4) : informations d'affaire (num_sieep, num_edf, type_affaire), classement (statut, statut_le,
 * statut_avant_corbeille, supprime_le), suivi de sauvegarde hors tablette (json_sauve_le) et indice du PDF (indice_pdf). */
/* v5 (lot 1.3.1) : attributs.malt_origine (ERAS : AUTO | MANUELLE), remplacement_par { article_id, designation, attributs }
 * sur tout ouvrage (état « à remplacer »), plan.legende { cadre, couleur_cadre, fond }, réévaluation de la règle MALT
 * des ERAS d'après le réseau (rattrape les RAS BRT / EP tracées avec le défaut de la v1.3.0).
 * v6 (lot 1.3.3) : couleur_texte des blocs désignation et matériel, attributs.surligneur des dessins (ex-masques),
 * reprise des échelles de cartouche agrandies à la main pour compenser le repère trop petit.
 * v7 (lot 1.3.4) : attributs.rayon des dessins (rectangle arrondi), sous-types `ellipse` et `rectangle_arrondi`. */
/* v4 (lot 1.3) : echelle_plan_origine (facteurs du plan mémorisés à la création, remplace la compensation écrite dans
 * echelle_symbole), cadre / couleur_cadre / fond des blocs désignation et matériel, attributs.malt_ex (MALT existante sans
 * article), section_retenue (tronçons), angle_gr (supports), longueur_tige et malt_regle (ERAS), sous-types d'annotation
 * fleche_double_texte / trait / stylo (+ taille_texte), notes (cadre / fond en libellés, echelle_symbole), types lanterne_ep,
 * boucle_ep, masque, calque « masques ». Migration silencieuse dans migrerProjet(). */
/* v3 (lot 1.2) : blocs d'étiquette réglables (etiquette/materiel/cartouche : echelle, rotation, retourner, couleurs),
 * mention libre, echelle_symbole sur les linéaires, fourreaux (type 'fourreau', accroché ou seul), annotations
 * (type 'annotation'), echelle_plan au projet. */
/* v2 (lot 1.1) : deport, cartouche, repere_manuel, longueur_m / longueur_source / afficher_longueur,
 * attributs.longueur_tige (MALT), etiquette.detail_malt, materiel_associe[].package / quantite_saisie,
 * reglages.afficher_longueurs. */

export const TYPES_PONCTUELS = ['support', 'coffret', 'poste', 'boite_jonction', 'malt', 'eras', 'point_lumineux', 'armoire_ep', 'lanterne_ep', 'boucle_ep'];
export const TYPES_LINEAIRES = ['troncon', 'fourreau'];
export const SOUS_TYPES_ANNOTATION = ['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'nord', 'rond_texte', 'malt_libre', 'cotation', 'zone_hachuree', 'trait', 'stylo', 'croix'];
export const ANNOTATIONS_A_POINTS = ['fleche', 'fleche_double', 'fleche_texte', 'fleche_double_texte', 'cotation', 'zone_hachuree', 'trait', 'stylo'];
export const ANNOTATIONS_A_TEXTE = ['fleche_texte', 'fleche_double_texte', 'rond_texte', 'cotation'];
export const SOUS_TYPES_MASQUE = ['rectangle', 'rectangle_arrondi', 'ellipse', 'polygone', 'pinceau'];

export function genererId(prefixe = 'o') {
  return prefixe + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ---------- Projet ---------- */
export function nouveauProjet({ nom = 'Nouvelle affaire', commune = '', date = aujourdhui(), num_sieep = '', num_edf = '', type_affaire = null, gps = '' } = {}) {
  const maintenant = new Date().toISOString();
  return {
    id: genererId('prj'),
    version_schema: VERSION_SCHEMA,
    nom, commune, date,
    cree_le: maintenant,
    modifie_le: maintenant,
    plan_courant: 0,
    plans: [nouveauPlan('Plan 1')],
    calques: calquesParDefaut(),
    filtre_domaines: { HTA: true, BTS: true, BRT: true, EP: true },
    compteurs: {},
    reglages: { echelle_symbole: 1, taille_texte: 1, afficher_longueurs: true },
    echelle_plan: null,  // dénominateur (500 pour 1/500) ou null = inconnue (v11 §3.1)
    ...champsAffaireParDefaut(maintenant),
    num_sieep, num_edf, type_affaire, gps
  };
}

/* Champs du gestionnaire de projets (schéma v8, lot 1.4). `depuis` : date ISO de référence du statut. */
export const STATUTS_PROJET = ['en_cours', 'termine', 'archive', 'corbeille'];
export function champsAffaireParDefaut(depuis = new Date().toISOString()) {
  return {
    num_sieep: '', num_edf: '', type_affaire: null, gps: '',
    statut: 'en_cours', statut_le: depuis, statut_avant_corbeille: null, supprime_le: null,
    json_sauve_le: null, indice_pdf: ''
  };
}

/* v7 → v8 : n'ajoute que les champs absents ; ne remplit jamais la commune (v14 §3.4). */
function migrerProjetV8(p) {
  const d = champsAffaireParDefaut(p.modifie_le || p.cree_le || new Date().toISOString());
  for (const [cle, valeur] of Object.entries(d)) if (p[cle] === undefined) p[cle] = valeur;
  if (typeof p.commune !== 'string') p.commune = p.commune ? String(p.commune) : '';
  if (typeof p.nom !== 'string') p.nom = p.nom ? String(p.nom) : '';
  if (typeof p.num_sieep !== 'string') p.num_sieep = String(p.num_sieep ?? '');
  if (typeof p.num_edf !== 'string') p.num_edf = String(p.num_edf ?? '');
  if (typeof p.gps !== 'string') p.gps = p.gps ? String(p.gps) : '';   // v13
  if (!STATUTS_PROJET.includes(p.statut)) p.statut = 'en_cours';
  if (typeof p.indice_pdf !== 'string') p.indice_pdf = '';
}

/* Réglages d'un bloc d'étiquette (désignation, matériel, cartouche) */
export function blocParDefaut(extra = {}) {
  return { visible: true, dx: 0, dy: 0, echelle: 1, rotation: 0, retourner: true, ...extra };
}

/* Cadre, fond et couleur de texte par défaut des blocs désignation / matériel (v12 §3.2, v13.3 §3.1) */
export function aspectBlocParDefaut() {
  const T = CHARTE.texte;
  return { cadre: T.cadre_defaut, couleur_cadre: T.couleur_cadre_defaut, fond: T.fond_defaut, couleur_texte: T.couleur_texte_defaut };
}

export function nouveauPlan(nom = 'Plan 1') {
  return {
    id: genererId('pl'),
    nom,
    fond: null,     // { fond_id, type: 'pdf'|'image', page, nb_pages, largeur, hauteur, opacite, nom_fichier, rotation }
    descriptif: null,   // v1.5.0 : descriptif des travaux (descriptif.js), créé par Outils → Descriptif
    fonds: [],      // réservé : superposition de plusieurs fonds (version ultérieure)
    objets: [],
    vue: null,      // { x, y, k } — position et niveau de zoom
    legende: legendeParDefaut(),
    echelle: null   // réservé lot 3 : { unites_par_metre }
  };
}

/* Légende du plan : objet pilotable (v13 §5) — visibilité, position (null = coin bas-droit), échelle, cadre et fond. */
export function legendeParDefaut() {
  const L = CHARTE.legende;
  return { visible: true, x: null, y: null, echelle: L.echelle_defaut, cadre: L.cadre_defaut, couleur_cadre: L.couleur_cadre_defaut, fond: L.fond_defaut };
}

/* Cible d'un ouvrage « à remplacer » (v13 §2.2) : article de nomenclature et / ou désignation ; attributs = état du sélecteur
 * (matériau → hauteur → classe → effort pour un support) pour reprendre la saisie. Vide par défaut. */
export function remplacementParDefaut() {
  return { article_id: null, designation: '', attributs: {} };
}

export const NOMS_CALQUES = ['fond', 'images', 'masques', 'existant', 'a_poser', 'a_deposer', 'cotation', 'annotations'];

export function calquesParDefaut() {
  const c = {};
  for (const nom of NOMS_CALQUES) c[nom] = { visible: true, verrou: false, opacite: 1 };
  return c;
}

export function aujourdhui() {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- Échelle du plan : facteurs d'origine (v12 §1.1) ----------
 * Chaque objet mémorise les facteurs par défaut du plan en vigueur à sa création. Le rendu multiplie
 * l'échelle propre de l'objet par origine / courant : changer l'échelle du plan ne touche ni l'aspect
 * des objets déjà posés, ni leur champ echelle_symbole. */
export function origineEchelleCourante(projet = etat.projet) {
  const d = defautsEchellePlan(projet ? projet.echelle_plan : null);
  return { echelle_plan: projet ? projet.echelle_plan : null, echelle_symbole: Math.round(d.echelle_symbole * 1000) / 1000, taille_texte: Math.round(d.taille_texte * 1000) / 1000 };
}

/* Facteurs de compensation { symbole, texte } d'un objet pour l'échelle de plan courante. */
export function compensationEchelle(o, projet = etat.projet) {
  const org = o && o.echelle_plan_origine;
  if (!org || !projet) return { symbole: 1, texte: 1 };
  const d = defautsEchellePlan(projet.echelle_plan);
  return { symbole: (org.echelle_symbole || 1) / (d.echelle_symbole || 1), texte: (org.taille_texte || 1) / (d.taille_texte || 1) };
}

/* ---------- Objets ---------- */

/* Calque déduit de l'état (le calque reste stocké et modifiable). */
export function calquePourEtat(etatObjet, type) {
  if (type === 'note' || type === 'annotation') return 'annotations';
  if (type === 'masque') return 'masques';
  if (type === 'image') return 'images';
  if (etatObjet === 'a_poser') return 'a_poser';
  if (etatObjet === 'a_deposer') return 'a_deposer';
  return 'existant';
}

function base(type, courant) {
  const aspect = aspectBlocParDefaut();
  return {
    id: genererId(),
    type,
    calque: calquePourEtat(courant.etat, type),
    etat: courant.etat,
    domaine: courant.domaine,
    pose: courant.pose,
    rotation: 0,
    echelle_symbole: 1,
    echelle_plan_origine: origineEchelleCourante(),
    repere: '',
    repere_manuel: false,   // true dès que l'utilisateur a saisi le repère : jamais écrasé ensuite
    designation_auto: '',
    designation_manuelle: '',
    materiel_associe: [],   // { source: 'NOMENCLATURE'|'LIBRE', ref_article?, libelle, quantite, unite?, package? }
    complet: false,
    commentaire: '',
    ref_article: null,
    remplacement_par: remplacementParDefaut(),   // « à remplacer par … » (v13 §2.2) ; lot 3 : dépose de l'article courant + pose de celui-ci
    mention: '',            // mention libre, dernière ligne du bloc d'étiquette (v11 §4)
    etiquette: blocParDefaut({ dx: CHARTE.texte.decalage_etiquette.dx, dy: CHARTE.texte.decalage_etiquette.dy, detail_malt: false, ...aspect }),
    materiel: blocParDefaut({ ...aspect }),   // bloc matériel associé + mention, position relative au bas du bloc désignation
    cartouche: blocParDefaut({ dx: CHARTE.cartouche.decalage.dx, dy: CHARTE.cartouche.decalage.dy, couleur_contour: CHARTE.cartouche.contour, couleur_texte: CHARTE.texte.couleur_texte_defaut, fond: 'blanc' }),
    deport: { dx: 0, dy: 0 },   // ponctuels : décalage du symbole par rapport à l'ancrage (x, y)
    attributs: {}
  };
}

export function nouvelObjetPonctuel(type, x, y, courant, attributs = {}) {
  const o = base(type, courant);
  o.x = x; o.y = y;
  o.attributs = attributsParDefaut(type);
  Object.assign(o.attributs, attributs);
  if (type === 'eras') {
    if (attributs.sous_type === undefined) o.attributs.sous_type = SOUS_TYPE_ERAS_PAR_DOMAINE[o.domaine] || 'BT_RESEAU';   // outil 7 : le type suit le réseau du bandeau
    if (o.attributs.malt_regle === undefined || o.attributs.malt_regle === null) o.attributs.malt_regle = regleMaltSousType(o.attributs.sous_type);
    if (attributs.avec_malt === undefined) o.attributs.avec_malt = o.attributs.malt_regle === 'oui';
    o.attributs.malt_origine = o.attributs.avec_malt && o.attributs.malt_regle !== 'oui' ? 'MANUELLE' : 'AUTO';
    appliquerRegleMalt(o);   // le réseau courant (bandeau) prime sur le type par défaut
  }
  return o;
}

export function attributsParDefaut(type) {
  switch (type) {
    case 'support':
      return { materiau: '', classe: '', hauteur_m: null, effort_daN: null, fonction: '', renforcement: 'AUCUN', angle_renforcement: 0, armement: '', armement_ref: null, usage: '', angle_gr: null, malt_ex: false };
    case 'coffret':
      return { sigle: '', nb_plages: null, section_reseau: '', malt_ex: false };
    case 'poste':
      return { sigle: '', puissance_kva: null, malt_ex: false, nom: '' };   // nom : v1.5.0, facultatif (descriptif)
    case 'boite_jonction':
      return { sections: '', malt_ex: false };
    case 'malt':
      return { convention: '', longueur_tige: CHARTE.malt.hauteur_trait };
    case 'eras':
      return { avec_malt: true, sous_type: 'BT_RESEAU', malt_regle: 'oui', malt_origine: 'AUTO', longueur_tige: CHARTE.eras.tige_defaut, malt_ex: false };   // BT_RESEAU | HTA | BRANCHEMENT | EP ; malt_origine : AUTO | MANUELLE (v13 §1.3)
    case 'point_lumineux':
      return { sur: 'SUPPORT', malt_ex: false };                           // SUPPORT | MAT
    case 'armoire_ep':
      return { sigle: 'S17', phase: '', malt_ex: false };
    case 'lanterne_ep':
      return { sur: 'SUPPORT', malt_ex: false };
    case 'boucle_ep':
      return { malt_ex: false };
    default:
      return {};
  }
}

export function nouveauTroncon(points, courant, attributs = {}) {
  const o = base('troncon', courant);
  o.points = points.map((p) => ({ x: p.x, y: p.y }));
  o.attributs = {
    section: '', section_retenue: '', nature: '', norme: '', fourreau: '',
    longueur_m: null, longueur_source: 'MANUELLE',   // MANUELLE | CALCULEE (lot 3)
    afficher_longueur: true,
    nature_terrain: '', profondeur_m: null, grillage_avertisseur: null,
    revetements: [],     // v13 (v1.5.1) : [{ nature, longueur_m }] — longueur null = tout le tronçon
    tranchee_commune: false,
    sous_segments: []    // lot 3 : [{ de, a, nature_terrain }]
  };
  Object.assign(o.attributs, attributs);
  return o;
}

/* Fourreau accroché à un tronçon (troncon_id + abscisses curvilignes 0..1) ou seul (points). */
export function nouveauFourreau(courant, { troncon_id = null, s_debut = 0, s_fin = 1, points = null, attributs = {} } = {}) {
  const o = base('fourreau', courant);
  o.troncon_id = troncon_id;
  o.s_debut = s_debut; o.s_fin = s_fin;
  o.points = points ? points.map((p) => ({ x: p.x, y: p.y })) : [];
  o.pose = 'souterrain';
  o.attributs = { matiere: 'TPC', diametre_mm: null, notation: '', nombre: 1, longueur_m: null, longueur_source: 'MANUELLE', afficher_longueur: true };
  Object.assign(o.attributs, attributs);
  return o;
}

/* Annotation de plan : jamais de nomenclature, jamais de métré (v11 §6). */
export function nouvelleAnnotation(sous_type, { x = 0, y = 0, points = null, texte = '' } = {}) {
  const o = base('annotation', { etat: 'existant', domaine: 'BTS', pose: 'aerien' });
  o.calque = 'annotations';
  o.sous_type = sous_type;
  o.x = x; o.y = y;
  o.points = points ? points.map((p) => ({ x: p.x, y: p.y })) : [];
  o.texte = texte;
  o.couleur = CHARTE.COULEURS_ANNOTATION[0];
  o.epaisseur = CHARTE.annotations.epaisseur_defaut;
  o.taille_texte = null;   // null = taille par défaut de la charte pour ce sous-type (v12 §2.1)
  o.etiquette.visible = false; o.cartouche.visible = false; o.materiel.visible = false;
  o.attributs = attributsAnnotation(sous_type);
  return o;
}

export function attributsAnnotation(sous_type) {
  const A = CHARTE.annotations;
  switch (sous_type) {
    case 'zone_hachuree': return { pas: A.zone.pas, angle_deg: A.zone.angle_deg, opacite: A.zone.opacite, remplissage: false };
    case 'malt_libre': return { longueur_tige: CHARTE.malt.hauteur_trait };
    case 'fleche_texte': return { double: false };
    case 'fleche_double_texte': return { double: true };
    case 'trait': return { extremites: A.trait.extremites[0], style: A.trait.styles[0] };   // extremites : aucune | pointe | point ; style : plein | pointille (v1.4.4 §1)
    default: return {};
  }
}

/* Masque du fond de plan (gomme magique, v12 §8) : rectangle (4 sommets), polygone ou bande de pinceau (points + diamètre). */
/* Dessin (ex-masque du fond, v13.3 §4) : aplat plein posé sous les ouvrages, ou au-dessus en mode surligneur. */
export function nouveauMasque(sous_type, points, { diametre = null, rayon = null } = {}) {
  const o = base('masque', { etat: 'existant', domaine: 'BTS', pose: 'aerien' });
  o.calque = 'masques';
  o.sous_type = sous_type;
  o.points = points.map((p) => ({ x: p.x, y: p.y }));
  o.couleur = CHARTE.masque.couleur_defaut;
  o.opacite = CHARTE.masque.opacite_defaut;
  o.etiquette.visible = false; o.cartouche.visible = false; o.materiel.visible = false;
  o.attributs = {
    diametre: sous_type === 'pinceau' ? (diametre ?? CHARTE.masque.pinceau.diametre_defaut) : null,
    rayon: sous_type === 'rectangle_arrondi' ? (rayon ?? CHARTE.masque.rayon_arrondi) : null,   // rayon d'angle (v13.4 §2)
    surligneur: false
  };
  return o;
}

export function nouvelleNote(x, y, texte = '') {
  const o = base('note', { etat: 'existant', domaine: 'BTS', pose: 'aerien' });
  o.calque = 'annotations';
  o.x = x; o.y = y;
  o.texte = texte;
  o.couleur = CHARTE.notes.couleur_defaut;
  o.taille = CHARTE.notes.taille_defaut;
  o.cadre = 'aucun';        // aucun | rectangle | arrondi (v12 §2.3)
  o.fond = 'translucide';   // aucun | translucide | blanc
  o.fleche = null;   // { x, y } point désigné
  o.fleche_depart = 'bord';   // bord (milieu du bord gauche, historique) | coin (coin du côté de la pointe, v1.4.6 §4)
  o.alignement = 'gauche';    // gauche | centre | droite | justifie (v1.4.6 §1) ; o.segments posé par l'éditeur si mise en forme
  o.etiquette.visible = false;
  return o;
}

/* Image / photo libre (v1.4.6 §2) : centre (x, y), largeur × hauteur en unités plan, rotation, opacité ; binaire dans le
 * magasin `fonds` (fond_id). Hors nomenclature, hors métré, hors légende ; calque « images ». */
export function nouvelleImage(x, y, largeur, hauteur, fond_id, nom_fichier = '') {
  const o = base('image', { etat: 'existant', domaine: 'BTS', pose: 'aerien' });
  o.calque = 'images';
  o.x = x; o.y = y;
  o.largeur = largeur; o.hauteur = hauteur;
  o.opacite = 1;
  o.fond_id = fond_id;
  o.nom_fichier = nom_fichier;
  o.recadrage = { g: 0, h: 0, d: 0, b: 0 };   // v1.4.7 : rien de retiré
  o.etiquette.visible = false; o.cartouche.visible = false; o.materiel.visible = false;
  return o;
}

/* Objets de dessin et de mise en page : jamais de nomenclature, de réseau, d'état ni de métré. */
export function estObjetDessin(o) {
  return !!(o && (o.type === 'note' || o.type === 'annotation' || o.type === 'masque' || o.type === 'image'));
}

/* ---------- Repères ---------- */
export function attribuerRepere(projet, objet) {
  if (objet.repere || objet.repere_manuel) return objet.repere;
  const prefixe = CHARTE.reperes[objet.type] || 'O';
  projet.compteurs[prefixe] = (projet.compteurs[prefixe] || 0) + 1;
  objet.repere = prefixe + projet.compteurs[prefixe];
  return objet.repere;
}

/* Recalcule les compteurs à l'ouverture d'un projet (sécurité après import). */
export function recalculerCompteurs(projet) {
  const compteurs = {};
  for (const plan of projet.plans) {
    for (const o of plan.objets) {
      if (o.repere_manuel) continue;   // un repère saisi à la main n'alimente pas la numérotation
      const m = /^([A-Z]+)(\d+)$/.exec(o.repere || '');
      if (m) compteurs[m[1]] = Math.max(compteurs[m[1]] || 0, parseInt(m[2], 10));
    }
  }
  projet.compteurs = compteurs;
}

/* ---------- Sections dérivées (v12 §4) ---------- */
/* Id de l'article « à sections regroupées » d'un tronçon, par ref_article ou par la section affichée. */
export function articleSectionsDerivees(o) {
  const a = o.attributs || {};
  if (o.ref_article && SECTIONS_DERIVEES[o.ref_article]) return o.ref_article;
  if (!a.section) return null;
  const n = etat.nomenclature;
  if (!n || !n.articles) return null;
  const compact = String(a.section).toLowerCase().replace(/\s+/g, '');
  for (const id of Object.keys(SECTIONS_DERIVEES)) {
    const art = n.articles.find((x) => x.id === id);
    if (art && art.attributs && art.attributs.section && String(art.attributs.section).toLowerCase().replace(/\s+/g, '') === compact) return id;
  }
  return null;
}

/* Section à écrire sur le plan : section retenue si l'article regroupe deux sections, sinon la section saisie. */
export function sectionAffichee(o) {
  const a = o.attributs || {};
  const id = articleSectionsDerivees(o);
  if (id) return a.section_retenue && SECTIONS_DERIVEES[id].includes(a.section_retenue) ? a.section_retenue : '';
  return a.section || '';
}

/* ---------- Règle MALT des ERAS : une seule fonction, appelée à chaque mutation (v13 §1) ----------
 * MALT affichée si malt_obligatoire === true ou si le réseau vaut HTA ; jamais si malt_obligatoire === false ou si le
 * réseau vaut BRT ou EP. Le réseau de l'objet prime sur l'article (un article BT réseau porté par une RAS BRT est une
 * incohérence signalée par articleIncompatible(), pas une raison de dessiner la MALT). Retourne 'oui' | 'non' | null. */
export function maltApplicable(o) {
  if (!o || o.type !== 'eras') return 'non';
  const parDomaine = regleMaltDomaine(o.domaine);
  if (parDomaine === 'non') return 'non';
  const art = articleDe(o);
  const parArticle = art ? regleMaltEras(art) : null;
  if (parArticle === 'non') return 'non';
  if (parDomaine === 'oui' || parArticle === 'oui') return 'oui';
  return regleMaltSousType((o.attributs || {}).sous_type);
}

/* Applique la règle à l'objet : une MALT AUTO suit la règle ; une MALT MANUELLE n'est jamais retirée en silence
 * (l'objet passe en « à compléter », v13 §1.3). Retourne true si avec_malt a changé. */
export function appliquerRegleMalt(o) {
  if (!o || o.type !== 'eras') return false;
  const a = o.attributs;
  const avant = !!a.avec_malt;
  const regle = maltApplicable(o);
  a.malt_regle = regle;
  if (a.malt_origine === undefined) a.malt_origine = avant && regle !== 'oui' ? 'MANUELLE' : 'AUTO';
  if (regle === 'oui') { a.avec_malt = true; if (a.malt_origine === 'MANUELLE') a.malt_origine = 'AUTO'; }   // la règle la couvre : elle redevient automatique
  else if (regle === 'non') { if (a.malt_origine !== 'MANUELLE') a.avec_malt = false; }
  else if (a.malt_origine !== 'MANUELLE') a.avec_malt = false;   // cas non couvert : rien n'est dessiné sans choix explicite
  return avant !== !!a.avec_malt;
}

/* Changement de réseau d'un objet, quel que soit le point d'entrée (fiche, bandeau du bas, menu, import, migration).
 * ERAS : le type suit le réseau et la règle MALT est réévaluée. L'article courant est conservé même s'il devient
 * incompatible (v13 §1.4) : l'incohérence est signalée par articleIncompatible(). */
export function appliquerDomaine(o, domaine) {
  if (!o || !domaine) return;
  if (estObjetDessin(o)) { o.domaine = domaine; return; }
  o.domaine = domaine;
  if (o.type === 'eras') {
    const st = SOUS_TYPE_ERAS_PAR_DOMAINE[domaine];
    if (st) o.attributs.sous_type = st;
    appliquerRegleMalt(o);
  }
}

/* Changement de type d'une ERAS depuis la fiche : le réseau suit le type (v12 §5.4.3), puis même réévaluation. */
export function appliquerSousTypeEras(o, sous_type) {
  if (!o || o.type !== 'eras') return;
  o.attributs.sous_type = sous_type;
  const d = DOMAINE_PAR_SOUS_TYPE_ERAS[sous_type];
  if (d) o.domaine = d;
  appliquerRegleMalt(o);
}

/* Article de nomenclature référencé par l'objet (null si absent). */
export function articleDe(o) {
  const n = etat.nomenclature;
  if (!o || !o.ref_article || !n || !n.articles) return null;
  return n.articles.find((x) => x.id === o.ref_article) || null;
}

/* L'article courant porte-t-il un réseau différent de celui de l'objet ? (garde-fou du bandeau du bas, v13 §1.4) */
export function articleIncompatible(o) {
  const art = articleDe(o);
  if (!art || !art.attributs || !art.attributs.domaine) return false;
  // v1.4.6 §5 : le 2 x 16 de branchement (BRT) est aussi la section de l'EP aérien — pas d'incompatibilité sur un tronçon EP
  if (o.type === 'troncon' && o.domaine === 'EP' && sectionsEpPour(o.pose).some((e) => e.article === art.id)) return false;
  return art.attributs.domaine !== o.domaine;
}

/* ---------- v1.5.1 / v1.5.2 : symbole MALT porté par un ouvrage ----------
 * Dessiné quand l'ouvrage porte « MALT ex » ou la « Confection MALT » (package) et que `malt_symbole.visible` n'est pas
 * false. L'ERAS dessine sa propre MALT (avec_malt) et l'objet MALT est lui-même le symbole : ni l'un ni l'autre n'en
 * porte. v1.5.2 : `{ visible, angle, longueur_tige }` — tige depuis le centre de l'ouvrage, sous lui, orientée par
 * `angle` (degrés, 0 = vers le bas), longueur locale (null = automatique, toujours au-delà du symbole). */
export function peutPorterSymboleMalt(o) {
  return !!o && TYPES_PONCTUELS.includes(o.type) && o.type !== 'malt' && o.type !== 'eras';
}
export function aConfectionMalt(o) { return !!o && (o.materiel_associe || []).some((m) => m.package === 'MALT'); }
export function categorieMaltHote(o) {
  if (aConfectionMalt(o)) return categorieMalt(false, o.domaine);
  if (o && o.attributs && o.attributs.malt_ex) return 'ex';
  return null;
}
export function symboleMaltActif(o) {
  return peutPorterSymboleMalt(o) && !!o.malt_symbole && o.malt_symbole.visible !== false && categorieMaltHote(o) !== null;
}
/* v1.5.2 — Reprise d'un symbole au format v1.5.1 ({ dx, dy, longueur_tige } : haut de tige décalé du centre) :
 * l'orientation est déduite du décalage, la longueur repasse en automatique (elle partait d'un autre point). */
export function normaliserSymboleMalt(o) {
  const m = o && o.malt_symbole;
  if (!m || typeof m !== 'object') return false;
  let change = false;
  if ('dx' in m || 'dy' in m) {
    const dx = Number(m.dx), dy = Number(m.dy);
    m.angle = (m.dx !== null && m.dx !== undefined && m.dy !== null && m.dy !== undefined && (dx || dy)) ? Math.round(Math.atan2(-dx, dy) * 180 / Math.PI) : 0;
    m.longueur_tige = null;
    delete m.dx; delete m.dy;
    change = true;
  }
  if (typeof m.angle !== 'number' || !Number.isFinite(m.angle)) { m.angle = 0; change = true; }
  if (m.longueur_tige !== null && (typeof m.longueur_tige !== 'number' || !Number.isFinite(m.longueur_tige))) { m.longueur_tige = null; change = true; }
  return change;
}

/* Crée le symbole (position par défaut) s'il n'existe pas encore ; le réaffiche s'il avait été masqué. */
export function assurerSymboleMalt(o) {
  if (!peutPorterSymboleMalt(o) || categorieMaltHote(o) === null) return false;
  if (!o.malt_symbole) {
    const K = CHARTE.malt;
    o.malt_symbole = { visible: true, angle: 0, longueur_tige: null };   // v1.5.2 : depuis le centre, vers le bas, longueur auto
    return true;
  }
  if (o.malt_symbole.visible === false) { o.malt_symbole.visible = true; return true; }
  return false;
}

/* MALT posée à la main sur une remontée où la règle l'exclut (BRT / EP) ou ne la couvre pas. */
export function maltHorsRegle(o) {
  if (!o || o.type !== 'eras') return false;
  const a = o.attributs || {};
  return !!a.avec_malt && a.malt_regle !== 'oui';
}

/* Tronçon d'éclairage public souterrain sans section retenue : « EP sous fourreau » / « EP » (v13 §3). */
export function epSouterrainSansSection(o) {
  return !!(o && o.type === 'troncon' && o.domaine === 'EP' && o.pose === 'souterrain' && !sectionAffichee(o));
}

/* Remplacement renseigné ? (état « à remplacer », v13 §2.2) */
export function remplacementRenseigne(o) {
  const r = o && o.remplacement_par;
  return !!(r && ((r.designation && String(r.designation).trim()) || r.article_id));
}

/* Un dessin en mode surligneur passe au-dessus des ouvrages (rang « surlignage », sous les notes) ; sinon sous tout (v13.3 §4.1 bis).
 * Il reste dans tous les cas un objet de type `masque` : hors métré, hors légende, sans repère ni nomenclature. */
export function estSurligneur(o) {
  return !!(o && o.type === 'masque' && o.attributs && o.attributs.surligneur);
}

/* Clé d'ordre Z d'un objet : son type, sauf un dessin en surligneur qui prend le rang « surlignage ». */
export function cleOrdreZ(o) {
  return estSurligneur(o) ? 'surlignage' : o.type;
}

/* ---------- Indicateur « complet » ---------- */
export function estComplet(o, tous = null) {
  if (!estObjetDessin(o)) {
    if (o.etat === 'a_reprendre' && !remplacementRenseigne(o)) return false;   // un remplacement sans cible n'est pas chiffrable
    if (articleIncompatible(o)) return false;
  }
  const a = o.attributs || {};
  switch (o.type) {
    case 'support': {
      // v1.4.8 : console complète sans autre attribut ; ancrage complet dès que son type est choisi
      if (a.materiau === 'CONSOLE') return true;
      if (a.materiau === 'ANCRAGE') return !!a.armement_ref;
      if (!a.materiau || !a.hauteur_m) return false;
      if (effortHorsMarcheAPoser(o)) return false;   // v1.5.0 §1 : valeur conservée, support à poser « à compléter »
      if (a.materiau === 'BETON') return !!a.classe && !!a.effort_daN;
      if (a.materiau === 'BOIS') return !!a.classe;
      return !!a.effort_daN;   // ME_TUB, ME_PTR
    }
    case 'coffret':
    case 'poste':
    case 'armoire_ep':
      return !!a.sigle;
    case 'troncon':
      if (!a.section) return epSouterrainSansSection(o);   // EP souterrain sans section : désignation valable, pas un manque (v13 §3)
      if (sectionNuHorsDomaine(o)) return false;          // v1.4.9 §6 : « Nu… » conservée mais hors BT aérien existant → à compléter
      return articleSectionsDerivees(o) ? !!sectionAffichee(o) : true;   // article « ou » : section retenue obligatoire
    case 'fourreau':
      return !!(o.ref_article || a.notation) && !(tous && fourreauChevauche(o, tous));
    case 'eras':
      return !maltHorsRegle(o);   // MALT posée à la main hors règle (BRT / EP, cas non couvert) → à compléter, jamais retirée en silence
    case 'note':
      return !!(o.texte && o.texte.trim());
    default:
      return true;   // MALT, boîtes de jonction, point lumineux, lanterne / boucle EP, annotations, masques : rien d'obligatoire
  }
}

/* Support à poser portant un effort ancien hors marché (250 à 500 daN, béton D) : la valeur est conservée, l'objet
 * passe « à compléter » — même mécanisme qu'un article devenu incompatible (v1.5.0 §1, H-271). */
export function effortHorsMarcheAPoser(o) {
  return !!o && o.type === 'support' && o.etat === 'a_poser' && effortHorsMarche(o.attributs);
}

/* Section « conducteurs nus » portée par un tronçon où elle ne s'applique pas (passé à poser, en souterrain, autre
 * réseau…) : conservée, objet « à compléter » — même logique qu'un article devenu incompatible (v1.4.9 §6.4). */
export function sectionNuHorsDomaine(o) {
  return !!o && o.type === 'troncon' && estSectionNu(o.attributs && o.attributs.section) && !sectionsNusApplicables(o.domaine, o.pose, o.etat);
}

/* Deux fourreaux accrochés au même tronçon se chevauchent-ils ? (signalé, pas interdit — v11 §5.2) */
export function fourreauChevauche(o, tous) {
  if (!o.troncon_id) return false;
  const [a1, b1] = [Math.min(o.s_debut, o.s_fin), Math.max(o.s_debut, o.s_fin)];
  return tous.some((x) => x !== o && x.type === 'fourreau' && x.troncon_id === o.troncon_id
    && Math.min(x.s_debut, x.s_fin) < b1 - 1e-6 && Math.max(x.s_debut, x.s_fin) > a1 + 1e-6);
}

export function mettreAJourComplet(o, tous = null) {
  o.complet = estComplet(o, tous);
  return o.complet;
}

/* Motifs lisibles d'un objet « à compléter » (liste du panneau, v13 §1.3, §1.4, §2.2). */
export function motifsACompleter(o, tous = null) {
  const a = o.attributs || {};
  const m = [];
  if (estObjetDessin(o)) return m;
  if (o.etat === 'a_reprendre' && !remplacementRenseigne(o)) m.push('« remplacé par » à renseigner');
  if (articleIncompatible(o)) { const art = articleDe(o); m.push('article ' + (art ? art.id + ' (' + (art.attributs.domaine === 'BTS' ? 'BT' : art.attributs.domaine) + ')' : '') + ' incompatible avec le réseau ' + (o.domaine === 'BTS' ? 'BT' : o.domaine)); }
  switch (o.type) {
    case 'support':
      if (!a.materiau) m.push('matériau');
      if (a.materiau === 'CONSOLE') break;
      if (a.materiau === 'ANCRAGE') { if (!a.armement_ref) m.push('type d\'ancrage'); break; }
      if (!a.hauteur_m) m.push('hauteur');
      if ((a.materiau === 'BETON' || a.materiau === 'BOIS') && !a.classe) m.push('classe');
      if ((a.materiau === 'BETON' || a.materiau === 'ME_TUB' || a.materiau === 'ME_PTR') && !a.effort_daN) m.push('effort');
      if (effortHorsMarcheAPoser(o)) m.push('effort hors marché pour un support à poser');   // v1.5.0 §1
      break;
    case 'coffret': case 'poste': case 'armoire_ep':
      if (!a.sigle) m.push('sigle');
      break;
    case 'troncon':
      if (!a.section) { if (!epSouterrainSansSection(o)) m.push('section'); }
      else if (articleSectionsDerivees(o) && !sectionAffichee(o)) m.push('section réellement posée à retenir (article à deux sections)');
      else if (sectionNuHorsDomaine(o)) m.push('section « ' + a.section + ' » réservée à la BT aérienne existante, à déposer ou à remplacer');
      break;
    case 'fourreau':
      if (!(o.ref_article || a.notation)) m.push('article de fourreau');
      else if (tous && fourreauChevauche(o, tous)) m.push('chevauche un autre fourreau');
      break;
    case 'eras':
      if (maltHorsRegle(o)) m.push(a.malt_regle === 'non' ? 'MALT sur une remontée BRT/EP' : 'MALT ajoutée à la main hors règle (BT réseau / HTA seulement) : à vérifier');
      break;
    default: break;
  }
  return m;
}

/* Suffixe d'état affiché derrière la désignation automatique (v13 §2), libellés de charte.SUFFIXES_ETAT. */
export function suffixeEtat(o) {
  const S = CHARTE.SUFFIXES_ETAT;
  if (o.etat === 'a_reprendre') {
    const r = o.remplacement_par;
    const cible = r && r.designation ? String(r.designation).trim() : '';
    return cible ? S.a_reprendre_par + cible : S.a_reprendre;
  }
  return S[o.etat] || '';
}

/* Désignation affichée : manuelle prioritaire (sans suffixe) ; sinon automatique + suffixe d'état
 * (« ex », « à déposer », « à remplacer par … », v13 §2). Le suffixe n'est jamais stocké. */
export function designationAffichee(o) {
  if (o.designation_manuelle && o.designation_manuelle.trim()) return o.designation_manuelle;
  const d = o.designation_auto || '';
  if (!d) return d;   // désignation vide : pas de suffixe orphelin (H-40)
  return (d + suffixeEtat(o)).trim();
}

/* Longueur formatée : virgule décimale, sans décimale inutile (30 m, 30,5 m). */
export function formaterLongueur(v) {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '';
  const n = Math.round(Number(v) * 10) / 10;
  return String(n).replace('.', ',');
}

/* Angle d'un support en grades : « φ = 45 gr », une décimale au plus, virgule décimale (v12 §6). */
export function formaterAngle(v) {
  const F = CHARTE.texte.format_angle;
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return '';
  const f = Math.pow(10, F.decimales);
  const n = Math.round(Number(v) * f) / f;
  return F.prefixe + String(n).replace('.', ',') + F.unite;
}

/* Valide une saisie d'angle en grades (virgule ou point) : nombre borné, null si vide, NaN si refusée. */
export function analyserAngle(texte) {
  const F = CHARTE.texte.format_angle;
  const t = String(texte ?? '').trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  if (!isFinite(v) || v < F.min || v > F.max) return NaN;
  const f = Math.pow(10, F.decimales);
  return Math.round(v * f) / f;
}

/* Texte d'étiquette d'un tronçon ou d'un fourreau : « <désignation>[<suffixe d'état>][<sep><longueur> m] » (v10 §2.2, v11 §5.4, v13 §2.1). */
export function etiquetteTroncon(o, reglages = {}) {
  let t = designationAffichee(o);
  const a = o.attributs || {};
  const afficher = reglages.afficher_longueurs !== false && a.afficher_longueur !== false;
  const L = formaterLongueur(a.longueur_m);
  if (afficher && L) t += (CHARTE.SEPARATEUR_LONGUEUR[o.etat] || ' : ') + L + CHARTE.UNITE_LONGUEUR;
  return t.trim();   // sans désignation : « : 42 m » / « — 30 m »
}

/* Lignes de matériel associé pour l'étiquette (une ligne par matériel, abréviations, package MALT condensé, MALT existante). */
export function lignesMaterielEtiquette(o) {
  const lignes = [];
  const materiel = o.materiel_associe || [];
  const malt = materiel.filter((m) => m.package === 'MALT');
  const detail = o.etiquette && o.etiquette.detail_malt;
  if (o.attributs && o.attributs.malt_ex && o.type !== 'malt') lignes.push(MALT_CONDENSE.existante);
  // L'objet MALT porte déjà sa ligne de désignation (v12 §5.2) : pas de condensation supplémentaire
  if (malt.length && !detail && o.type !== 'malt') lignes.push(MALT_CONDENSE.confection);
  for (const m of materiel) {
    if (m.package === 'MALT' && !detail) continue;
    const q = m.quantite;
    const afficherQte = (q !== null && q !== undefined && q !== '' && Number(q) !== 1) || (m.quantite_saisie && q !== null && q !== undefined && q !== '');
    lignes.push((afficherQte ? formaterLongueur(q) + ' ' : '') + libelleEtiquetteMateriel(m));
  }
  // « MALT ex » n'apparaît qu'une seule fois dans le bloc (v12 §5.2, vérifié sur un support à remplacer — v13 §2)
  return lignes.filter((l, i) => l && (l !== MALT_CONDENSE.existante || lignes.indexOf(l) === i));
}

/* Compatibilité : ancien abrégé sur une ligne (réservé aux listes). */
export function materielAbrege(o) {
  return lignesMaterielEtiquette(o).join(', ');
}

/* Migration de schéma : applique les valeurs manquantes aux anciens projets. */
export function migrerProjet(p) {
  if (!p.version_schema) p.version_schema = 1;
  const ancienne = p.version_schema;
  if (!p.calques) p.calques = calquesParDefaut();
  for (const nom of NOMS_CALQUES) if (!p.calques[nom]) p.calques[nom] = { visible: true, verrou: false, opacite: 1 };
  if (!p.filtre_domaines) p.filtre_domaines = { HTA: true, BTS: true, BRT: true, EP: true };
  if (!p.compteurs) p.compteurs = {};
  if (!p.reglages) p.reglages = { echelle_symbole: 1, taille_texte: 1, afficher_longueurs: true };
  if (p.reglages.afficher_longueurs === undefined) p.reglages.afficher_longueurs = true;
  if (!Array.isArray(p.plans) || p.plans.length === 0) p.plans = [nouveauPlan()];
  if (typeof p.plan_courant !== 'number') p.plan_courant = 0;
  if (p.echelle_plan === undefined) p.echelle_plan = null;
  migrerProjetV8(p);
  const defauts = defautsEchellePlan(p.echelle_plan);
  const aspect = aspectBlocParDefaut();
  if (ancienne < 2) marquerPackagesMalt(p);
  for (const plan of p.plans) {
    if (!plan.objets) plan.objets = [];
    if (!plan.legende) plan.legende = legendeParDefaut();
    migrerLegendeV5(plan.legende);
    if (!plan.fonds) plan.fonds = [];
    for (const o of plan.objets) {
      if (!o.etiquette) o.etiquette = { visible: o.type !== 'note', dx: CHARTE.texte.decalage_etiquette.dx, dy: CHARTE.texte.decalage_etiquette.dy };
      if (!o.materiel_associe) o.materiel_associe = [];
      if (!o.attributs) o.attributs = attributsParDefaut(o.type);
      if (o.echelle_symbole === undefined) o.echelle_symbole = 1;
      if (o.rotation === undefined) o.rotation = 0;
      // v2
      if (o.etiquette.detail_malt === undefined) o.etiquette.detail_malt = false;
      if (!o.cartouche) o.cartouche = { visible: true, dx: CHARTE.cartouche.decalage.dx, dy: CHARTE.cartouche.decalage.dy };
      if (!o.deport) o.deport = { dx: 0, dy: 0 };
      if (o.repere_manuel === undefined) o.repere_manuel = false;
      if (o.type === 'troncon') {
        if (o.attributs.longueur_m === undefined || o.attributs.longueur_m === null) o.attributs.longueur_m = o.attributs.longueur_manuelle ?? null;
        delete o.attributs.longueur_manuelle;
        if (!o.attributs.longueur_source) o.attributs.longueur_source = 'MANUELLE';
        if (o.attributs.afficher_longueur === undefined) o.attributs.afficher_longueur = true;
      }
      if (o.type === 'malt' && (o.attributs.longueur_tige === undefined || o.attributs.longueur_tige === null)) o.attributs.longueur_tige = CHARTE.malt.hauteur_trait;
      for (const m of o.materiel_associe) {
        if (m.quantite_saisie === undefined) m.quantite_saisie = false;
        if (m.package === undefined) m.package = null;
      }
      // v3
      if (o.mention === undefined) o.mention = '';
      for (const cle of ['etiquette', 'materiel', 'cartouche']) {
        if (!o[cle]) o[cle] = blocParDefaut(cle === 'cartouche' ? { dx: CHARTE.cartouche.decalage.dx, dy: CHARTE.cartouche.decalage.dy } : {});
        const b = o[cle];
        if (b.echelle === undefined) b.echelle = 1;
        if (b.rotation === undefined) b.rotation = 0;
        if (b.retourner === undefined) b.retourner = true;
        if (b.visible === undefined) b.visible = cle === 'materiel' ? (o.etiquette ? o.etiquette.visible !== false : true) : true;
        if (b.dx === undefined) b.dx = 0;
        if (b.dy === undefined) b.dy = 0;
      }
      if (o.cartouche.couleur_contour === undefined) o.cartouche.couleur_contour = CHARTE.cartouche.contour;
      if (o.cartouche.couleur_texte === undefined) o.cartouche.couleur_texte = '#000000';
      if (o.cartouche.fond === undefined) o.cartouche.fond = 'blanc';
      if (o.type === 'annotation') {
        if (!o.points) o.points = [];
        if (o.couleur === undefined) o.couleur = CHARTE.COULEURS_ANNOTATION[0];
        if (o.epaisseur === undefined) o.epaisseur = CHARTE.annotations.epaisseur_defaut;
        // v1.4.4 §1 (H-201) : repli 'plein' pour tout Trait posé avant ce lot — aucun changement visuel à l'ouverture.
        if (o.sous_type === 'trait' && o.attributs.style === undefined) o.attributs.style = CHARTE.annotations.trait.styles[0];
      }
      if (o.type === 'fourreau') {
        if (!o.points) o.points = [];
        if (o.troncon_id === undefined) o.troncon_id = null;
        if (o.attributs.nombre === undefined) o.attributs.nombre = 1;
        if (o.attributs.matiere === undefined) o.attributs.matiere = 'TPC';
      }
      // v4
      migrerObjetV4(o, ancienne, defauts, aspect);
      // v5
      migrerObjetV5(o);
      // v6
      migrerObjetV6(o);
      // v7
      migrerObjetV7(o);
      // v9
      migrerObjetV9(o);
      // v10
      migrerObjetV10(o);
      // v11 (v1.4.9) : retour_ligne et couleur_manuelle facultatifs — rien à transformer
      // v12 (v1.5.0) : nom facultatif des postes (jamais écrasé s'il existe déjà)
      if (o.type === 'poste' && o.attributs && o.attributs.nom === undefined) o.attributs.nom = '';
      // v13 (v1.5.1) : revêtements multiples (la nature unique devient un revêtement sur toute la longueur)
      if (o.malt_symbole) normaliserSymboleMalt(o);   // v1.5.2 : symbole MALT depuis le centre (format v1.5.1 repris)
      if (o.type === 'troncon' && o.attributs && !Array.isArray(o.attributs.revetements)) {
        o.attributs.revetements = o.attributs.nature_terrain ? [{ nature: o.attributs.nature_terrain, longueur_m: null }] : [];
      }
    }
    // v12 (v1.5.0) : descriptif des travaux. Un descriptif existant (projet rouvert après un passage par une version
    // antérieure partageant la même base) est conservé tel quel ; il est remis à jour à l'ouverture (historique.js).
    if (plan.descriptif === undefined) plan.descriptif = null;
    for (const o of plan.objets) mettreAJourComplet(o, plan.objets);
  }
  p.version_schema = VERSION_SCHEMA;
  return p;
}

/* v4 → v5 (v13) : remplacement_par, malt_origine, réévaluation de la règle MALT d'après le réseau (§1.2, §1.3). */
function migrerObjetV5(o) {
  if (estObjetDessin(o)) return;
  if (!o.remplacement_par || typeof o.remplacement_par !== 'object') o.remplacement_par = remplacementParDefaut();
  if (o.remplacement_par.article_id === undefined) o.remplacement_par.article_id = null;
  if (o.remplacement_par.designation === undefined) o.remplacement_par.designation = '';
  if (!o.remplacement_par.attributs) o.remplacement_par.attributs = {};
  if (o.type === 'eras') {
    const a = o.attributs;
    // Une MALT cochée alors que la règle en vigueur ne l'imposait pas ne peut venir que de l'utilisateur ; les autres
    // (dont celles restées affichées sur les RAS BRT / EP par le défaut de la v1.3.0) sont automatiques et suivent la règle.
    if (a.malt_origine === undefined) a.malt_origine = a.avec_malt && a.malt_regle !== 'oui' ? 'MANUELLE' : 'AUTO';
    if (!a.sous_type) a.sous_type = SOUS_TYPE_ERAS_PAR_DOMAINE[o.domaine] || 'BT_RESEAU';
    if (SOUS_TYPE_ERAS_PAR_DOMAINE[o.domaine] && a.sous_type !== SOUS_TYPE_ERAS_PAR_DOMAINE[o.domaine]) a.sous_type = SOUS_TYPE_ERAS_PAR_DOMAINE[o.domaine];   // le type suit le réseau
    appliquerRegleMalt(o);
  }
}

/* v5 → v6 (v13.3) : couleur de texte des blocs, mode surligneur des dessins, reprise des cartouches agrandis à la main.
 * Le repère sortait à 2,25 mm et devait être agrandi objet par objet ; il vaut 3,5 mm depuis la v1.3.3, donc une
 * échelle de 1,2 à 2,2 ne peut être qu'une compensation de ce défaut et est ramenée à 1. Au-delà de 2,2, l'échelle
 * est un choix délibéré de mise en page et reste intacte. */
function migrerObjetV6(o) {
  if (o.type === 'masque') {
    if (!o.attributs || typeof o.attributs !== 'object') o.attributs = {};
    if (o.attributs.surligneur === undefined) o.attributs.surligneur = false;
    return;
  }
  const T = CHARTE.texte;
  for (const cle of ['etiquette', 'materiel']) {
    if (o[cle] && o[cle].couleur_texte === undefined) o[cle].couleur_texte = T.couleur_texte_defaut;
  }
  if (o.type === 'note' || o.type === 'annotation') return;
  const e = o.cartouche && o.cartouche.echelle;
  if (e !== undefined && e !== null && e > 1.05 && e <= CHARTE.cartouche.echelle_reprise_max) o.cartouche.echelle = 1;
}

/* v6 → v7 (v13.4) : `attributs.rayon` des dessins, lu par le seul `rectangle_arrondi`. Les dessins existants
 * gardent leur sous-type ; aucune forme n'est convertie. */
/* v8 → v9 (v1.4.6) : valeurs par défaut explicites, sans changement d'aspect (une note sans `segments` et alignée à
 * gauche est rendue par le chemin historique, une flèche « bord » part d'où elle partait). */
function migrerObjetV9(o) {
  if (o.type === 'note') {
    if (!o.alignement) o.alignement = 'gauche';
    if (!o.fleche_depart) o.fleche_depart = 'bord';
  }
  if (o.type === 'masque' && (o.rotation === undefined || o.rotation === null)) o.rotation = 0;
  if (o.type === 'image') {
    o.calque = 'images';
    if (o.opacite === undefined || o.opacite === null) o.opacite = 1;
    if (o.rotation === undefined || o.rotation === null) o.rotation = 0;
  }
}

/* v9 → v10 (v1.4.7) : recadrage explicite des images libres, sans changement d'aspect. Un recadrage présent est
 * relu dans les bornes du modèle (valeurs non numériques = 0, au moins `visible_min` visible dans chaque sens). */
function migrerObjetV10(o) {
  if (o.type !== 'image') return;
  if (!o.recadrage || typeof o.recadrage !== 'object') o.recadrage = { g: 0, h: 0, d: 0, b: 0 };
  else o.recadrage = bornerRecadrage(o.recadrage, CHARTE.image.recadrage.visible_min);
}

function migrerObjetV7(o) {
  if (o.type !== 'masque') return;
  if (!o.attributs || typeof o.attributs !== 'object') o.attributs = {};
  if (o.attributs.rayon === undefined) o.attributs.rayon = o.sous_type === 'rectangle_arrondi' ? CHARTE.masque.rayon_arrondi : null;
}

function migrerLegendeV5(l) {
  const L = CHARTE.legende;
  if (l.visible === undefined) l.visible = true;
  if (l.x === undefined) l.x = null;
  if (l.y === undefined) l.y = null;
  if (l.echelle === undefined || l.echelle === null) l.echelle = L.echelle_defaut;
  if (l.cadre === undefined) l.cadre = L.cadre_defaut;
  if (l.couleur_cadre === undefined) l.couleur_cadre = L.couleur_cadre_defaut;
  if (l.fond === undefined) l.fond = L.fond_defaut;
}

/* v3 → v4 (v12) : voir HYPOTHESES H-76 (échelles), H-79, H-83, H-86. */
function migrerObjetV4(o, ancienne, defauts, aspect) {
  // Blocs désignation / matériel : cadre, couleur, fond
  for (const cle of ['etiquette', 'materiel']) {
    const b = o[cle];
    if (b.cadre === undefined) b.cadre = aspect.cadre;
    if (b.couleur_cadre === undefined) b.couleur_cadre = aspect.couleur_cadre;
    if (b.fond === undefined) b.fond = aspect.fond;
  }
  // Échelle du plan : séparation des facteurs (remplace la compensation écrite par la v1.2.0 dans echelle_symbole)
  if (!o.echelle_plan_origine && o.type !== 'note') {
    const dS = defauts.echelle_symbole || 1, dT = defauts.taille_texte || 1;
    const compS = Math.abs((o.echelle_symbole || 1) * dS - 1) < 0.02;   // valeur ≈ 1/défaut : compensation pure
    const origineS = compS ? Math.round(dS * (o.echelle_symbole || 1) * 1000) / 1000 : Math.round(dS * 1000) / 1000;
    if (compS) o.echelle_symbole = 1;
    const blocs = ['etiquette', 'materiel', 'cartouche'].map((c) => o[c]);
    const compT = Math.abs((o.etiquette.echelle || 1) * dT - 1) < 0.02;
    const origineT = compT ? Math.round(dT * (o.etiquette.echelle || 1) * 1000) / 1000 : Math.round(dT * 1000) / 1000;
    for (const b of blocs) b.echelle = Math.round((b.echelle || 1) * dT / origineT * 1000) / 1000;   // aspect strictement identique
    o.echelle_plan_origine = { echelle_plan: null, echelle_symbole: origineS, taille_texte: origineT };
  }
  if (o.type === 'note') {
    if (typeof o.cadre === 'boolean') o.cadre = o.cadre ? 'rectangle' : 'aucun';
    if (o.cadre === undefined) o.cadre = 'aucun';
    if (typeof o.fond === 'boolean') o.fond = o.fond ? 'translucide' : 'aucun';
    if (o.fond === undefined) o.fond = 'translucide';
    if (o.echelle_symbole === undefined) o.echelle_symbole = 1;
  }
  if (o.type === 'annotation') {
    if (o.sous_type === 'trait_libre') o.sous_type = 'stylo';   // l'ancien « trait libre » était un tracé à main levée
    if (o.taille_texte === undefined) o.taille_texte = null;
    if (o.sous_type === 'trait' && o.attributs.extremites === undefined) o.attributs.extremites = CHARTE.annotations.trait.extremites[0];
    if (o.sous_type === 'fleche_double_texte') o.attributs.double = true;
  }
  if (o.type === 'masque') {
    if (o.couleur === undefined) o.couleur = CHARTE.masque.couleur_defaut;
    if (o.opacite === undefined) o.opacite = CHARTE.masque.opacite_defaut;
    if (!o.points) o.points = [];
    o.calque = 'masques';
  }
  if (TYPES_PONCTUELS.includes(o.type) && o.attributs.malt_ex === undefined) o.attributs.malt_ex = false;
  if (o.type === 'support') {
    if (o.attributs.angle_gr === undefined) o.attributs.angle_gr = null;
    if (o.attributs.armement_ref === undefined) o.attributs.armement_ref = null;
  }
  if (o.type === 'troncon' && o.attributs.section_retenue === undefined) o.attributs.section_retenue = '';
  if (o.type === 'eras') {
    if (o.attributs.longueur_tige === undefined || o.attributs.longueur_tige === null) o.attributs.longueur_tige = CHARTE.eras.tige_defaut;
    if (o.attributs.malt_regle === undefined) o.attributs.malt_regle = regleMaltSousType(o.attributs.sous_type);
    if (o.attributs.malt_regle === 'non') o.attributs.avec_malt = false;
  }
  if (o.type === 'malt' && ancienne < 4 && (o.etat === 'existant' || o.etat === 'a_reprendre' || o.etat === 'a_deposer')) {
    // Une MALT existante n'est pas à confectionner : les lignes du package ajoutées par l'ancien outil 8 sont retirées (H-83)
    o.materiel_associe = o.materiel_associe.filter((m) => m.package !== 'MALT');
  }
}

/* Migration v1 → v2 : retrouve les lignes issues du package MALT par leur libellé. */
function marquerPackagesMalt(p) {
  const libellesMalt = ["Confection d'une prise de terre", 'Gaine thermorétractable 1 m sur conducteur de terre', 'Amélioration par câblette cuivre nu', 'Piquets de terre de 1 m'];
  for (const plan of p.plans) for (const o of (plan.objets || [])) for (const m of (o.materiel_associe || [])) {
    if (!m.package && m.libelle && libellesMalt.some((l) => m.libelle.startsWith(l))) m.package = 'MALT';
  }
}

/* Copie profonde sûre. */
export function cloner(v) {
  return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}
