/* charte.js — TOUTE la charte graphique de l'application.
 *
 * Toutes les dimensions sont exprimées en unités de plan (points PDF, 1/72 de pouce
 * — 1 mm ≈ 2,835 pt). Elles ont donc une taille fixe SUR LE PAPIER : l'écran et
 * l'export PDF utilisent exactement les mêmes valeurs.
 *
 * TAILLES PAPIER (v1.3.2, mesurées sur un A3 au 1/500) : les valeurs du v9 §8 sortaient à
 * 1,1 mm pour une désignation et 0,85 mm pour un repère, contre 2,5 mm pour les numéros de
 * parcelle du cadastre — illisibles à l'impression. La référence est désormais le fond
 * cadastral : désignation 2,5 mm, matériel / repère 2,1 mm, sigle de coffret ≥ 1,8 mm,
 * support béton D 4 mm de large. Conversion : 1 mm = 2,835 pt (colonne « mm » en commentaire).
 *
 * Ce fichier se modifie sans toucher au reste du code.
 */

/* Millimètres papier → unités de plan (points PDF). Sert à écrire la charte en millimètres. */
export const MM = 72 / 25.4;   // 1 mm ≈ 2,835 unités

export const CHARTE = {

  /* ---------- 8.1 Réseaux : couleur par réseau et par état ----------
   * couleur : { existant, a_poser } ; pour BTS, l'existant dépend de la pose.
   * epaisseur : HTA > BTS > BRT = EP.
   * tirete_souterrain : motif [trait, blanc, ...] appliqué en pose souterraine.
   * facade : trait plein, même couleur que l'aérien (hypothèse H-02).
   */
  reseaux: {
    HTA: {
      libelle: 'HTA',
      couleur: { existant: '#8B2E1F', a_poser: '#E2001A' },
      epaisseur: 2.2,                          // 0,78 mm
      tirete_souterrain: [14, 5.5]          // pointillé long
    },
    BTS: {                                   // clé interne inchangée (projets existants) ; libellé affiché : « BT »
      libelle: 'BT',
      couleur: {
        existant: { aerien: '#F5DD27', facade: '#F5DD27', souterrain: '#3DDC1E' },   // v1.4.9 (H-263) : jaune #F5DD27 (v9 : #C8960C)
        a_poser: '#171AEB'                   // v10 §1.2 : valeur imposée (v9 : #14307D)
      },
      epaisseur: 1.7,                          // 0,6 mm
      tirete_souterrain: [8.5, 4.2]         // pointillé moyen
    },
    BRT: {
      libelle: 'Branchement',
      couleur: { existant: '#C47500', a_poser: '#FF6A00' },   // v1.4.9 (H-263) : orange foncé / orange fluo, toutes poses (v9 : #B35A00 / #FF8A00)
      epaisseur: 1.3,                          // 0,46 mm
      tirete_souterrain: [4.2, 2.8]         // pointillé court
    },
    EP: {
      libelle: 'Éclairage public',
      couleur: { existant: '#7B2D8E', a_poser: '#FF2D95' },
      epaisseur: 1.3,                          // 0,46 mm
      tirete_souterrain: [10, 3.5, 1.7, 3.5] // tiret-point
    }
  },

  /* Couleurs fluo : reçoivent un liseré sombre très fin (dessiné dessous). */
  fluo: ['#3DDC1E', '#FF2D95', '#F5DD27', '#FF6A00'],   // v1.4.9 : jaune BT existant et orange fluo BRT à poser (H-263)
  /* Couleur manuelle d'un tronçon ou d'un fourreau (v1.4.9 §4, H-266) : remplace la seule couleur ; liseré sombre si la
   * couleur est fluo ou si son contraste avec le blanc est inférieur à ce seuil (rapport WCAG de luminance relative). */
  couleur_manuelle: { contraste_min_lisere: 1.6 },
  lisere: { couleur: '#1A1A1A', surepaisseur: 1 },

  /* État « à déposer » sur les tronçons : hachures noires régulières par-dessus
   * le style de l'existant (ni changement de couleur, ni de tireté). */
  hachures_troncon: { pas: 7, longueur: 6.4, epaisseur: 0.8, couleur: '#000000', angle_deg: 60 },

  /* État « à reprendre » (hypothèse H-01) : style existant + liseré discontinu. */
  a_reprendre_troncon: { tirete: [1.7, 3.4], epaisseur: 0.8, couleur: '#000000' },

  /* ---------- États des objets ponctuels ---------- */
  etats: {
    existant:    { contour: '#000000', remplissage: '#FFFFFF' },
    a_poser:     { contour: '#000000', remplissage: '#000000' },
    a_deposer:   { contour: '#000000', remplissage: '#FFFFFF', hachures: { pas: 2.3, epaisseur: 0.6, angle_deg: 45, couleur: '#000000' } },
    a_reprendre: { contour: '#000000', remplissage: '#FFFFFF', demi: true }   // moitié gauche remplie (H-01)
  },
  contour_symbole: 0.85,         // épaisseur du contour des symboles ponctuels (0,3 mm)

  /* ---------- 8.2 Supports ---------- */
  /* v1.4.8 : formes alignées sur la légende de supports du SIEEP-HC (ME tub en octogone, poutrelle à croix droite,
   * console et ancrage en façade). Proportions relevées sur la capture, échelle calée sur le cercle bois (H-258). */
  supports: {
    rectangle: { largeur: 11.3, hauteur: 6.4 },        // béton classe D — 4 × 2,25 mm
    carre:     { cote: 8.2 },                          // béton classe E — 2,9 mm
    cercle:    { rayon: 3.7 },                         // bois (petit diamètre) — ∅ 2,6 mm
    croix:     { cote: 8.2, epaisseur_croix: 0.8 },    // poutrelle ME ptr : carré + croix droite (+) inscrite (v1.4.8, H-259)
    anneau:    { rayon: 6.4, rayon_interieur: 4.4 },   // ancien symbole ME tub — conservé, plus utilisé depuis la v1.4.8
    octogone:  { rayon: 5.3 },                         // ME tub — octogone, rayon circonscrit, ∅ 3,7 mm (H-258)
    console:   { base: 5.1, hauteur: 6.5 },            // console de façade — triangle 1,8 × 2,3 mm (H-258)
    ancrage:   { platine_largeur: 9.6, platine_hauteur: 2.3, arceau_largeur: 5.7, arceau_hauteur: 5.4, arceau_epaisseur: 1.6 },   // platine 3,4 × 0,8 mm ; arceau 2 × 1,9 mm, trait 0,55 mm (H-258)
    generique: { rayon: 4.6 }                          // support posé sans matériau connu
  },

  /* Convention d'état propre aux supports (v1.4.8) : à poser = demi-rempli, à déposer = plein + croix débordante,
   * à remplacer = existant + barre oblique unique. Les autres objets ponctuels gardent `etats` ci-dessus (H-261). */
  etats_support: {
    croix_depose:    { epaisseur: 1.3, debord: 2.5, couleur: '#000000' },   // 0,45 mm ; débord 0,9 mm
    barre_remplacer: { epaisseur: 1.3, debord: 2.5, couleur: '#000000' },   // H-257
    lisere_croix_ptr: 0.5                                                   // liseré blanc de la croix ME ptr à poser — 0,18 mm
  },

  /* Renforcements (combinables avec chaque type) */
  renforcements: {
    contrefiche: { longueur: 9.7, base: 7 },           // triangle accolé, pointe dans le sens de la contrefiche
    jumele:      { ecart: 0 },                         // deux symboles identiques tangents (v1.4.8, capture SIEEP-HC)
    hauban:      { longueur: 16, tete: 4.2 },          // flèche dans le sens du tirage
    portique:    { ecart: 12.4, epaisseur: 1.3 }       // deux symboles reliés par une traverse (proposition)
  },

  /* ---------- 8.4 Coffrets et bornes BT ---------- */
  /* Largeur adaptative (v13.3 §2) : le symbole s'élargit pour contenir le sigle plutôt que de laisser le texte
   * déborder ou descendre sous `taille_sigle_min` ; plafonné à `largeur_max_facteur` × la largeur nominale. */
  coffret: { largeur: 17, hauteur: 11.7, taille_sigle: 6.4, taille_sigle_min: 5.7, marge_interieure: 1.4, largeur_max_facteur: 2.5 },   // 6 × 4,1 mm ; sigle 2,25 mm, jamais sous 2 mm au 1/500

  /* ---------- 8.5 Postes et appareillage de coupure HTA ---------- */
  poste: { largeur: 26, hauteur: 17, couleur: '#E2001A', taille_sigle: 7, taille_sigle_min: 5.7, epaisseur: 1.2, marge_interieure: 1.4, largeur_max_facteur: 2.5 },   // 9,2 × 6 mm ; sigle 2,5 mm

  /* ---------- 8.6 Boîtes de jonction / dérivation ---------- */
  boite_jonction: { rx: 4.6, ry: 2.8 },              // 3,2 × 2 mm

  /* ---------- 8.7 MALT (IEC 60417-5019) ---------- */
  malt: {
    hauteur_trait: 7,            // longueur de tige par défaut (longueur_tige) — 2,5 mm
    tige_min: 2.5, tige_max: 70, // bornes de l'étirement de la tige
    largeurs: [7.8, 5.3, 2.8], ecart_barres: 1.95, epaisseur: 0.9, couleur: '#000000',
    /* v1.5.1 — couleur selon la nature de la MALT (demande du maître d'ouvrage) : MALT existante grise ; confection
     * sur la BT à la couleur de la BT à poser, sur la HTA à la couleur de la HTA à poser (voir couleurMalt()).
     * Gris : valeur propre à l'application, non normative (H-293). */
    couleur_existante: '#8C8C8C',
    /* Symbole MALT porté par un ouvrage (« + MALT ex » / « + Confection MALT ») — v1.5.2 (H-294) : la tige part du
     * CENTRE de l'ouvrage, dessinée sous lui (second plan), orientée par `angle` (degrés, 0 = vers le bas, sens horaire).
     * Longueur locale minimale = rayon de l'ouvrage + `depassement_min`, pour que les barres sortent toujours du symbole ;
     * longueur par défaut (`longueur_tige` null) = rayon + `depassement_defaut`. Pas d'orientation au stylet : 1° (15°
     * avec l'accrochage angulaire). Valeurs propres à l'application, non normatives. */
    depassement_min: 2, depassement_defaut: 5, pas_angle: 1, pas_angle_accroche: 15
  },

  /* ---------- 8.8 ERAS / RAS : petit cercle + MALT optionnelle (v12 §5.4 : la tige part du centre du rond,
   * sa longueur `attributs.longueur_tige` est indépendante de l'échelle du rond) ---------- */
  eras: { rayon: 3.4, tige_defaut: 8.8, tige_min: 2.5, tige_max: 70 },   // rond ∅ 2,4 mm

  /* ---------- 8.9 Éclairage public ---------- */
  eclairage: {
    point_lumineux: { rayon: 3.9, rayon_rayons: 6.4, nb_rayons: 8 },
    armoire:        { largeur: 17, hauteur: 11.7, taille_sigle: 6.4, taille_sigle_min: 5.7, marge_interieure: 1.4, largeur_max_facteur: 2.5 },
    /* v12 §7 — ouvrages EP posés depuis la boîte Outils (couleurs : reseaux.EP existant / a_poser) */
    lanterne:       { console: 9.7, tete_largeur: 7.4, tete_hauteur: 4.2, epaisseur: 1 },     // console horizontale + tête (trapèze)
    boucle:         { rayon: 4.6, tours: 1.5, epaisseur: 1 }                                  // boucle de câble (spirale ouverte)
  },

  /* ---------- 8.10 Étiquettes et textes ---------- */
  texte: {
    police: 'DejaVu Sans, Arial, Helvetica, sans-serif',
    couleur: '#000000',
    taille_etiquette: 7,             // désignation — 2,5 mm papier (numéros de parcelle du cadastre : 2,5 mm)
    taille_etiquette_secondaire: 6.4, // matériel associé abrégé, mention, angle — 2,25 mm
    taille_repere: 6.4,              // 2,25 mm
    interligne: 1.22,
    fond_etiquette: 'rgba(255,255,255,0.78)',
    marge_etiquette: 1.6,
    decalage_etiquette: { dx: 2.6, dy: -6.4 },  // décalage par défaut, ajouté au rayon du symbole
    largeur_max_etiquette: 110,                 // retour à la ligne automatique au-delà (unités plan ≈ 39 mm)
    /* v1.4.9 §2 (H-264) — retour à la ligne des blocs désignation / matériel : réglage par bloc `retour_ligne`
     * 'defaut' | 'auto' | 'jamais' ; 'defaut' résolu par type d'objet (linéaire = tronçon, fourreau). */
    retour_ligne_defaut: { lineaire: 'jamais', ponctuel: 'auto' },
    /* Groupes jamais coupés en retour automatique (expressions, drapeau g ajouté à l'usage). L'ordre n'importe pas :
     * les plages qui se chevauchent sont fusionnées. */
    groupes_insecables: [
      /\d+(?:[,.]\d+)?\s+(?:mm²|mm2|m²|m|cm|mm|km|kVA|daN|gr)(?![\wÀ-ÿ])/.source,   // nombre + unité : « 60 m », « 54,6 mm² »
      /[\w,.²]+(?:\s+[x×+]\s+[\w,.²]+)+/.source,                                     // « 3 x 70 + 54,6 », « 2 x 16 »
      /\S+\s+—\s+\S+(?:\s+(?:m|mm²|m²)(?![\wÀ-ÿ]))?/.source,                          // « déposer — 60 m » : le tiret reste solidaire
      /à\s+remplacer\s+par/.source,
      /à\s+(?:déposer|remplacer|reposer|poser)/.source,
      /sous\s+fourreau/.source,
      /Nu\s+[<≥]\s+22\s+mm²/.source
    ],
    interligne_materiel: 1.15,                  // interligne entre lignes de matériel associé
    /* v12 §6 — angle des supports, ligne propre sous la désignation : « φ = 45 gr » (φ U+03C6, espace insécable avant l'unité) */
    format_angle: { prefixe: '\u03C6 = ', unite: '\u00A0gr', decimales: 1, min: 0, max: 400 },
    /* v12 §3.2 — cadre et fond des blocs désignation / matériel (valeurs par défaut) */
    cadre_defaut: 'aucun',                      // aucun | rectangle | arrondi
    couleur_cadre_defaut: '#000000',
    couleur_texte_defaut: '#000000',            // couleur du texte des blocs désignation / matériel (v13.3 §3.1)
    fond_defaut: 'translucide',                 // translucide (fond_etiquette) | blanc | transparent
    epaisseur_cadre: 0.7,
    rayon_cadre: 2.8                            // rayon des angles arrondis
  },

  /* Suffixes d'état ajoutés à l'affichage de la désignation automatique (v13 §2, remplace le v10 §2.3).
   * Jamais stockés ; jamais sur une désignation manuelle. « à remplacer » : « par <désignation> » si la cible est renseignée. */
  SUFFIXES_ETAT: { existant: ' ex', a_poser: '', a_deposer: ' à déposer', a_reprendre: ' à remplacer', a_reprendre_par: ' à remplacer par ' },

  /* Désignations automatiques par défaut quand aucun attribut ne permet d'en former une (v13 §3) */
  DESIGNATIONS_DEFAUT: {
    ep_souterrain_a_poser: 'EP sous fourreau',   // tronçon EP souterrain sans section, à poser : ce qui va être réalisé
    ep_souterrain: 'EP',                         // même tronçon existant / à déposer / à remplacer : on ne sait pas s'il est sous fourreau
    eras: { BT_RESEAU: 'ERAS BT', HTA: 'ERAS HTA', BRANCHEMENT: 'RAS BRT', EP: 'RAS EP' }   // libellés d'affichage, jamais la clé BTS
  },

  /* Longueur des tronçons sur l'étiquette : « <désignation>[<suffixe d'état>][<sep><longueur> m] » (v10 §2.2, v13 §2.1) :
   * « : » pour le seul état à poser (projeté), « — » pour tout ce qui existe déjà sur le terrain. */
  SEPARATEUR_LONGUEUR: { existant: ' — ', a_reprendre: ' — ', a_poser: ' : ', a_deposer: ' — ' },
  UNITE_LONGUEUR: '\u00A0m',                  // espace insécable + unité

  /* Cartouche de repère des objets ponctuels (v10 §4.4) : cercle, fond blanc opaque, texte noir horizontal */
  cartouche: {
    rayon_min: 7.1, marge: 1.6, taille_texte: 9.9, contour: '#000000', epaisseur: 0.8, fond: '#FFFFFF',   // repère 3,5 mm (v13.3 §1)
    decalage: { dx: 5.7, dy: -5.7 },          // par défaut en haut à droite du symbole (ajouté au rayon)
    echelle_reprise_max: 2.2                  // migration v6 : une échelle de 1,2 à 2,2 compensait le repère trop petit → ramenée à 1
  },

  /* Déport d'un objet ponctuel : ligne de rappel entre l'ancrage réel et le symbole déporté (v10 §3.2) */
  deport: { ligne_rappel: { epaisseur: 0.5, tirete: [2.3, 1.6], couleur: '#000000' }, rayon_ancrage: 1 },

  /* ---------- Lot 1.2 : blocs d'étiquette réglables (v11 §2) ---------- */
  bloc_etiquette: {
    echelle_min: 0.5, echelle_max: 8, echelle_defaut: 1,   // echelle_etiquette, multiplicatif du réglage global (v12 §3.1 : ×8)
    retournement_auto: true,                                // texte jamais lu à l'envers au-delà de 90°
    seuil_lisibilite_mm: 1.8,                               // alerte (aperçu papier) sous cette hauteur de texte (v1.3.2 : 1,2 → 1,8 mm)
    alerte: { couleur: '#E2001A', epaisseur: 0.8, tirete: [2.1, 1.4] }
  },

  /* Échelle des objets linéaires (tronçons, fourreaux) : épaisseur, tiretés, pointes, écartement (v11 §3, v12 §3.1 : ×8) */
  echelle_lineaire: { min: 0.5, max: 8, defaut: 1 },
  /* Échelle des objets ponctuels, des annotations et des notes (`echelle_symbole`, poignée carrée fléchée — v12 §2.1, §3.1, §5.5) */
  echelle_symbole: { min: 0.5, max: 8, defaut: 1, pas_menu: 1.25 },

  /* Échelle du plan → tailles par défaut (facteurs appliqués aux réglages du plan, v11 §3.1) */
  /* Palier de référence : 1/500 = ×1,0 (tailles ci-dessus). Les facteurs ne descendent plus sous 0,85, sinon
   * la ligne de matériel (2,25 mm) passerait sous le seuil de lisibilité : ×0,85 la laisse à 1,9 mm. */
  ECHELLES_PLAN: [200, 500, 1000, 2000],
  ECHELLE_PLAN_DEFAUTS: {
    200:  { taille_texte: 1.25, echelle_symbole: 1.25 },
    500:  { taille_texte: 1.0, echelle_symbole: 1.0 },
    1000: { taille_texte: 0.92, echelle_symbole: 0.92 },
    2000: { taille_texte: 0.85, echelle_symbole: 0.85 }
  },

  /* ---------- Fourreaux (v11 §5) ---------- */
  fourreau: {
    ecartement: 3.9,                    // demi-écartement entre les deux lignes (× echelle_symbole)
    epaisseur: 0.7,                     // épaisseur constante des tiretés
    tirete: [5.7, 2, 2, 2],             // alternance tiret long / tiret court
    couleur: {
      TPC:   { existant: '#E85A64', a_poser: '#E2001A' },   // rouge ; v1.4.9 (H-267) : existant #E85A64 (v1.4.8 : #E08C8C)
      ACIER: { existant: '#B5B5B5', a_poser: '#666666' }    // gris
    },
    portion_min: 0.01                   // longueur minimale (fraction du développé) d'un fourreau accroché
  },

  /* ---------- Annotations de plan (v11 §6) ---------- */
  COULEURS_ANNOTATION: null,   // renseignée après la définition de CHARTE : dérivée des couleurs de réseau (v13.3 §3.2)
  annotations: {
    epaisseur_defaut: 1.2, epaisseur_min: 0.4, epaisseur_max: 7,
    fleche: { tete: 5.7, angle_deg: 28, longueur_defaut: 53 },
    nord: { longueur: 32, tete: 9, taille_texte: 8 },
    rond_texte: { rayon_min: 5.3, marge: 1.6, taille_texte: 5.7 },
    cotation: { tete: 4.6, repere: 4.2, taille_texte: 5.7, reserve: 1.4 },
    reserve_texte: { fond: '#FFFFFF', marge: 1.4, taille_texte: 5.7 },
    zone: { pas: 5.3, angle_deg: 45, opacite: 0.9, epaisseur_contour: 0.8 },
    stylo: { tolerance_px: 1.6 },         // tracé à main levée : simplification (Douglas-Peucker) en pixels écran (v12 §2.3, ex-« trait libre »)
    /* v1.4.4 §1 (H-201) : styles ['plein','pointille'] — bouton à deux états, pas de motif multiple (aucune maquette fournie).
     * Tireté proportionnel à l'épaisseur du trait (tiret ≈ ×3, espace ≈ ×2) pour rester lisible à toute échelle de zoom. */
    trait: { extremites: ['aucune', 'pointe', 'point'], tete: 5.7, rayon_point: 1.9, styles: ['plein', 'pointille'], pointille_tiret: 3, pointille_espace: 2 },   // segment rectiligne / polyligne (v12 §2.3)
    croix: { taille: 16, epaisseur: 2.1 },
    taille_texte_min: 2, taille_texte_max: 36   // bornes du réglage « taille du texte » propre aux annotations à texte (v12 §2.1)
  },

  /* ---------- Outil Dessin : masques du fond et aplats colorés (v12 §8, v13.3 §4) ----------
   * Type interne `masque` et calque `masques` inchangés (compatibilité des projets). */
  masque: {
    couleur_defaut: '#FFFFFF', opacite_defaut: 1, opacite_min: 0.1,
    opacite_surligneur: 0.35,    // mode surligneur : aplat semi-transparent posé AU-DESSUS des ouvrages
    sigle_elision: '\u2026',     // sigle tronqué quand la largeur adaptative atteint son plafond
    rayon_arrondi: 6,            // rayon d'angle du rectangle arrondi (v13.4 §2), réglable librement
    rayon_arrondi_min: 1,
    rayon_arrondi_max: 40,
    segments_ellipse: 48,        // finesse de l'ellipse rendue en polygone (écran, PNG et PDF vectoriel)
    pipette: { echantillon_px: 3 },   // moyenne d'un carré de 3 × 3 pixels : un pixel isolé tombe sur un bord antialiasé
    pinceau: { diametre_defaut: 14, diametre_min: 2, diametre_max: 105, tolerance_px: 1.2 },  // unités plan ; tracé simplifié
    contour_ecran: { couleur: '#0A84FF', epaisseur: 0.7, tirete: [2.8, 2.1] }                 // liseré affiché à l'écran seulement (sélection)
  },

  /* ---------- 9. Notes de terrain (entièrement paramétrables par note) ---------- */
  notes: {
    taille_defaut: 8,                            // 2,8 mm
    couleur_defaut: '#B00020',
    tailles: [5.5, 8, 11, 14, 19, 26],
    /* v1.4.4 §2 (H-202) : bornes de la saisie libre de taille. `taille` n'est PAS déjà pilotée par le facteur ×8
     * (c'est `echelle_symbole`, la poignée, qui multiplie ensuite séparément, cf. primitivesNote) : plafond propre
     * fixé ici, au-delà du dernier palier du menu (26), faute de borne existante à reprendre — à confirmer.
     * Pas de minimum imposé par le cahier des charges ; `taille_min` n'est qu'un garde-fou technique anti-crash. */
    taille_min: 1, taille_max: 40,
    fond: 'rgba(255,255,255,0.72)',              // fond « translucide » ; « blanc » = opaque, « aucun » = transparent (v12 §2.3)
    cadre: { couleur: '#000000', epaisseur: 0.7, marge: 2.5, rayon_arrondi: 3.2 },   // cadre : aucun | rectangle | arrondi
    fleche: { epaisseur: 0.9, tete: 4.6 }
  },

  /* ---------- Légende (objet pilotable, v13 §5) ---------- */
  legende: {
    largeur: 227, ligne: 12.4, marge: 7, taille_texte: 7, taille_titre: 9,   // 80 mm de large, texte 2,5 mm
    fond: '#FFFFFF', cadre: '#000000', epaisseur_cadre: 0.9, longueur_echantillon: 38,
    echelle_min: 0.4, echelle_max: 4, echelle_defaut: 1,        // bornes de la poignée d'échelle
    cadre_defaut: 'rectangle',                                   // aucun | rectangle | arrondi (mêmes valeurs que les étiquettes)
    couleur_cadre_defaut: '#000000',
    fond_defaut: 'blanc',                                        // translucide | blanc | transparent
    rayon_cadre: 4.4,
    marge_bord: 17                                               // distance au coin bas-droit du plan à la première pose
  },

  /* ---------- Aides à l'écran (jamais exportées) ---------- */
  ecran: {
    selection: '#0A84FF',
    survol: '#0A84FF',
    accrochage: '#00A85A',
    poignee_px: 22,          // rayon des poignées, en pixels écran (doigt)
    poignee_stylet_px: 12,
    lasso: 'rgba(10,132,255,0.15)'
  },

  /* Ordre de dessin (z) par type */
  /* Ordre de superposition : du fond vers le dessus. `surlignage` est le rang d'un dessin en mode surligneur
   * (v13.3 §4.1 bis) : au-dessus de tous les ouvrages, sous les notes de terrain. */
  ordre_z: ['image', 'masque', 'annotation', 'fourreau', 'troncon', 'malt', 'eras', 'boite_jonction', 'point_lumineux', 'boucle_ep', 'lanterne_ep', 'coffret', 'armoire_ep', 'poste', 'support', 'surlignage', 'note'],

  /* Boîtes de dialogue : délai après ouverture pendant lequel un geste sur le fond ne ferme pas la boîte (v13.4 §3).
   * Filet de sécurité contre les événements synthétiques d'Android émis juste après le geste qui a ouvert la boîte. */
  dialogues: { delai_garde_ms: 250 },

  /* Gestionnaire de projets (lot 1.4, v14 §9). */
  projets: {
    corbeille_jours: 30,               // purge définitive au démarrage au-delà de ce délai
    delai_recherche_ms: 150,           // filtrage à la frappe
    longueur_max_nom_fichier: 120,     // nom de fichier exporté, extension comprise
    duree_notification_annuler_ms: 5000,
    duree_notification_termine_ms: 4000,
    hauteur_ligne_px: 56,              // cible tactile d'une ligne de projet
    hauteur_bouton_px: 48,             // cible tactile de tout bouton du gestionnaire
    hauteur_entree_menu_px: 56,        // entrées de la feuille d'actions
    largeur_max_px: 900,               // liste centrée en paysage
    delai_appui_long_ms: 550,
    alerte_json_mo: 25
  },

  /* Plans d'un projet (v1.4.5 : PDF multi-pages, un plan par page). Valeurs applicatives, non normatives (H-210). */
  plans: {
    import_max_pages: 30,              // plafond de sécurité du nombre de pages importées en une fois (mémoire tablette)
    nom_max: 40,                       // longueur maximale d'un nom de plan
    delai_annulation_ms: 5000,         // « Annuler » après la suppression d'un plan
    hauteur_ligne_px: 56               // ligne de la liste des plans
  },

  /* Sélecteur de couleur (v13.4 §1) : le nid d'abeilles est calculé à partir de ces bornes, jamais écrit en dur.
   * 4 anneaux = 61 hexagones, qui tiennent dans une fenêtre de 380 px à 34 px de pastille (cible tactile ≥ 40 px
   * avec l'espacement) : la précision au stylet prime sur le nombre de teintes. */
  selecteur_couleur: {
    anneaux: 4,
    saturation_min: 0.22,          // saturation du premier anneau (le centre est blanc)
    assombrissement_max: 0.5,      // valeur retirée à la dernière ligne du bas
    gris_nb: 10,                   // rangée de gris, du blanc au noir
    taille_pastille_px: 34,
    largeur_fenetre_px: 380,
    recentes_max: 8                // couleurs récentes, communes à tous les usages
  },

  /* Préfixes de repère (numérotation automatique par type) */
  reperes: {
    support: 'P', coffret: 'C', poste: 'PT', boite_jonction: 'BJ', malt: 'T',
    eras: 'R', point_lumineux: 'L', armoire_ep: 'A', troncon: 'S', note: 'N', fourreau: 'F', annotation: 'D',
    lanterne_ep: 'LT', boucle_ep: 'BCL', masque: 'M', image: 'IM'
  },

  /* ---------- Plan de situation (v1.5.4, H-305) ----------
   * Fond : Plan IGN v2 (IGN Géoplateforme, WMTS « découverte » gratuit sans clé, Licence Ouverte Etalab — mention de
   * source obligatoire, incrustée dans la carte). Niveau PM par défaut 15 : la fiche affiche l'emprise réelle en mètres.
   * Rond rouge : diamètre en mm papier, fond transparent. Valeurs propres à l'application, non normatives. */
  situation: {
    url: 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    zoom_defaut: 15, zoom_min: 12, zoom_max: 18,
    largeur_px: 1200, hauteur_px: 900, qualite_jpeg: 0.9, delai_ms: 20000,
    attribution: { texte: '© IGN – Plan IGN', taille_px: 16, marge_px: 5 },
    largeur_pose_mm: 70,                                  // largeur à la pose, en mm papier (réglable ensuite)
    rond: { couleur: '#E30000', diametre_mm: 6, diametre_min_mm: 1, diametre_max_mm: 60, epaisseur_mm: 0.5 },
    cadre: { couleur: '#000000', epaisseur_mm: 0.35 }
  },

  /* ---------- Image / photo libre posée sur le plan (v1.4.6 §2) — ce n'est PAS le fond de plan ---------- */
  image: {
    cote_max_px: 2400,           // côté long ramené à 2 400 px à l'import (IndexedDB et PDF raisonnables, H-233)
    qualite_jpeg: 0.85,          // photos réencodées en JPEG ; PNG conservé en PNG (transparence)
    fraction_vue: 1 / 3,         // largeur à la pose = 1/3 de la largeur visible
    largeur_min: 3 * (72 / 25.4),   // 3 mm papier
    largeur_max: 6000,           // garde-fou (unités plan)
    opacite_min: 0.1,            // même plage que l'opacité du fond de plan (Calques)
    attente: { fond: '#EEF1F5', contour: '#9AA3AF' },   // cadre affiché à l'écran tant que l'image n'est pas chargée
    // Rognage non destructif (v1.4.7 §1) : fractions retirées g / h / d / b, au moins 5 % visibles dans chaque sens
    recadrage: { visible_min: 0.05 },
    // Mode « Rognage » (écran seulement, jamais exporté) : image entière en transparence, partie retenue encadrée
    rognage: { opacite_image_entiere: 0.35, cadre: { couleur: '#0A84FF', halo: '#FFFFFF', epaisseur_px: 1.6, tirete_px: [6, 4] } }
  },

  /* ---------- Étiquette fléchée (v1.4.6 §4) : note encadrée dont la flèche part du coin situé du côté de la pointe ---------- */
  etiquette_flechee: { pointe_mm: 9 }   // pointe initiale : 9 mm en x et en y au-delà du coin bas-droit du cadre
};

