/* ui/barre-outils.js — barre d'outils latérale, annuler/rétablir permanents,
 * sélecteur réseau + pose + état avec aperçu du style, boutons de la barre haute.
 */
import { etat, emettre, sur, notifier, objets, selectionner } from '../etat.js';
import { CHARTE, LIBELLES, LIBELLES_OUTILS, styleTroncon } from '../charte.js';
import * as outils from '../outils.js';
import { annuler, retablir, infos } from '../historique.js';
import { ajuster } from '../vue.js';
import { ouvrirPalette, basculerPalette } from './palette.js';
import { basculerOutils } from './outils-annotation.js';
import { ouvrirDialogue, message } from './dialogues.js';
import { echantillonMasque } from '../symboles.js';
import { boite } from '../primitives.js';
import { primVersSvg } from '../rendu-svg.js';
import { ouvrirSelecteurCouleur } from './selecteur-couleur.js';

const NS = 'http://www.w3.org/2000/svg';

export function initialiserBarreOutils() {
  const cont = document.getElementById('outils-principaux');
  cont.innerHTML = '';
  for (const o of outils.OUTILS) {
    const b = document.createElement('button');
    b.className = 'btn-outil';
    b.dataset.outil = o.id;
    b.title = o.libelle + (o.touche ? ' (' + o.touche + ')' : ' (X)');
    b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${o.icone}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="libelle-outil">${LIBELLES_OUTILS[o.id] || o.libelle}</span>${o.touche ? `<span class="touche">${o.touche}</span>` : ''}`;
    b.addEventListener('click', () => {
      if (o.id === 'support' || o.id === 'coffret' || o.id === 'poste') {
        // Un second appui sur l'outil ouvre la palette filtrée sur sa catégorie
        if (etat.outil === o.id) { ouvrirPalette({ categorie: { support: 'SUPPORT', coffret: 'COFFRET_BT', poste: 'POSTE' }[o.id] }); return; }
      }
      outils.definirOutil(o.id);
    });
    cont.appendChild(b);
  }
  const bPalette = document.createElement('button');
  bPalette.className = 'btn-outil btn-palette';
  bPalette.title = 'Bibliothèque de symboles (nomenclature)';
  bPalette.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg><span class="libelle-outil">${LIBELLES_OUTILS.palette}</span>`;
  bPalette.addEventListener('click', () => basculerPalette());
  cont.appendChild(bPalette);
  const bOutils = document.createElement('button');
  bOutils.className = 'btn-outil btn-annotations';
  bOutils.dataset.outil = 'annotation';
  bOutils.title = 'Outils de dessin (annotations de plan)';
  bOutils.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 20l4-1 10-10-3-3L5 16zM14 6l3 3M4 4l3 0M4 8h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span class="libelle-outil">${LIBELLES_OUTILS.annotations}</span>`;
  bOutils.addEventListener('click', () => { basculerOutils(); });
  cont.appendChild(bOutils);
  // v1.4.9 §3.3 : bascule pose continue / pose unique (préférence de la tablette, touche P)
  const bPose = document.createElement('button');
  bPose.className = 'btn-outil btn-mode-pose';
  bPose.id = 'btn-mode-pose';
  bPose.addEventListener('click', () => outils.basculerModePose());
  cont.appendChild(bPose);
  majModePose();
  sur('mode-pose', majModePose);

  // Outil Dessin : réglages courants initialisés depuis la charte, couleur et surligneur repris des préférences (v12 §8, v13.3 §4)
  etat.masque = {
    mode: 'rectangle',
    diametre: CHARTE.masque.pinceau.diametre_defaut,
    rayon: CHARTE.masque.rayon_arrondi,           // rayon d'angle du rectangle arrondi (v13.4 §2), réglable librement
    couleur: etat.prefs.couleur_dessin || CHARTE.masque.couleur_defaut,
    opacite: etat.prefs.surligneur ? CHARTE.masque.opacite_surligneur : CHARTE.masque.opacite_defaut,
    surligneur: !!etat.prefs.surligneur,
    opacite_manuelle: false        // true dès que l'opacité est réglée à la main : la bascule surligneur ne la touche plus
  };
  sur('couleur-outil', (c) => { if (/^#[0-9A-Fa-f]{6}$/.test(c || '')) { etat.masque.couleur = c.toUpperCase(); etat.prefs.couleur_dessin = etat.masque.couleur; majOptionsOutil(); } });
  sur('pipette', () => majOptionsOutil());
  // v1.4.7 : pendant le rognage, Annuler / Rétablir annulent le rognage sans toucher à l'historique
  document.getElementById('btn-annuler').addEventListener('click', () => { if (outils.annulerRognage()) { notifier('Rognage annulé'); return; } annuler(); });
  document.getElementById('btn-retablir').addEventListener('click', () => { if (outils.annulerRognage()) { notifier('Rognage annulé'); return; } retablir(); });
  sur('historique', majHistorique);
  sur('outil', majOutil);
  sur('projet-ouvert', () => { majHistorique(infos()); majOutil(); });
  sur('plan-change', () => majHistorique(infos()));   // v1.4.5 : historique propre au plan affiché
  majOutil();
  initialiserSelecteur();

  document.getElementById('btn-etiquettes').addEventListener('click', basculerEtiquettes);
  sur('basculer-etiquettes', basculerEtiquettes);
  document.getElementById('btn-papier').addEventListener('click', basculerPapier);
  document.getElementById('btn-aide').addEventListener('click', ouvrirAide);
  sur('ouvrir-aide', ouvrirAide);
  sur('tout-selectionner', () => selectionner(objets().map((o) => o.id)));
}

/* Icône et infobulle du bouton de mode de pose (v1.4.9 §3.3). */
const ICONES_MODE_POSE = {
  continu: 'M4 7h4v4H4zM10 7h4v4h-4zM16 7h4v4h-4zM4 16h16M17 13l3 3-3 3',   // pose en série
  unique: 'M5 6h6v6H5zM13 14l7 3-3 1-1 3z'                                   // une pose, puis sélection
};
function majModePose() {
  const b = document.getElementById('btn-mode-pose');
  if (!b) return;
  const m = outils.modePose();
  b.dataset.mode = m;
  b.title = (m === 'unique' ? 'Pose unique — sélection et fiche après chaque pose' : 'Pose continue — l’outil reste actif') + ' (P)';
  b.setAttribute('aria-pressed', String(m === 'unique'));
  b.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONES_MODE_POSE[m]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg><span class="libelle-outil">${m === 'unique' ? 'Pose 1' : 'Pose ∞'}</span><span class="touche">P</span>`;
}

function majHistorique(i) {
  document.getElementById('btn-annuler').disabled = !i.peutAnnuler;
  document.getElementById('btn-retablir').disabled = !i.peutRetablir;
}

function majOutil() {
  document.querySelectorAll('#outils-principaux .btn-outil').forEach((b) => {
    b.classList.toggle('actif', b.dataset.outil === etat.outil || (b.dataset.outil === 'annotation' && ['lanterne_ep', 'boucle_ep'].includes(etat.outil)));
  });
  const zone = document.getElementById('zone-plan');
  zone.dataset.outil = etat.outil;
  majOptionsOutil();
}

const AIDES_MASQUE = {
  rectangle: 'Glissez au stylet d’un coin à l’autre',
  rectangle_arrondi: 'Glissez d’un coin à l’autre ; rayon d’angle réglable ci-contre',
  carre: 'Glissez d’un coin à l’autre : carré parfait, proportions conservées ensuite',
  rond: 'Glissez d’un coin à l’autre : cercle parfait, proportions conservées ensuite',
  ellipse: 'Glissez d’un coin à l’autre de la boîte ; Maj ou accrochage angulaire = cercle',
  polygone: 'Un appui par sommet, appui sur le premier pour fermer',
  pinceau: 'Glissez au stylet : une bande du diamètre choisi'
};

/* ---------- Barre d'options de l'outil courant (Dessin : mode, diamètre du pinceau, couleur, pipette, opacité,
 * surligneur ; Trait : style — v1.4.4 §1, seul réglage vivant en direct, épaisseur et extrémités restant en fiche) ---------- */
let styleTraitCourant = CHARTE.annotations.trait.styles[0];   // reprise à la prochaine sélection de l'outil, comme la couleur (outils-annotation.js)

function majOptionsOutil() {
  const z = document.getElementById('options-outil');
  if (!z) return;
  const outilTrait = etat.outil === 'annotation' && etat.preset && etat.preset.sous_type === 'trait';
  if (etat.outil !== 'masque' && !outilTrait) { z.hidden = true; z.innerHTML = ''; return; }
  z.hidden = false;
  if (outilTrait) { majOptionsTrait(z); return; }
  const M = CHARTE.masque, m = etat.masque;
  z.innerHTML = `
    <span class="titre-options">Dessin</span>
    <div class="groupe modes-masque">${Object.entries(LIBELLES.masques).map(([k, l]) => `<button class="chip petit ${m.mode === k ? 'actif' : ''}" data-mode="${k}" title="${l}"><span class="apercu-masque"></span>${l}</button>`).join('')}</div>
    <label class="reglette ${m.mode === 'pinceau' ? '' : 'inactif'}">Ø <input type="range" id="masque-diametre" min="${M.pinceau.diametre_min}" max="${M.pinceau.diametre_max}" step="1" value="${m.diametre}" ${m.mode === 'pinceau' ? '' : 'disabled'}><span id="masque-diametre-val">${m.diametre}</span></label>
    <label class="reglette ${m.mode === 'rectangle_arrondi' ? '' : 'inactif'}">Rayon <input type="range" id="masque-rayon" min="${M.rayon_arrondi_min}" max="${M.rayon_arrondi_max}" step="0.5" value="${m.rayon}" ${m.mode === 'rectangle_arrondi' ? '' : 'disabled'}><span id="masque-rayon-val">${m.rayon}</span></label>
    <span class="reglette">Couleur <button type="button" class="pastille grande" id="masque-couleur" style="background:${m.couleur}" title="Couleur du dessin (blanc par défaut : masquage) — ${m.couleur}"></button></span>
    <button class="chip petit ${outils.pipetteArmee() ? 'actif' : ''}" id="masque-pipette" title="Pipette : prélever la couleur d'un ouvrage ou du fond de plan">⌖ Pipette</button>
    <label class="reglette">Opacité <input type="range" id="masque-opacite" min="${M.opacite_min}" max="1" step="0.05" value="${m.opacite}"><span id="masque-opacite-val">${Math.round(m.opacite * 100)} %</span></label>
    <label class="case petit"><input type="checkbox" id="masque-surligneur" ${m.surligneur ? 'checked' : ''}> ${LIBELLES.dessin.surligneur}</label>
    <span class="aide-options">${m.surligneur ? 'Surlignage : aplat semi-transparent posé au-dessus des ouvrages' : AIDES_MASQUE[m.mode]}</span>`;
  z.querySelectorAll('[data-mode]').forEach((b) => {
    const ap = b.querySelector('.apercu-masque');
    const prims = echantillonMasque(b.dataset.mode);
    const bb = boite(prims) || { x: -12, y: -8, l: 24, h: 16 };
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `${bb.x - 2} ${bb.y - 2} ${bb.l + 4} ${bb.h + 4}`);
    for (const p of prims) { const e = primVersSvg(p); if (e) { if (e.tagName === 'path' && b.dataset.mode !== 'pinceau') e.setAttribute('stroke', '#6B7280'); e.setAttribute('stroke-width', b.dataset.mode === 'pinceau' ? p.epaisseur : 0.6); svg.appendChild(e); } }
    ap.appendChild(svg);
    b.addEventListener('click', () => { m.mode = b.dataset.mode; majOptionsOutil(); });
  });
  z.querySelector('#masque-diametre').addEventListener('input', (e) => { m.diametre = Number(e.target.value); z.querySelector('#masque-diametre-val').textContent = m.diametre; });
  z.querySelector('#masque-rayon').addEventListener('input', (e) => { m.rayon = Number(e.target.value); z.querySelector('#masque-rayon-val').textContent = m.rayon; });
  // Sélecteur unique de l'application (v13.4) : plus aucun <input type="color">, donc plus de panneau natif Android
  z.querySelector('#masque-couleur').addEventListener('click', () => ouvrirSelecteurCouleur({
    valeur: m.couleur, avecPipette: true, titre: 'Couleur du dessin',
    surChoix: (c) => { m.couleur = c; etat.prefs.couleur_dessin = c; majOptionsOutil(); }
  }));
  z.querySelector('#masque-opacite').addEventListener('input', (e) => { m.opacite = Number(e.target.value); m.opacite_manuelle = true; z.querySelector('#masque-opacite-val').textContent = Math.round(m.opacite * 100) + ' %'; });
  z.querySelector('#masque-pipette').addEventListener('click', () => { if (outils.pipetteArmee()) outils.annulerPipette(); else outils.armerPipette(); majOptionsOutil(); });
  z.querySelector('#masque-surligneur').addEventListener('change', (e) => {
    m.surligneur = e.target.checked;
    etat.prefs.surligneur = m.surligneur;
    // opacité par défaut du surlignage, sauf si l'utilisateur l'a réglée à la main
    if (!m.opacite_manuelle) m.opacite = m.surligneur ? CHARTE.masque.opacite_surligneur : CHARTE.masque.opacite_defaut;
    // le pinceau rond est la forme utile pour surligner un tracé
    if (m.surligneur && m.mode !== 'pinceau') m.mode = 'pinceau';
    majOptionsOutil();
  });
}

