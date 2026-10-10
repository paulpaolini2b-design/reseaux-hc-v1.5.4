/* designation.js — génération et troncature des désignations de supports.
 *
 * Les formats viennent de nomenclature.json → designations_supports.formats.
 * Règle §6.3 : la désignation se construit à partir des seuls attributs
 * renseignés, elle se tronque au premier attribut manquant, elle ne se
 * complète jamais par des valeurs supposées.
 */
import { etat } from './etat.js';
import { CHARTE, LIBELLES_DOMAINE, MALT_CONDENSE, TYPES_SUPPORT } from './charte.js';
import { sectionAffichee } from './modele.js';

/* Formats de repli si la nomenclature n'en fournit pas (identiques au cahier des charges). */
const FORMATS_REPLI = {
  BETON:            { format: 'BE {hauteur}m {classe} {effort}' },
  BOIS:             { format: 'BØ {hauteur}m {classe}' },
  BOIS_JUMELE:      { format: 'BØ J 2x{hauteur}m {classe}' },
  BOIS_CONTREFICHE: { format: 'BØ CF 2x{hauteur}m Y {effort}' },
  BOIS_HAUBANE:     { format: 'BØ H {hauteur}m {classe}' },
  ME_TUB:           { format: 'ME tub {hauteur}m {effort}' },
  ME_PTR:           { format: 'ME ptr {hauteur}m {effort}' },
  // v1.4.8 : types absents de nomenclature.json → formats de repli seulement (H-258)
  CONSOLE:          { format: 'Console' },
  ANCRAGE:          { format: 'Ancrage {type}' }     // type = EAF / EADF / BRT selon armement_ref
};

function formats() {
  const n = etat.nomenclature;
  return (n && n.designations_supports && n.designations_supports.formats) || FORMATS_REPLI;
}

/* Clé de format selon matériau et renforcement. */
export function cleFormat(a) {
  if (a.materiau === 'BOIS') {
    if (a.renforcement === 'JUMELE') return 'BOIS_JUMELE';
    if (a.renforcement === 'CONTREFICHE') return 'BOIS_CONTREFICHE';
    if (a.renforcement === 'HAUBANE') return 'BOIS_HAUBANE';
    return 'BOIS';
  }
  return a.materiau || '';
}

/* Préfixe métallique proposé par défaut selon l'état (ME tub en neuf, ME ptr en existant / à déposer). */
export function materiauMetalliqueParDefaut(etatObjet) {
  return etatObjet === 'a_poser' ? 'ME_TUB' : 'ME_PTR';
}

/* Génère la désignation d'un support. Retourne '' si le matériau est inconnu. */
export function designationSupport(objet) {
  const a = objet.attributs || {};
  const cle = cleFormat(a);
  const f = formats()[cle] || FORMATS_REPLI[cle];
  if (!f) return '';
  const valeurs = {
    hauteur: (a.hauteur_m !== null && a.hauteur_m !== undefined && a.hauteur_m !== '') ? String(a.hauteur_m) : null,
    classe: a.classe ? String(a.classe) : null,
    effort: (a.effort_daN !== null && a.effort_daN !== undefined && a.effort_daN !== '') ? String(a.effort_daN) : null,
    type: (a.materiau === 'ANCRAGE' && a.armement_ref && TYPES_SUPPORT.ancrages[a.armement_ref]) ? TYPES_SUPPORT.ancrages[a.armement_ref].jeton : null
  };
  return tronquer(f.format, valeurs, objet.etat);
}

/* Applique le format en s'arrêtant au premier attribut manquant.
 * Ex. "BE {hauteur}m {classe} {effort}" avec classe absente → "BE 11m". */