/* ---------- Palette de couleurs (texte des blocs, cadres, annotations, notes, légende, Dessin — v13.3 §3.2) ----------
 * Les teintes de réseau sont DÉRIVÉES des objets de réseau ci-dessus, jamais recopiées : corriger une couleur de
 * tracé dans `reseaux` la corrige partout, palette comprise. Ordre : neutres, puis réseaux dans l'ordre HTA → BT → BRT → EP. */
function couleurReseauCharte(domaine, etatOuvrage, pose = 'aerien') {
  const c = CHARTE.reseaux[domaine].couleur[etatOuvrage];
  return typeof c === 'string' ? c : c[pose];
}

CHARTE.COULEURS_ANNOTATION = [
  '#000000',                                        // noir
  '#6B7280',                                        // gris
  '#FFFFFF',                                        // blanc
  couleurReseauCharte('HTA', 'a_poser'),            // rouge HTA à poser
  couleurReseauCharte('HTA', 'existant'),           // marron HTA existant
  couleurReseauCharte('BTS', 'a_poser'),            // bleu BT à poser
  couleurReseauCharte('BTS', 'existant', 'aerien'), // jaune BT existant aérien
  couleurReseauCharte('BTS', 'existant', 'souterrain'), // vert BT existant souterrain
  couleurReseauCharte('BRT', 'a_poser'),            // orange fluo branchement à poser
  couleurReseauCharte('BRT', 'existant'),           // orange foncé branchement existant
  couleurReseauCharte('EP', 'a_poser'),             // rose EP à poser
  couleurReseauCharte('EP', 'existant'),            // violet EP existant
  '#1B7F3B'                                         // vert foncé (annotations, hors réseau)
].filter((c, i, t) => c && t.indexOf(c) === i);