/* Style du Trait (plein / pointillé) pendant le tracé : bouton à deux états, comme prévu au cahier ; épaisseur et
 * extrémités restent réglées uniquement dans la fiche, comme aujourd'hui (aucun autre réglage de l'outil Trait
 * n'a de barre d'options en v1.4.3 — non-régression : rien d'autre n'est ajouté ici). */
function majOptionsTrait(z) {
  if (etat.preset.style === undefined) etat.preset.style = styleTraitCourant;
  const LIB = { plein: 'Plein', pointille: 'Pointillé' };
  z.innerHTML = `
    <span class="titre-options">Trait</span>
    <div class="groupe">${CHARTE.annotations.trait.styles.map((s) => `<button class="chip petit ${etat.preset.style === s ? 'actif' : ''}" data-style="${s}">${LIB[s] || s}</button>`).join('')}</div>
    <span class="aide-options">Épaisseur et extrémités : dans la fiche de l’objet une fois posé</span>`;
  z.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => {
    etat.preset.style = styleTraitCourant = b.dataset.style;
    majOptionsOutil();
  }));
}

/* ---------- Sélecteur réseau / pose / état ---------- */
function initialiserSelecteur() {
  const dom = document.getElementById('sel-domaine');
  const pose = document.getElementById('sel-pose');
  const et = document.getElementById('sel-etat');
  for (const [k, l] of Object.entries(LIBELLES.domaines)) dom.appendChild(chip(k, l, 'domaine'));
  for (const [k, l] of Object.entries(LIBELLES.poses)) pose.appendChild(chip(k, l, 'pose'));
  for (const [k, l] of Object.entries(LIBELLES.etats)) et.appendChild(chip(k, l, 'etat'));
  majSelecteur();
  sur('courant', majSelecteur);
}