export function tronquer(format, valeurs, etatObjet) {
  const jetons = format.split(' ');
  if (!jetons.some((j) => /\{/.test(j))) return format;   // format sans attribut (« Console », v1.4.8)
  const sortie = [];          // { texte, attribut: bool }
  for (const jeton of jetons) {
    const m = /\{(\w+)\}/.exec(jeton);
    if (!m) { sortie.push({ texte: jeton, attribut: false }); continue; }   // texte fixe (BE, J, CF, H, Y, tub, ptr…)
    const v = valeurs[m[1]];
    if (v === null || v === undefined || v === '') break;
    sortie.push({ texte: jeton.replace(m[0], v), attribut: true });
  }
  // Nettoyage des jetons fixes orphelins en fin ("Y" sans effort, etc.) : on retire
  // les jetons fixes qui suivent le dernier attribut renseigné, sauf le préfixe.
  let dernierAttribut = -1;
  for (let i = 0; i < sortie.length; i++) if (sortie[i].attribut) dernierAttribut = i;
  const prefixeLongueur = jetons.findIndex((j) => /\{/.test(j));   // nb de jetons de préfixe
  const coupe = Math.max(dernierAttribut + 1, prefixeLongueur);
  const res = sortie.slice(0, coupe).map((j) => j.texte);
  // Aucun attribut : le seul préfixe (« BE ») ; le suffixe d'état (« ex », « à déposer », « à remplacer par … »)
  // est ajouté à l'affichage par designationAffichee() (v13 §2), jamais stocké ici.
  void etatObjet;
  return res.join(' ');
}

/* Désignation automatique pour les autres types. */
export function designationAuto(objet) {
  const a = objet.attributs || {};
  switch (objet.type) {
    case 'support': return designationSupport(objet);
    case 'coffret': return a.sigle || '';
    case 'poste': return a.sigle ? (a.sigle + (a.puissance_kva ? ' ' + a.puissance_kva + ' kVA' : '')) : '';
    case 'armoire_ep': return a.sigle || '';
    case 'eras': return CHARTE.DESIGNATIONS_DEFAUT.eras[a.sous_type] || 'ERAS';   // libellés d'affichage (charte.js), jamais la clé BTS
    case 'malt': return objet.etat === 'a_poser' ? MALT_CONDENSE.objet_a_poser : MALT_CONDENSE.objet_autre;   // une seule ligne (v12 §5.2) ; « ex » ajouté à l'affichage
    case 'boite_jonction': {
      const s = String(a.sections || '').trim();   // sections raccordées sur la ligne de désignation : « BJ BT 150/150 » (v12 §5.5)
      return 'BJ ' + (LIBELLES_DOMAINE[objet.domaine] || objet.domaine || '') + (s ? ' ' + s : '');
    }
    case 'point_lumineux': return 'PL';
    case 'lanterne_ep': return 'Lanterne EP';
    case 'boucle_ep': return 'Boucle EP';
    case 'fourreau': {
      const n = Number(a.nombre) > 1 ? a.nombre + ' ' : '';
      return a.notation ? n + a.notation : '';
    }
    case 'troncon': {
      let s = sectionAffichee(objet);   // article à sections regroupées : la seule section retenue, jamais la forme « ou » (v12 §4)
      // Le fourreau n'a de sens qu'en souterrain : jamais affiché ni exporté en aérien / façade (v10 §2.1)
      if (a.fourreau && objet.pose === 'souterrain') s += (s ? ' ' : '') + a.fourreau;
      // EP souterrain sans section (v13 §3) : « EP sous fourreau » à poser, « EP » sinon ; la section réelle reprend la main dès qu'elle existe
      if (!s && objet.domaine === 'EP' && objet.pose === 'souterrain') return objet.etat === 'a_poser' ? CHARTE.DESIGNATIONS_DEFAUT.ep_souterrain_a_poser : CHARTE.DESIGNATIONS_DEFAUT.ep_souterrain;
      return s;
    }
    default: return '';
  }
}

/* Recalcule designation_auto d'un objet (la manuelle reste prioritaire). */
export function actualiserDesignation(objet) {
  objet.designation_auto = designationAuto(objet);
  return objet.designation_auto;
}