/* Libellés des pastilles de la palette (info-bulle) : la teinte seule ne dit pas d'où elle vient. */
/* ---------- Gestionnaire de projets (lot 1.4) ---------- */
/* Type d'affaire : liste fermée, libellés du marché, définis ici seulement. */
export const TYPES_AFFAIRE = {
  AERIEN_HTA_BT: 'Aérien HTA/BT',
  SOUTERRAIN_HTA_BT: 'Souterrain HTA/BT',
  AERIEN_BT: 'Aérien BT',
  SOUTERRAIN_BT: 'Souterrain BT',
  ENFOUISSEMENT: 'Enfouissement',
  DEPLACEMENT: 'Déplacement'
};

export const LIBELLES_STATUTS = {
  en_cours: 'En cours',
  termine: 'Terminé',
  archive: 'Archivé',
  corbeille: 'Corbeille'
};

export const LIBELLES_COULEURS = {
  '#000000': 'Noir', '#6B7280': 'Gris', '#FFFFFF': 'Blanc', '#1B7F3B': 'Vert',
  [couleurReseauCharte('HTA', 'a_poser')]: 'Rouge HTA à poser',
  [couleurReseauCharte('HTA', 'existant')]: 'Marron HTA existant',
  [couleurReseauCharte('BTS', 'a_poser')]: 'Bleu BT à poser',
  [couleurReseauCharte('BTS', 'existant', 'aerien')]: 'Jaune BT existant aérien',
  [couleurReseauCharte('BTS', 'existant', 'souterrain')]: 'Vert BT existant souterrain',
  [couleurReseauCharte('BRT', 'a_poser')]: 'Orange fluo branchement à poser',
  [couleurReseauCharte('BRT', 'existant')]: 'Orange foncé branchement existant',
  [couleurReseauCharte('EP', 'a_poser')]: 'Rose EP à poser',
  [couleurReseauCharte('EP', 'existant')]: 'Violet EP existant'
};