function chip(valeur, libelle, groupe) {
  const b = document.createElement('button');
  b.className = 'chip chip-' + groupe;
  b.dataset.valeur = valeur;
  b.textContent = libelle;
  b.addEventListener('click', () => {
    etat.courant[groupe] = valeur;
    emettre('courant', etat.courant);
    // Appliquer immédiatement à la sélection si elle existe (pas pour les notes)
    const sel = objets().filter((o) => etat.selection.has(o.id) && o.type !== 'note' && o.type !== 'image');
    if (sel.length) outils.modifierSelection({ [groupe]: valeur });
  });
  return b;
}

function majSelecteur() {
  for (const groupe of ['domaine', 'pose', 'etat']) {
    document.querySelectorAll('.chip-' + groupe).forEach((b) => {
      b.classList.toggle('actif', b.dataset.valeur === etat.courant[groupe]);
      if (groupe === 'domaine') b.style.setProperty('--couleur', styleTroncon(b.dataset.valeur, etat.courant.pose, etat.courant.etat).couleur);
    });
  }
  const s = styleTroncon(etat.courant.domaine, etat.courant.pose, etat.courant.etat);
  const svg = document.getElementById('apercu-style');
  svg.innerHTML = '';
  const mk = (attrs) => { const e = document.createElementNS(NS, 'line'); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const ech = 2.2;   // agrandissement pour l'aperçu
  if (s.fluo) svg.appendChild(mk({ x1: 6, y1: 12, x2: 114, y2: 12, stroke: CHARTE.lisere.couleur, 'stroke-width': (s.epaisseur + CHARTE.lisere.surepaisseur) * ech, 'stroke-dasharray': s.tirete ? s.tirete.map((v) => v * ech).join(' ') : '' }));
  svg.appendChild(mk({ x1: 6, y1: 12, x2: 114, y2: 12, stroke: s.couleur, 'stroke-width': s.epaisseur * ech, 'stroke-dasharray': s.tirete ? s.tirete.map((v) => v * ech).join(' ') : '', 'stroke-linecap': 'round' }));
  if (s.hachure) for (let x = 10; x < 114; x += CHARTE.hachures_troncon.pas * ech) svg.appendChild(mk({ x1: x - 3, y1: 17, x2: x + 3, y2: 7, stroke: '#000', 'stroke-width': 1.2 }));
  if (s.reprendre) svg.appendChild(mk({ x1: 6, y1: 12, x2: 114, y2: 12, stroke: '#000', 'stroke-width': 1, 'stroke-dasharray': '2.5 5' }));
}

function basculerEtiquettes() {
  etat.etiquettesVisibles = !etat.etiquettesVisibles;
  document.getElementById('btn-etiquettes').setAttribute('aria-pressed', String(etat.etiquettesVisibles));
  emettre('reglages');
}

function basculerPapier() {
  etat.modePapier = !etat.modePapier;
  document.getElementById('app').classList.toggle('mode-papier', etat.modePapier);
  document.getElementById('btn-papier').setAttribute('aria-pressed', String(etat.modePapier));
  emettre('fermer-panneaux');
  emettre('reglages');
  if (etat.modePapier) { ajuster(); notifier('Aperçu rendu papier — appuyez à nouveau pour revenir à l’édition'); }
}

function ouvrirAide() {
  ouvrirDialogue('dlg-aide', `
    <form method="dialog" class="dialogue aide">
      <h2>Aide</h2>
      <h3>Stylet et doigt</h3>
      <ul>
        <li>Le stylet dessine, sélectionne et déplace ; le doigt fait glisser le plan, deux doigts zooment.</li>
        <li>Un appui bref pose l'objet de l'outil courant ; glisser en posant oriente le symbole.</li>
        <li>Mode de pose (bouton « Pose ∞ / Pose 1 » de la barre de gauche, touche P) : <strong>continue</strong>, l'outil reste actif et chaque appui pose un nouvel objet ; <strong>unique</strong>, après chaque pose (ouvrage, tronçon terminé, fourreau, annotation ponctuelle) l'application repasse en Sélection, sélectionne l'objet et ouvre sa fiche. Notes, dessins et gomme ne changent pas. Réglage propre à la tablette, conservé.</li>
        <li>Étiquettes : « Retour à la ligne » de la fiche (ou appui long sur le bloc) — par défaut sur une ligne pour les tronçons et fourreaux, automatique pour les autres ouvrages ; en automatique, « 60 m », « 3 x 70 + 54,6 », « — 60 m », « à déposer » ne sont jamais coupés.</li>
        <li>Couleur du tracé d'un tronçon ou d'un fourreau : fiche, section Avancé, en cas de besoin seulement (la charte reste la règle ; hors légende).</li>
        <li>Appui long : menu contextuel. Double appui au doigt : ajuster le plan à l'écran.</li>
        <li>Bouton latéral du stylet enfoncé : gomme (les objets touchés sont supprimés).</li>
        <li>Tronçon : un appui par sommet ; appui sur le dernier sommet, Entrée ou double appui pour terminer ; Échap abandonne.</li>
        <li>Fourreau (0) : un appui sur un tronçon tracé, un second sur le même tracé = fourreau accroché (poignées vertes glissantes, il suit le tronçon). Hors tronçon : fourreau seul tracé comme un tronçon.</li>
        <li>Blocs d'étiquette (désignation, matériel, cartouche) : point bleu = déplacer, rond = tourner (A : 0/45/90°, Maj : pas de 15°), carré flèche = échelle. Appui long sur des poignées superposées : fait défiler la poignée active.</li>
        <li>Boîte Outils : flèches (simple, double, avec texte, double avec texte), nord, rond à texte, MALT libre, cotation, zone hachurée, trait rectiligne (deux appuis, prolongeable, A = 0/45/90°), stylo (main levée), croix — annotations hors nomenclature et hors métré ; lanterne EP et boucle EP — ouvrages du réseau EP comptés au métré.</li>
        <li>Dessin : masque une zone du fond de plan sans le modifier, ou pose un aplat coloré — rectangle (glisser), polygone (appuis), pinceau rond (glisser, diamètre réglable). Pipette pour reprendre la couleur d'un ouvrage ou du fond. Case « Surligneur » : l'aplat passe au-dessus des ouvrages, en semi-transparent. Calque « Dessins et masques » pour tout réafficher. Jamais au métré ni en légende.</li>
        <li>Objet sélectionné : poignée ronde = rotation, croix = déport du symbole (ligne de rappel vers l'ancrage), carré fléché = taille du symbole (ponctuels, annotations, notes), carrés = sommets, point bleu = insérer un sommet, déplacer l'étiquette ou le cartouche de repère ; losange au pied d'une MALT ou d'une ERAS = étirer la tige ; croix rouge sur le cartouche = le masquer.</li>
        <li>MALT sur un ouvrage : « + MALT ex » (existante, aucun article) ou « + Confection MALT » (articles du package), dans la fiche et le menu contextuel.</li>
        <li>Désignations : l'état suit la désignation automatique — « ex » (existant), « à déposer », « à remplacer par … » (ou « à remplacer » tant que la cible n'est pas renseignée dans la fiche) ; rien pour un ouvrage à poser. La longueur d'un tronçon suit : « : » pour l'à poser (« 3x150+70 : 85 m »), « — » pour tout ce qui existe (« 3x70+54,6 ex — 30 m », « … à déposer — 30 m »).</li>
        <li>Réseau changé depuis le bandeau du bas sur une sélection : la MALT des ERAS suit la règle (jamais sur BRT / EP) ; une MALT cochée à la main est conservée et signalée « à compléter », comme un article devenu incompatible avec le nouveau réseau.</li>
        <li>Mesure (M) : distance sur plan, indicative. Un appui par point ; appui sur le dernier point, Entrée ou double appui pour terminer ; glisser un point pour l'ajuster (flèches : 1 px, Maj : 10 px) ; Retour arrière retire le dernier point ; Échap efface. « Calibrer » : deux repères de distance connue (cote, barre d'échelle) puis la distance réelle ; « Contrôler » : une seconde distance connue, écart affiché. Sans calibration, un PDF à échelle déclarée donne une estimation non vérifiée ; une photo ne donne rien. Distance horizontale : hors dénivelé, remontées et réserves de câble. La longueur des tronçons reste saisie dans leur fiche.</li>
        <li>Image ou photo : « Rogner » (fiche), « Rogner l'image » (appui long) ou touche C. L'image entière apparaît en transparence ; glisser une barre rogne un côté, une équerre deux côtés, l'intérieur de la partie retenue la déplace sur l'image (5 % au moins restent visibles). « Valider le rognage », Entrée ou un appui hors de l'image : une seule étape Annuler. « Annuler » ou Échap : rien n'est changé. Le fichier n'est jamais modifié : « Réinitialiser le rognage » (fiche) rend l'image entière.</li>
        <li>Légende : croix sur la légende (survol ou sélection) pour la masquer ; objet « Légende » de la boîte Outils pour la reposer ; poignée carrée pour la taille, appui long pour le cadre et le fond.</li>
        <li>Plans : un PDF de plusieurs pages donne un plan par page (toutes les pages, ou celles choisies à l'import) ; le fichier n'est stocké qu'une fois. Chaque plan a ses objets, sa légende, sa vue, sa calibration de mesure et son historique Annuler / Rétablir ; repères, calques, réglages et échelle sont communs. ‹ › en bas à droite (ou Page préc. / Page suiv.) pour changer de plan ; appui sur le nom pour la liste : renommer, supprimer, ajouter un plan. L'export PDF sort tous les plans, une page par plan ; le PNG, le plan affiché. Projet d'une version antérieure : « Répartir les pages en plans » (Calques ou Fond de plan).</li>
      </ul>
      <h3>Clavier</h3>
      <table>
        <tr><td>1 … 9</td><td>outils (sélection, tronçon, support, coffret, poste, boîte de jonction, ERAS, MALT, note)</td></tr>
        <tr><td>0</td><td>fourreau</td></tr>
        <tr><td>Maj + / Maj −</td><td>échelle du bloc d'étiquette actif (sinon de la sélection)</td></tr>
        <tr><td>X</td><td>gomme</td></tr>
        <tr><td>P</td><td>pose continue / pose unique (sélection et fiche après chaque pose)</td></tr>
        <tr><td>M</td><td>mesure (distance sur plan, indicative)</td></tr>
        <tr><td>C</td><td>rogner l'image sélectionnée (Entrée valide, Échap annule)</td></tr>
        <tr><td>Ctrl+Z / Ctrl+Y</td><td>annuler / rétablir</td></tr>
        <tr><td>Ctrl+S</td><td>sauvegarder (la sauvegarde est de toute façon automatique)</td></tr>
        <tr><td>Ctrl+D</td><td>dupliquer la sélection</td></tr>
        <tr><td>Suppr</td><td>supprimer la sélection</td></tr>
        <tr><td>Échap</td><td>abandonner le tracé en cours, désélectionner, fermer un panneau</td></tr>
        <tr><td>Entrée</td><td>terminer le tracé, ou ouvrir la fiche de l'objet sélectionné</td></tr>
        <tr><td>F</td><td>fiche de l'objet sélectionné</td></tr>
        <tr><td>Ctrl+0, + / -</td><td>ajuster, zoomer</td></tr>
        <tr><td>Flèches (Maj = ×10)</td><td>déplacement fin de la sélection</td></tr>
        <tr><td>R / Maj+R</td><td>rotation de 90° / -90° (du bloc d'étiquette actif, sinon de l'objet)</td></tr>
        <tr><td>E</td><td>masquer / afficher toutes les étiquettes</td></tr>
        <tr><td>A</td><td>accrochage angulaire 0° / 45° / 90°</td></tr>
        <tr><td>Tab, Ctrl+Entrée</td><td>dans une fiche : champ suivant, valider</td></tr>
        <tr><td>Page préc. / Page suiv.</td><td>plan précédent / suivant (projet de plusieurs plans)</td></tr>
        <tr><td>?</td><td>cette aide</td></tr>
      </table>
      <div class="boutons"><button type="submit" class="btn btn-primaire">Fermer</button></div>
    </form>`);
}

export { message };