/* Tailles par défaut (facteurs du plan) selon l'échelle du plan ; interpolation logarithmique entre paliers (v11 §3.1). */
export function defautsEchellePlan(echelle) {
  if (!echelle) return { taille_texte: 1, echelle_symbole: 1 };
  const T = CHARTE.ECHELLE_PLAN_DEFAUTS;
  if (T[echelle]) return T[echelle];
  const cles = Object.keys(T).map(Number).sort((a, b) => a - b);
  if (echelle <= cles[0]) return T[cles[0]];
  if (echelle >= cles[cles.length - 1]) return T[cles[cles.length - 1]];
  for (let i = 0; i + 1 < cles.length; i++) {
    if (echelle >= cles[i] && echelle <= cles[i + 1]) {
      const t = Math.log(echelle / cles[i]) / Math.log(cles[i + 1] / cles[i]);
      const a = T[cles[i]], b = T[cles[i + 1]];
      return { taille_texte: a.taille_texte + (b.taille_texte - a.taille_texte) * t, echelle_symbole: a.echelle_symbole + (b.echelle_symbole - a.echelle_symbole) * t };
    }
  }
  return { taille_texte: 1, echelle_symbole: 1 };
}

/* Sections « conducteurs nus » de la BT aérienne existante (v1.4.9 §6, H-268). nomenclature.json (non modifié) n'a
 * aucun article CABLE de conducteur nu BT ; il a les articles de dépose a0465 (< 22 mm²) et a0466 (≥ 22 mm²), dont le
 * seuil (≥ 22, 22 inclus) est repris tel quel. Proposées seulement en BT aérien, état existant / à déposer / à remplacer ;
 * jamais d'article de câble ni d'ajout automatique au matériel ou au métré (article_depose : aide de la fiche). */
export const SECTIONS_BT_NUS = [
  { section: 'Nu < 22 mm²', article_depose: 'a0465' },
  { section: 'Nu ≥ 22 mm²', article_depose: 'a0466' }
];
export const ETATS_SECTIONS_BT_NUS = ['existant', 'a_deposer', 'a_reprendre'];

/* Les sections « Nu » s'appliquent-elles à ce réseau / pose / état ? */
export function sectionsNusApplicables(domaine, pose, etatOuvrage) {
  return domaine === 'BTS' && pose === 'aerien' && ETATS_SECTIONS_BT_NUS.includes(etatOuvrage);
}

/* La section donnée est-elle une section « Nu » ? */
export function estSectionNu(section) {
  return SECTIONS_BT_NUS.some((e) => e.section === section);
}

/* Sections réelles regroupées dans un même article de nomenclature.json (v12 §4). Le fichier n'est pas modifié :
 * l'objet pointe toujours l'article unique (métré), `attributs.section_retenue` précise la section posée (plan). */
export const SECTIONS_DERIVEES = {
  a0292: ['3x150+70 mm²', '3x150+95 mm²'],
  a0293: ['3x240+95 mm²', '3x240+115 mm²']
};

/* Sections de câble de l'éclairage public (v1.4.6 §5). nomenclature.json n'est pas modifié : les articles existent déjà
 * (U1000 R2V cuivre a0296–a0301, sans domaine ni pose dans le fichier ; câble de branchement torsadé PCR 2 x 16 a0278,
 * domaine BRT), cette table les rattache à l'EP. Pour un tronçon EP ce sont les SEULES sections proposées ; la façade
 * reprend la liste aérienne (H-232). Libellé `section` = texte écrit sur le plan. */
export const SECTIONS_EP = {
  souterrain: [
    { section: '3 X 6 mm² cuivre', article: 'a0296' },
    { section: '5 X 6 mm² cuivre', article: 'a0297' },
    { section: '3 X 10 mm² cuivre', article: 'a0298' },
    { section: '5 X 10 mm² cuivre', article: 'a0299' },
    { section: '3 X 16 mm² cuivre', article: 'a0300' },
    { section: '4 X 25 mm² cuivre', article: 'a0301' }
  ],
  aerien: [
    { section: '2 x 16', article: 'a0278' }
  ]
};

/* Entrées de SECTIONS_EP applicables à une pose (façade = aérien ; pose inconnue = les deux listes). */
export function sectionsEpPour(pose) {
  if (pose === 'souterrain') return SECTIONS_EP.souterrain;
  if (pose === 'aerien' || pose === 'facade') return SECTIONS_EP.aerien;
  return [...SECTIONS_EP.souterrain, ...SECTIONS_EP.aerien];
}

/* Libellé d'un dessin : « Carré » / « Rond » pour un rectangle / une ellipse à proportions fixes (v1.4.6 §3). */
export function libelleMasque(o) {
  const st = o && o.sous_type;
  const fixe = !!(o && o.attributs && o.attributs.ratio_fixe);
  if (fixe && st === 'rectangle') return LIBELLES.masques.carre;
  if (fixe && st === 'ellipse') return LIBELLES.masques.rond;
  return LIBELLES.masques[st] || st;
}

/* Articles de raccordement / jonction proposés en un appui dans le matériel associé (v12 §9).
 * Ils existent déjà dans nomenclature.json (COFFRET_BT / TROUSSE_RACCORDEMENT et SUJETION_COUPURE) ; ailleurs, la recherche libre reste possible. */
export const RACCORDEMENTS_PROPOSES = {
  types: ['support', 'coffret', 'eras'],
  ids: ['a0351', 'a0352', 'a0353', 'a0354', 'a0355', 'a0356', 'a0357', 'a0358', 'a0360']
};

/* Règle MALT des ERAS d'après les attributs de nomenclature.json (v12 §5.4.3) : 'oui', 'non' ou null (non couvert). */
export function regleMaltEras(article) {
  const at = (article && article.attributs) || {};
  if (at.malt_obligatoire === true || at.domaine === 'HTA') return 'oui';
  if (at.malt_obligatoire === false || at.domaine === 'BRT' || at.domaine === 'EP') return 'non';
  return null;
}
/* Même règle appliquée au type saisi dans la fiche (ERAS posée sans article). */
export function regleMaltSousType(sous_type) {
  if (sous_type === 'BT_RESEAU' || sous_type === 'HTA') return 'oui';
  if (sous_type === 'BRANCHEMENT' || sous_type === 'EP') return 'non';
  return null;
}
/* Même règle appliquée au réseau de l'objet (bandeau du bas, menu, import — v13 §1) : 'oui' HTA, 'non' BRT / EP, null sinon. */
export function regleMaltDomaine(domaine) {
  if (domaine === 'HTA') return 'oui';
  if (domaine === 'BRT' || domaine === 'EP') return 'non';
  return null;
}
/* Correspondance réseau ↔ type d'ERAS (les deux sens : la fiche aligne le réseau sur le type, le bandeau aligne le type sur le réseau). */
export const SOUS_TYPE_ERAS_PAR_DOMAINE = { HTA: 'HTA', BRT: 'BRANCHEMENT', EP: 'EP', BTS: 'BT_RESEAU' };
export const DOMAINE_PAR_SOUS_TYPE_ERAS = { HTA: 'HTA', BRANCHEMENT: 'BRT', EP: 'EP', BT_RESEAU: 'BTS' };

/* Retourne le style de trait d'un tronçon à partir du triplet domaine + pose + état.
 * { couleur, epaisseur, tirete (tableau ou null), fluo, hachure (bool), reprendre (bool) } */
export function styleTroncon(domaine, pose, etat, couleurManuelle = null) {
  const r = CHARTE.reseaux[domaine] || CHARTE.reseaux.BTS;
  const etatBase = (etat === 'a_poser') ? 'a_poser' : 'existant';   // à déposer / à reprendre = style existant
  let couleur = r.couleur[etatBase];
  if (typeof couleur === 'object') couleur = couleur[pose] || couleur.aerien;
  const tirete = (pose === 'souterrain') ? r.tirete_souterrain : null;
  // v1.4.9 §4 : la couleur manuelle remplace la seule couleur ; tout le reste (épaisseur, tireté, hachures) reste de la charte
  const manuelle = couleurManuelleValide(couleurManuelle);
  if (manuelle) couleur = manuelle;
  return {
    couleur,
    epaisseur: r.epaisseur,
    tirete,
    fluo: besoinLisere(couleur, !!manuelle),
    hachure: etat === 'a_deposer',
    reprendre: etat === 'a_reprendre',
    manuelle: !!manuelle
  };
}

/* Couleur manuelle normalisée (#RRGGBB majuscules) ou null. */
export function couleurManuelleValide(c) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(c || '')) ? String(c).toUpperCase() : null;
}

/* Rapport de contraste WCAG d'une couleur avec le blanc (1 = aucun contraste, 21 = noir). */
export function contrasteAvecBlanc(hex) {
  const h = String(hex).replace('#', '');
  const lin = (v) => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(h.slice(0, 2)) + 0.7152 * lin(h.slice(2, 4)) + 0.0722 * lin(h.slice(4, 6));
  return 1.05 / (L + 0.05);
}

/* Liseré sombre : couleurs fluo de la charte ; pour une couleur manuelle, aussi toute teinte trop pâle sur fond blanc. */
export function besoinLisere(couleur, manuelle = false) {
  const c = String(couleur || '').toUpperCase();
  if (CHARTE.fluo.includes(c)) return true;
  return manuelle && /^#[0-9A-F]{6}$/.test(c) && contrasteAvecBlanc(c) < CHARTE.couleur_manuelle.contraste_min_lisere;
}

/* Couleur d'un fourreau selon la charte (matière × état), ou sa couleur manuelle (v1.4.9 §4, §5). */
export function couleurFourreau(o) {
  const mat = (o.attributs && (o.attributs.matiere || 'TPC')).toUpperCase() === 'ACIER' ? 'ACIER' : 'TPC';
  return couleurManuelleValide(o.couleur_manuelle) || CHARTE.fourreau.couleur[mat][o.etat === 'a_poser' ? 'a_poser' : 'existant'];
}

/* Couleur de la charte seule d'un tronçon ou d'un fourreau (pastille « Charte » de la fiche). */
export function couleurCharteLineaire(o) {
  if (o.type === 'fourreau') return couleurFourreau({ ...o, couleur_manuelle: null });
  return styleTroncon(o.domaine, o.pose, o.etat).couleur;
}

/* Couleur « de réseau » d'un objet ponctuel (boîtes de jonction, ERAS). */
export function couleurReseau(domaine, pose, etat) {
  return styleTroncon(domaine, pose || 'aerien', etat).couleur;
}

/* v1.5.1 — Catégorie d'une MALT : 'ex' (existante), 'BT' ou 'HTA' (confection). Le réseau HTA donne 'HTA', tout autre
 * réseau (BT, BRT, EP) donne 'BT' (H-293). */
export function categorieMalt(existante, domaine) {
  if (existante) return 'ex';
  return domaine === 'HTA' ? 'HTA' : 'BT';
}
export function couleurMalt(categorie) {
  if (categorie === 'ex') return CHARTE.malt.couleur_existante;
  if (categorie === 'HTA') return CHARTE.reseaux.HTA.couleur.a_poser;
  return CHARTE.reseaux.BTS.couleur.a_poser;
}
export const LIBELLES_MALT = { ex: 'MALT existante', BT: 'Confection MALT BT', HTA: 'Confection MALT HTA' };

/* Libellés affichés des réseaux : la clé interne BTS reste BTS dans les données (v10 §1.1). */
export const LIBELLES_DOMAINE = { HTA: 'HTA', BTS: 'BT', BRT: 'BRT', EP: 'EP' };

/* Libellés d'affichage */
export const LIBELLES = {
  etats: { existant: 'Existant', a_poser: 'À poser', a_deposer: 'À déposer', a_reprendre: 'À remplacer' },   // clé a_reprendre conservée
  poses: { aerien: 'Aérien', souterrain: 'Souterrain', facade: 'Façade' },
  domaines: LIBELLES_DOMAINE,
  types: {
    support: 'Support', coffret: 'Coffret / borne', poste: 'Poste / coupure HTA', boite_jonction: 'Boîte de jonction',
    malt: 'MALT', eras: 'ERAS / RAS', point_lumineux: 'Point lumineux', armoire_ep: 'Armoire EP',
    troncon: 'Tronçon', note: 'Note', fourreau: 'Fourreau', annotation: 'Annotation',
    lanterne_ep: 'Lanterne EP', boucle_ep: 'Boucle EP', masque: 'Dessin', legende: 'Légende', image: 'Image / photo'
  },
  annotations: {
    fleche: 'Flèche simple', fleche_double: 'Flèche double', fleche_texte: 'Flèche avec texte', fleche_double_texte: 'Flèche double avec texte',
    nord: 'Flèche du nord', rond_texte: 'Rond avec texte', malt_libre: 'Sigle MALT libre', cotation: 'Cotation', zone_hachuree: 'Zone hachurée',
    trait: 'Trait', stylo: 'Stylo', trait_libre: 'Stylo', croix: 'Croix d’annulation'
  },
  /* Modes de l'outil Dessin. `carre` et `rond` (v1.4.6 §3) ne sont pas des sous-types : ils posent un `rectangle` ou une
   * `ellipse` avec attributs.ratio_fixe = true (voir libelleMasque). */
  masques: { rectangle: 'Rectangle', carre: 'Carré', rectangle_arrondi: 'Rectangle arrondi', ellipse: 'Ellipse', rond: 'Rond', polygone: 'Polygone', pinceau: 'Pinceau rond' },
  dessin: { surligneur: 'Surligneur (au-dessus des ouvrages)' },
  legende: 'Légende',
  calques: { fond: 'Fond de plan', images: 'Images et photos', masques: 'Dessins et masques', existant: 'Existant', a_poser: 'À poser', a_deposer: 'À déposer', cotation: 'Cotation', annotations: 'Annotations' }
};

/* Libellés courts de la barre d'outils (v10 §5) */
export const LIBELLES_OUTILS = {
  selection: 'Sél', troncon: 'Tronç', fourreau: 'Fourr', support: 'Supp', coffret: 'Cofr', poste: 'Poste', boite_jonction: 'Bjonc',
  eras: 'Eras', malt: 'Malt', note: 'Note', gomme: 'Gomme', masque: 'Dessin', palette: 'Biblio', annotations: 'Outils'
};

/* Libellés de la liste de choix d'armement dans la fiche support (forme longue imposée, v10 §4.2).
 * Clé = id d'article de nomenclature.json. Absent de la table → libellé complet de la nomenclature. */
export const LIBELLES_FICHE = {
  a0186: 'ES 1500 (ES 54-14)',
  a0187: 'ES 2000 (ES 70-14)',
  a0189: 'EAS 1500 (EAS 54-10)',
  a0188: 'EAS 2000 (EAS 70-10)',
  a0191: 'EADS 1500 (EADS 54-10)',
  a0190: 'EADS 2000 (EADS 70-10)',
  a0192: 'Pose ferrure PTT',
  a0193: 'BT-H 61',
  a0194: 'BRTF',
  a0195: 'EAF',
  a0196: 'EADF',
  a0197: 'CRR'
};

/* Abréviations d'étiquette (plan et export uniquement). Clé = id d'article ; absent → libellé complet.
 * Les douze premières sont imposées (v10 §4.2) ; les suivantes sont proposées (voir HYPOTHESES.md, H-42). */
export const ABREVIATIONS_ETIQUETTE = {
  // Armements BT (imposés)
  a0186: 'ES 54-14', a0187: 'ES 70-14', a0189: 'EAS 54-10', a0188: 'EAS 70-10', a0191: 'EADS 54-10', a0190: 'EADS 70-10',
  a0192: 'Pose ferrure PTT', a0193: 'BT-H 61', a0194: 'BRTF', a0195: 'EAF', a0196: 'EADF', a0197: 'CRR',
  // Armements BT — accessoires
  a0198: 'Connecteurs CC faisceau', a0199: 'Protection fenêtre',
  // Armements HTA
  a0200: 'BI 70 320', a0201: 'BT 70 150', a0202: 'BP 70 680', a0203: 'TR 25 200-80', a0204: 'DITR', a0205: 'BIS 60', a0206: 'BIS 70', a0207: 'BIS 80',
  a0208: 'VR 1 50/60', a0209: 'VR 2 70/90', a0210: 'Nappe U simple', a0211: 'Triangle U simple', a0212: 'Nappe Z double', a0213: 'Triangle Z double',
  a0214: 'Nappe Y simple', a0215: 'Nappe Y double', a0216: 'Triangle Y simple', a0217: 'Triangle Y double', a0218: 'Nappe X simple', a0219: 'Nappe X double',
  a0220: 'Triangle X simple', a0221: 'Triangle X double', a0222: 'Armement suspendu',
  a0255: 'Collier CNV 180-220', a0256: 'Collier CNV J1', a0257: 'Collier CA 120-200/240', a0258: 'Isolateur rigide', a0259: 'Chaîne isol. N11', a0260: 'Chaîne isol. N16',
  a0261: 'Chaîne ancrage 2 él.', a0264: 'Parafoudre + limitor', a0265: 'Chaîne Armourlite', a0266: 'Kit ERAS', a0267: 'Lot P24 RAS', a0268: 'Lot P24 RAS zone III',
  // Coffrets et bornes BT
  a0320: 'RM300', a0321: 'RM300', a0322: 'RM450', a0323: 'RM600', a0324: 'Barres G3 6 pl.', a0325: 'Barres G3 9 pl.', a0326: 'Barres G3 12 pl.',
  a0327: 'RAC 240 G3', a0328: 'RAC 35 G3', a0329: 'BR 60M G3', a0330: 'RCP 400', a0331: '4 plots PR 240 G3',
  a0332: 'S20', a0333: 'CIBE 1', a0334: 'CIBE 2', a0335: 'C400', a0336: 'ECP-3D', a0337: 'P400', a0338: 'ECP-2D', a0339: 'P200',
  a0340: 'Socle simple S20', a0341: 'Socle double S20', a0342: 'Chapeau socle S20',
  a0343: 'Grille repiquage 35²', a0344: 'Grille étoilement 150²', a0345: 'Grille FC 150²', a0346: 'Grille FC 240² G3',
  a0347: 'Extrémité 10-35²', a0348: 'Extrémité 50-240²', a0349: 'Gaine neutre 10-35²', a0350: 'Gaine neutre 35-115²',
  // Raccordement et jonction (v12 §9 : libellés imposés ; a0357 → neutre 95 mm² du marché, voir HYPOTHESES H-88)
  a0351: 'Dériv. torsadé/torsadé DPH4', a0352: 'Racc. torsadé/nu', a0353: 'Jonct. torsadé/torsadé DPG4', a0354: 'Dériv. nu > 22/torsadé',
  a0355: 'EAJSE T 70/3x150+70', a0356: 'EAJSE T 150/3x150+70', a0357: 'EAJSE T 150/3x240+95',
  a0358: 'Racc. BT coffret exist.', a0359: 'Sujétion coupure BT', a0360: 'Racc. BT sous tension', a0361: 'Sujétion coupure HT',
  // Boîtes de jonction
  a0362: 'BJ BT', a0363: 'BJ brt', a0364: 'BJ EP', a0365: 'CC câble BT', a0366: 'BJ EP', a0367: 'BJ HTA HN 33 S 33', a0368: 'BD tangente HTA', a0369: 'CC câble HTA',
  a0370: 'Extrémité 95² RF', a0371: 'Extrémité 150² RF', a0372: 'Extrémité RF RSM', a0373: 'CSE 95²', a0374: 'CSE 150²',
  // ERAS / RAS
  a0375: 'ERAS réseau', a0376: 'PV câble EP', a0377: 'Remontée aéro-souterraine de branchement', a0378: 'ERAS HTA', a0379: 'Chemin de câble HTA', a0380: 'RAS EP',   // a0377 : libellé imposé (v12 §5.4.4)
  // MALT
  a0432: 'Reprise terre ex.', a0433: 'Prise de terre', a0434: 'Déconnecteur de terre', a0435: 'Gaine terre 1 m', a0436: 'Câblette tranchée dédiée', a0437: 'Câblette tranchée ouverte',
  a0438: 'PV terrain rocheux', a0439: 'Piquets de terre', a0440: 'Terre par forage',
  // Fourreaux
  a0441: 'TPC ∅ 40', a0442: 'TPC ∅ 63', a0443: 'TPC ∅ 110', a0444: 'TPC ∅ 160', a0445: 'Acier ∅ 100', a0446: 'Acier ∅ 150', a0447: 'TPC ∅ 90',
  // Éclairage public
  a0448: 'Câble EP tendu', a0449: 'Câble EP chevilles', a0450: 'Raccord lampe', a0451: 'S20 horloge', a0452: 'S20 différentiel', a0453: 'S17 mono', a0454: 'S17 tri',
  a0455: 'Départ mono', a0456: 'Départ tri', a0457: 'Départ mono diff.', a0458: 'Départ tri diff.', a0459: 'Dépose lampe', a0460: 'Dépose coffret EP', a0461: 'Repose coffret EP',
  a0462: 'Pose lampe récup.', a0463: 'Repose cellule EP',
  // Postes et coupure HTA
  a0392: 'H61', a0393: 'Rempl. transfo H61', a0394: 'Rempl. transfo H61 + coffret', a0395: 'Liaison transfo-coffret', a0396: 'PV coffret D 265-75', a0397: 'Rempl. coffret disj.',
  a0398: 'CB 100 kVA', a0399: 'CB 160 kVA', a0400: 'PSS-A', a0401: 'PSS-B', a0402: 'PUC 250', a0403: 'PUC 400/630', a0404: 'STB 10 OP', a0405: 'PU 1000', a0406: 'PU 1000 motorisé',
  a0409: 'RC', a0410: 'RS', a0411: 'PAC', a0412: 'CABINE HAUTE', a0413: 'H 59', a0429: 'IACM', a0430: 'AC3M', a0431: 'AC3T'
};

/* Libellés MALT sur les étiquettes (v10 §4.3 revu par v12 §5.1) :
 * - le package `regles.packages.MALT` (articles à confectionner) est condensé en « Confection MALT », quel que soit l'état de l'ouvrage porteur ;
 * - une MALT existante signalée sur un ouvrage (`attributs.malt_ex`) n'a aucun article et s'écrit « MALT ex » ;
 * - l'objet MALT (outil 8) ne porte qu'une ligne de désignation : « Confection MALT » à poser, « MALT » sinon (+ « ex » à l'affichage). */
export const MALT_CONDENSE = { confection: 'Confection MALT', existante: 'MALT ex', objet_a_poser: 'Confection MALT', objet_autre: 'MALT' };

/* Libellé d'étiquette d'une ligne de matériel associé : abréviation par id, sinon libellé complet. */
export function libelleEtiquetteMateriel(m) {
  if (m && m.ref_article && ABREVIATIONS_ETIQUETTE[m.ref_article]) return ABREVIATIONS_ETIQUETTE[m.ref_article];
  return m ? (m.libelle || '') : '';
}

/* Libellé de la liste de choix de la fiche pour un article. */
export function libelleFicheArticle(article) {
  return (article && LIBELLES_FICHE[article.id]) || (article ? article.libelle : '');
}

/* ---------- Outil Mesure (v1.4.3) ----------
 * Tailles en pixels ÉCRAN (converties en unités plan au tracé) : la mesure n'est jamais exportée.
 * Couleur du trait choisie hors des couleurs de réseau (HTA, BT, BRT, EP, fluo) pour ne pas être prise pour un ouvrage.
 * Seuils propres à l'application, NON normatifs, à valider (H-186). */
CHARTE.mesure = {
  trait: { couleur: '#0E7490', epaisseur_px: 2.5, halo_px: 6 },
  calage: { couleur: '#C2410C' },                 // repères de calibration et de contrôle (tiretés)
  point: { rayon_px: 6, rayon_actif_px: 8 },
  texte: { taille_px: 15, halo_px: 4 },
  etats: {                                        // pastille de fiabilité, toujours accompagnée de son libellé
    CALIBREE_CONTROLEE: '#1B7F3B',
    CALIBREE: '#14307D',
    NOMINALE: '#C2410C',
    AUCUNE: '#6B7280'
  },
  seuil_ecart_controle_pct: 1,      // contrôle réussi si |écart| ≤ 1 %
  seuil_ecart_echelle_pct: 5,       // information si l'échelle calibrée s'écarte de plus de 5 % de l'échelle déclarée
  longueur_min_calage_px: 200       // référence plus courte à l'écran : avertissement (non bloquant)
};

/* ---------- Types de support (v1.4.8) ----------
 * `fiche` : libellés de la liste « Matériau / type » (fiche et « remplacé par ») ; `legende` : début du libellé de légende.
 * CONSOLE et ANCRAGE n'ont pas d'article de fourniture support : ils ne portent ni hauteur, ni classe, ni effort,
 * ni renforcement. Le type d'ancrage est rangé dans `armement_ref` (articles ci-dessous). */
export const TYPES_SUPPORT = {
  fiche: {
    '': '—', BETON: 'Béton (BE)', BOIS: 'Bois (BØ)', ME_TUB: 'Métallique tubulaire (ME tub)', ME_PTR: 'Poutrelle métallique (ME ptr)',
    CONSOLE: 'Console de façade', ANCRAGE: 'Ancrage en façade'
  },
  legende: {
    BETON_D: 'Support béton classe D', BETON_E: 'Support béton classe E', BOIS: 'Support bois', ME_TUB: 'Support métallique tubulaire',
    ME_PTR: 'Poutrelle métallique', CONSOLE: 'Console de façade', ANCRAGE: 'Ancrage en façade'
  },
  renforcements_legende: { JUMELE: 'jumelé', CONTREFICHE: 'contrefiché', HAUBANE: 'haubané', PORTIQUE: 'en portique' },
  sans_caracteristiques: ['CONSOLE', 'ANCRAGE'],
  /* Types d'ancrage en façade : article de nomenclature → jeton de désignation (« Ancrage EAF »). */
  ancrages: {
    a0195: { jeton: 'EAF', domaine: 'BTS' },     // Ensemble d'ancrage simple type EAF
    a0196: { jeton: 'EADF', domaine: 'BTS' },    // Ensemble d'ancrage double type EADF
    a0286: { jeton: 'BRT', domaine: 'BRT' }      // Ancrage de branchement (queue de cochon + pince)
  }
};

/* Console ou ancrage en façade : pas de hauteur / classe / effort / renforcement. */
export function supportSansCaracteristiques(materiau) {
  return TYPES_SUPPORT.sans_caracteristiques.includes(materiau);
}

/* ---------- v1.5.0 §1 — Efforts de supports béton inférieurs à 650 daN (H-271) ----------
 * Supports anciens, EXISTANT UNIQUEMENT : plus posés, aucun article de fourniture dans nomenclature.json (non modifié).
 * Proposés pour un béton de classe D (ou sans classe) existant, à déposer ou à remplacer ; jamais pour un support à
 * poser ni pour le « remplacé par ». Indépendants de la hauteur. Clé interne de l'état « à remplacer » : a_reprendre. */
export const EFFORTS_BETON_HORS_MARCHE = { D: [250, 300, 400, 500] };
export const ETATS_EFFORTS_HORS_MARCHE = ['existant', 'a_deposer', 'a_reprendre', 'a_remplacer'];   // a_remplacer : alias du descriptif v1.5.0

/* Effort hors marché porté par un support béton (classe D ou vide) ? */
export function effortHorsMarche(a) {
  if (!a || a.materiau !== 'BETON' || (a.classe && a.classe !== 'D')) return false;
  const v = Number(a.effort_daN);
  return a.effort_daN !== null && a.effort_daN !== undefined && a.effort_daN !== '' && EFFORTS_BETON_HORS_MARCHE.D.includes(v);
}

/* ---------- v1.5.0 §2 — Descriptif des travaux (H-272 à H-290) ----------
 * Valeurs propres à l'application, NON NORMATIVES, à valider sur un export A3. Tailles en unités plan (points PDF).
 * Formats : {jeton} remplacé par sa valeur ; [ … ] = groupe facultatif, retiré en entier si l'un de ses jetons est vide
 * (même principe que la troncature des désignations : jamais de valeur supposée). */
CHARTE.descriptif = {
  titre: { taille: 3.2 * MM },                    // titres de section et deux premières lignes de l'en-tête — 3,2 mm, gras, centré
  repere: { taille: 2.8 * MM, couleur: '#E30000' },   // « S1. » — 2,8 mm, gras, rouge
  corps: { taille: 2.5 * MM },                    // lignes — 2,5 mm
  taille_min_mm: 1.8,                             // plus petite taille autorisée (seuil H-116) : borne basse de l'échelle du bloc
  interligne: 1.25,
  espace_entrees: 2 * MM,
  retrait_niveau: 4 * MM,
  marge: 3 * MM,                                  // marge intérieure du bloc
  espace_colonnes: 5 * MM,
  largeur_colonne: 90 * MM,                       // largeur par défaut d'une colonne
  largeur_min_colonne: 30 * MM,                   // garde-fou de la poignée de largeur (H-281)
  ecart_echantillon: 2 * MM,                      // entre le trait d'échantillon et le texte ; longueur du trait = celle de la légende
  echelle_max: 4, echelle_defaut: 1,
  cadre_defaut: 'rectangle', couleur_cadre_defaut: '#000000', fond_defaut: 'blanc', epaisseur_cadre: 0.9, rayon_cadre: 4.4,
  marge_bord: 17,                                 // distance au coin haut-droit de la page à la première pose
  tolerance_accrochage_mm: 3,                     // rattachement ERAS / MALT, extrémités, émergences (H-276)
  unite_lineaire: 'ml',
  memoire_tranchees: 10,                          // dernières valeurs de tranchée proposées (mémoire de la tablette)
  /* Page annexe : toujours au format A4 portrait (v1.5.1), quel que soit le format du plan. */
  annexe: { marge_mm: 10, entete: '[{affaire} — ]Descriptif[ — N°{sieep}]', ecart_entete_mm: 4, format_pt: [595.28, 841.89] },
  ecran: { depassement: '#E2001A', annexe: '#0A84FF', epaisseur_px: 2, tirete_px: [6, 4] },
  libelle_gps: 'GPS — à renseigner dans les informations de l’affaire',
  ordre_familles: ['P', 'A', 'BJ', 'S'],         // ordre par défaut des entrées « Ouvrages » (puis les autres familles)
  ordre_etats: ['existant', 'a_deposer', 'a_reprendre', 'a_poser'],
  ordre_reseaux: ['HTA', 'BTS', 'BRT', 'EP'],
  ordre_poses: ['souterrain', 'aerien', 'facade'],

  /* En-tête (§2.4) : lignes centrées, gras ; majuscules et taille de titre pour les deux premières. */
  entete: { edf: 'EDF {num_edf}', sieep: 'N°{num_sieep}', gps: 'GPS : {gps}' },

  /* Première ligne des ouvrages (§2.5). a_reprendre = « à remplacer » (clé interne). */
  formats: {
    support: {
      existant: '[{angle} - ]{designation} existant', a_poser: '[{angle} - ]Pose {designation}', a_deposer: '[{angle} - ]{designation} à déposer',
      a_reprendre: '[{angle} - ]{designation} à déposer – Pose {cible}', a_reprendre_sans_cible: '[{angle} - ]{designation} à remplacer'
    },
    coffret: {
      existant: 'Coffret[ {libelle}] existant[ - Support {nb_plages} plages]', a_poser: 'Pose coffret[ {libelle}][ - Support {nb_plages} plages]',
      a_deposer: 'Coffret[ {libelle}] à déposer', a_reprendre: 'Coffret[ {libelle}] à déposer – Pose coffret {cible}[ - Support {nb_plages} plages]',
      a_reprendre_sans_cible: 'Coffret[ {libelle}] à remplacer'
    },
    poste: {
      existant: 'Poste[ « {nom} »][ {sigle}][ {puissance} kVA] existant', a_poser: 'Pose poste[ « {nom} »][ {sigle}][ {puissance} kVA]',
      a_deposer: 'Poste[ « {nom} »][ {sigle}] à déposer', a_reprendre: 'Poste[ « {nom} »][ {sigle}] à déposer – Pose {cible}',
      a_reprendre_sans_cible: 'Poste[ « {nom} »][ {sigle}] à remplacer'
    },
    boite_jonction: {   // à remplacer : absent du cahier des charges → H-278
      existant: 'Boîte de jonction[ {reseau}][ {sections}] existante', a_poser: 'Confection 1 boîte de jonction[ {reseau}][ {sections}]',
      a_deposer: 'Boîte de jonction[ {reseau}] à déposer', a_reprendre: 'Boîte de jonction[ {reseau}][ {sections}] à remplacer'
    },
    eras: {             // à remplacer : absent du cahier des charges → H-278
      existant: 'ERAS[ {type}] existante', a_poser: 'Confection 1 ERAS[ {type}]', a_deposer: 'Dépose ERAS[ {type}] existante', a_reprendre: 'ERAS[ {type}] à remplacer'
    },
    malt: {             // seul « à poser » est fixé par le cahier des charges → H-278
      existant: 'MALT existante', a_poser: 'Confection MALT', a_deposer: 'Dépose MALT existante', a_reprendre: 'MALT à remplacer'
    },
    ep: {
      existant: '{designation} existant', a_poser: 'Pose {designation}', a_deposer: '{designation} à déposer',
      a_reprendre: '{designation} à déposer – Pose {cible}', a_reprendre_sans_cible: '{designation} à remplacer'
    },
    armement: 'Pose 1 {armement}',               // armement d'un support à poser (attribut de la fiche, H-279)
    materiel_article: 'Pose {q} {abreviation}',
    materiel_confection: 'Confection {q} {abreviation}',   // v1.5.1 : articles de `materiel.confection` (H-295)
    materiel_verbe: '{libelle}[ (×{q})]',
    materiel_libre: '[{q} ]{libelle}',
    malt_confection: 'Confection MALT',

    /* Tronçons (§2.6). {total}, {longueur}, {fourniture} portent leur unité. */
    troncon: {
      existant: '{reseau} existante[ {section}]',
      a_deposer: '{reseau} à déposer[ {section}][ = {total}][ de {debut} à {fin}]',
      a_poser_souterrain: '{reseau} à construire[ : {section}][ ({tranchee})][ de {debut} à {fin}]',
      a_poser_aerien: '{reseau} à construire[ {section}][ — Long = {total}][ de {debut} à {fin}]',
      a_reprendre: '{reseau} à remplacer[ {section}][ par {cible}][ = {total}][ de {debut} à {fin}]',
      detail: '[De {a}][ à {b}][ : {longueur}][ ({nature})]',   // v1.5.1 : revêtement unique sur toute la longueur → entre parenthèses
      nature: '{nature}[ : {longueur}]',                      // v1.5.1 : une ligne par revêtement quand il y en a plusieurs
      total: 'Linéaire total : {total}',
      fourreau: 'sous {fourreau}[ : {longueur}]',
      fourniture: 'Fourniture[ {section}] : {fourniture}',
      tranchee_commune: 'En tranchée commune',
      fourreau_seul: 'Fourreau {fourreau} {etat}[ : {longueur}]',
      incomplet: '{total} — incomplet ({n} tronçon(s) sans longueur)',
      incomplete: '{valeur} — incomplète'
    }
  },

  /* Libellé de coffret par article (§2.5), repli sur le sigle. */
  libelles_coffret: { a0320: 'REMBT 300', a0321: 'REMBT 300', a0322: 'REMBT 450', a0323: 'REMBT 600' },

  /* Abréviations de réseau propres au descriptif (§2.6, distinctes des libellés d'interface). HTA en façade : H-280. */
  reseaux: {
    HTA: { souterrain: 'HTA/S', aerien: 'HTA aérienne', facade: 'HTA aérienne' },
    BTS: { souterrain: 'BTS', aerien: 'BTA', facade: 'BT façade' },
    BRT: { souterrain: 'BRT', aerien: 'BRT', facade: 'BRT' },
    EP: { souterrain: 'EP', aerien: 'EP', facade: 'EP' }
  },
  etats_troncon: { existant: 'existante', a_deposer: 'à déposer', a_poser: 'à construire', a_reprendre: 'à remplacer' },
  etats_fourreau: { existant: 'existant', a_deposer: 'à déposer', a_poser: 'à poser', a_reprendre: 'à remplacer' },   // H-282
  types_eras: { BT_RESEAU: 'BT', HTA: 'HTA', BRANCHEMENT: 'BRT', EP: 'EP' },
  natures_terrain: { CHAUSSEE: 'Chaussée', TROTTOIR: 'Trottoir', ACCOTEMENT: 'Accotement', TERRE: 'Terre', ROCHE: 'Roche', ENROBE: 'Enrobé', BETON: 'Béton', PAVES: 'Pavés', ESPACE_VERT: 'Espace vert', RICCIATA: 'Ricciata', BICOUCHE: 'Bi-couche' },   // v1.5.2 : Ricciata, Bi-couche

  /* Matériel associé (§2.5) : verbes repris tels quels ; autre article → « Pose {q} {abréviation} ». `abreviation` :
   * 'sigle' = sigle de l'article (ES, EAS, EADS, RM300…) puis abréviation d'étiquette — conforme à la recette 5055 ;
   * 'etiquette' = abréviation d'étiquette seule (EAS 70-10) — règle littérale du §2.5 (H-279). */
  materiel: {
    verbes: ['Pose', 'Dépose', 'Repose', 'Confection', 'Sectionnement', 'Démolition'], abreviation: 'sigle',
    /* v1.5.1 (H-295) : articles écrits « Confection q … » au lieu de « Pose q … » — jonctions, dérivations, EAJSE,
     * remontées aéro-souterraines (ERAS / RAS) et boîtes de jonction ou de dérivation, d'après nomenclature.json. */
    confection: ['a0284', 'a0285', 'a0351', 'a0353', 'a0354', 'a0355', 'a0356', 'a0357', 'a0362', 'a0363', 'a0364', 'a0366', 'a0367', 'a0368', 'a0375', 'a0377', 'a0378']
  },

  /* Fourniture de câble (§2.6) — règles du maître d'ouvrage. */
  fourniture: {
    par_emergence: { BTS: 2, HTA: 5 },          // souterrain : ml ajoutés par extrémité de tronçon en émergence
    /* v1.5.1 (H-296) : BT souterraine = linéaire + 2 ml au départ + 2 ml à l'arrivée de CHAQUE tronçon tracé, que
     * l'extrémité soit une émergence ou non. Prime sur `par_emergence` pour les réseaux listés ; retirer BTS de cette
     * table rétablit la règle par émergence de la v1.5.0. HTA souterraine : inchangée (+ 5 ml par émergence). */
    par_extremite_souterrain: { BTS: 2 },
    coefficient_aerien: 1.08,                   // BT aérien, HTA aérienne : linéaire × 1,08, arrondi au mètre supérieur
    sans_majoration: ['facade'],                // façade : linéaire seul
    sans_regle: ['BRT', 'EP'],                  // aucune règle : champ à saisir, aucune alerte s'il reste vide
    /* Objets qui font sortir le câble de la tranchée. `support_avec_eras` : support portant une ERAS rattachée
     * (de type HTA pour le réseau HTA). Une boîte de jonction n'est jamais une émergence. */
    emergences: {
      BTS: { types: ['coffret', 'poste', 'armoire_ep', 'eras'], support_avec_eras: true, eras_types: null },
      HTA: { types: ['poste', 'eras'], support_avec_eras: true, eras_types: ['HTA'] }
    }
  },

  /* Alertes (pastille orange de l'éditeur, rubrique « Descriptif » de « À compléter », dialogue d'export). */
  alertes: {
    source_modifiee: 'objet source modifié depuis la saisie manuelle',
    objet_supprime: 'objet supprimé ou rattaché à un autre ouvrage',
    longueur_manquante: 'longueur non saisie sur un tronçon',
    extremite_inconnue: 'extrémité sans ouvrage repéré',
    fourniture_incomplete: 'fourniture incomplète',
    sans_repere: 'ouvrage sans repère',
    revetements: 'revêtements : somme des linéaires différente de la longueur du tronçon, ou linéaire manquant'
  }
};
