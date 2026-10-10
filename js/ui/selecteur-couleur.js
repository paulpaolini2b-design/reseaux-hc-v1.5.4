/* ui/selecteur-couleur.js — sélecteur de couleur unique de l'application (v13.4 §1).
 *
 * Remplace trois choses : le sélecteur natif d'Android (ouvert par les <input type="color">, hors charte et sans
 * accès aux couleurs de réseau), la rangée de pastilles + champ HEX des fiches, et la palette à sept teintes de
 * l'éditeur de note.
 *
 * Fenêtre modale centrée (<dialog id="dlg-couleur">), deux vues :
 *   « Couleurs »      — couleurs du marché (teintes de réseau), récentes, nid d'abeilles hexagonal, gris ;
 *                       un appui sur une pastille applique et ferme, sans bouton Valider.
 *   « Personnalisé »  — carré teinte × saturation, barre de luminosité, champs RVB et Hex ; validation explicite.
 *
 * La grille hexagonale est CALCULÉE (charte.selecteur_couleur) et non écrite en dur : changer le nombre d'anneaux
 * ou les plages de saturation suffit à la refaire.
 */
import { CHARTE, LIBELLES_COULEURS } from '../charte.js';
import { etat } from '../etat.js';
import { bd } from '../bd.js';
import { echapper } from './dialogues.js';

/* ---------- Conversions ---------- */
export function hexValide(c) { return /^#[0-9A-Fa-f]{6}$/.test(String(c || '')); }

export function hexVersRvb(c) {
  const v = parseInt(String(c).slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rvbVersHex(r, g, b) {
  const n = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0').toUpperCase();
  return '#' + n(r) + n(g) + n(b);
}

/* TSV (0–360, 0–1, 0–1) → HEX */
export function tsvVersHex(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rvbVersHex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
}

/* TSL (0–360, 0–1, 0–1) → HEX — utilisé par la vue « Personnalisé » (teinte × saturation + barre de luminosité) */
export function tslVersHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rvbVersHex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
}

/* HEX → TSL, pour placer les curseurs sur une couleur saisie au clavier */
export function hexVersTsl(hex) {
  const { r, g, b } = hexVersRvb(hex);
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(1, s)), l: Math.max(0, Math.min(1, l)) };
}

/* ---------- Couleurs récentes (communes à tous les usages : dessin, notes, blocs, annotations) ---------- */
export function couleursRecentes() {
  return (etat.prefs.couleurs_recentes || []).filter(hexValide);
}

async function memoriserRecente(c) {
  if (!hexValide(c)) return;
  const K = CHARTE.selecteur_couleur;
  const l = [c.toUpperCase(), ...couleursRecentes().filter((x) => x.toUpperCase() !== c.toUpperCase())].slice(0, K.recentes_max);
  etat.prefs.couleurs_recentes = l;
  try { await bd.put('prefs', { cle: 'couleurs_recentes', valeur: l }); } catch (e) { /* mémoire seule si la base refuse */ }
}

/* ---------- Nid d'abeilles ---------- */
/* Grille hexagonale en coordonnées axiales : chaque cellule à distance `d` du centre porte la teinte de son angle,
 * saturée proportionnellement à `d`, assombrie selon sa hauteur dans la grille. Le centre est blanc. */
export function cellulesNidAbeilles() {
  const K = CHARTE.selecteur_couleur;
  const R = K.anneaux;
  const cells = [];
  for (let r = -R; r <= R; r++) {
    const q1 = Math.max(-R, -r - R), q2 = Math.min(R, -r + R);
    const ligne = [];
    for (let q = q1; q <= q2; q++) {
      const d = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;   // distance hexagonale au centre
      let couleur;
      if (d === 0) couleur = '#FFFFFF';
      else {
        // position cartésienne de la cellule (hexagones à sommet plat, lignes décalées)
        const x = q + r / 2, y = -r * Math.sqrt(3) / 2;
        const angle = (Math.atan2(y, x) * 180) / Math.PI;
        const sat = K.saturation_min + (1 - K.saturation_min) * (d / R);
        const val = 1 - K.assombrissement_max * Math.max(0, r / R);
        couleur = tsvVersHex(angle, sat, val);
      }
      ligne.push(couleur);
    }
    cells.push(ligne);
  }
  return cells;
}

export function gris() {
  const K = CHARTE.selecteur_couleur;
  const n = K.gris_nb;
  return Array.from({ length: n }, (_, i) => {
    const v = Math.round(255 * (1 - i / (n - 1)));
    return rvbVersHex(v, v, v);
  });
}

/* ---------- Fenêtre ---------- */
let enCours = null;   // { valeur, initiale, surChoix, avecPipette }

/* Ouvre le sélecteur. `surChoix(hex)` est appelé à chaque couleur retenue (pastille ou validation du personnalisé). */
export function ouvrirSelecteurCouleur({ valeur = '#000000', avecPipette = false, surChoix = null, titre = 'Couleur' } = {}) {
  const d = document.getElementById('dlg-couleur');
  if (!d) return null;
  enCours = { valeur: hexValide(valeur) ? valeur.toUpperCase() : '#000000', initiale: hexValide(valeur) ? valeur.toUpperCase() : '#000000', surChoix, avecPipette, titre };
  rendreVueCouleurs(d);
  if (!d.open) d.showModal();
  armerFermeture(d);
  return d;
}

export function fermerSelecteurCouleur() {
  const d = document.getElementById('dlg-couleur');
  if (d && d.open) d.close();
}

/* Même garde que ui/dialogues.js : la fermeture au geste extérieur se décide sur pointerdown + pointerup, jamais
 * sur le click — sinon le click résiduel du geste d'ouverture referme la fenêtre aussitôt (v13.4 §3). */
const armees = new WeakSet();
function armerFermeture(d) {
  d.dataset.ouvertLe = String(performance.now());
  if (armees.has(d)) return;
  armees.add(d);
  let depuisLeFond = false;
  d.addEventListener('pointerdown', (e) => { depuisLeFond = e.target === d; });
  d.addEventListener('pointerup', (e) => {
    const depuis = performance.now() - Number(d.dataset.ouvertLe || 0);
    const ok = depuisLeFond && e.target === d && depuis >= CHARTE.dialogues.delai_garde_ms;
    depuisLeFond = false;
    if (ok && d.open) d.close();
  });
  d.addEventListener('pointercancel', () => { depuisLeFond = false; });
}

function retenir(c) {
  if (!hexValide(c)) return;
  const v = c.toUpperCase();
  enCours.valeur = v;
  memoriserRecente(v);
  if (enCours.surChoix) enCours.surChoix(v);
}

/* ---------- Vue « Couleurs » ---------- */
function rendreVueCouleurs(d) {
  const K = CHARTE.selecteur_couleur;
  const marche = CHARTE.COULEURS_ANNOTATION;
  const recentes = couleursRecentes();
  const lignes = cellulesNidAbeilles();
  const pas = K.taille_pastille_px;
  const largeurNid = (K.anneaux * 2 + 1) * pas;
  d.innerHTML = `
    <div class="dialogue selecteur-couleur" style="--pastille:${pas}px;--largeur-nid:${Math.round(largeurNid)}px">
      <h2>${echapper(enCours.titre)}</h2>
      <div class="groupe-couleurs">
        <h3>Couleurs du marché</h3>
        <div class="rangee">${marche.map((c) => pastille(c, LIBELLES_COULEURS[c] || c)).join('')}</div>
      </div>
      ${recentes.length ? `<div class="groupe-couleurs"><h3>Récentes</h3><div class="rangee">${recentes.map((c) => pastille(c, c)).join('')}</div></div>` : ''}
      <div class="nid-abeilles">${lignes.map((l) => `<div class="rangee-hex">${l.map((c) => hexagone(c)).join('')}</div>`).join('')}</div>
      <div class="rangee gris">${gris().map((c) => hexagone(c)).join('')}<span class="courante" style="background:${enCours.valeur}" title="Couleur choisie : ${enCours.valeur}"></span></div>
      <div class="boutons">
        ${enCours.avecPipette ? '<button type="button" class="btn" data-r="pipette">⌖ Pipette</button>' : ''}
        <button type="button" class="btn" data-r="perso">Personnalisé…</button>
        <button type="button" class="btn" data-r="fermer">Fermer</button>
      </div>
    </div>`;
  d.querySelectorAll('[data-couleur]').forEach((b) => b.addEventListener('click', () => { retenir(b.dataset.couleur); d.close(); }));
  const perso = d.querySelector('[data-r="perso"]');
  if (perso) perso.addEventListener('click', () => rendreVuePerso(d));
  d.querySelector('[data-r="fermer"]').addEventListener('click', () => d.close());
  const pip = d.querySelector('[data-r="pipette"]');
  if (pip) pip.addEventListener('click', () => {
    const rappel = enCours.surChoix;
    d.close();
    import('../outils.js').then((m) => m.armerPipette((c) => { if (rappel) rappel(c); memoriserRecente(c); }));
  });
}

function pastille(c, titre) {
  return `<button type="button" class="pastille${enCours.valeur.toUpperCase() === c.toUpperCase() ? ' actif' : ''}" data-couleur="${c}" style="background:${c}" title="${echapper(titre)}"></button>`;
}

function hexagone(c) {
  return `<button type="button" class="hexagone${enCours.valeur.toUpperCase() === c.toUpperCase() ? ' actif' : ''}" data-couleur="${c}" style="background:${c}" title="${c}"></button>`;
}

/* ---------- Vue « Personnalisé » ---------- */
function rendreVuePerso(d) {
  const t = hexVersTsl(enCours.valeur);
  const etatPerso = { h: t.h, s: t.s, l: t.l };
  d.innerHTML = `
    <div class="dialogue selecteur-couleur perso">
      <h2>Personnalisé</h2>
      <div class="zone-perso">
        <div class="carre-ts" id="carre-ts"><span class="viseur" id="viseur"></span></div>
        <div class="barre-lum" id="barre-lum"><span class="curseur-lum" id="curseur-lum"></span></div>
      </div>
      <label class="ligne-perso">Palette de couleurs
        <select id="perso-modele"><option value="RVB" selected>RVB</option></select>
      </label>
      <div class="champs-rvb">
        <label>Rouge<input type="number" id="perso-r" min="0" max="255" step="1"></label>
        <label>Vert<input type="number" id="perso-v" min="0" max="255" step="1"></label>
        <label>Bleu<input type="number" id="perso-b" min="0" max="255" step="1"></label>
        <label>Hex<input type="text" id="perso-hex" size="8" pattern="#[0-9A-Fa-f]{6}"></label>
      </div>
      <div class="avant-apres">
        <span class="echantillon" style="background:${enCours.initiale}" title="Couleur actuelle"></span>
        <span class="fleche-ap">→</span>
        <span class="echantillon" id="apercu-perso" title="Nouvelle couleur"></span>
      </div>
      <div class="boutons">
        <button type="button" class="btn" data-r="retour">Annuler</button>
        <button type="button" class="btn btn-primaire" data-r="valider">Valider</button>
      </div>
    </div>`;
  const carre = d.querySelector('#carre-ts');
  const viseur = d.querySelector('#viseur');
  const barre = d.querySelector('#barre-lum');
  const curseurLum = d.querySelector('#curseur-lum');
  const apercu = d.querySelector('#apercu-perso');
  const chR = d.querySelector('#perso-r'), chV = d.querySelector('#perso-v'), chB = d.querySelector('#perso-b'), chHex = d.querySelector('#perso-hex');

  const couleur = () => tslVersHex(etatPerso.h, etatPerso.s, etatPerso.l);

  function rafraichir({ champs = true } = {}) {
    const c = couleur();
    apercu.style.background = c;
    barre.style.setProperty('--teinte', tslVersHex(etatPerso.h, etatPerso.s, 0.5));
    viseur.style.left = (etatPerso.h / 360 * 100) + '%';
    viseur.style.top = ((1 - etatPerso.s) * 100) + '%';
    curseurLum.style.top = ((1 - etatPerso.l) * 100) + '%';
    if (champs) {
      const { r, g, b } = hexVersRvb(c);
      chR.value = r; chV.value = g; chB.value = b; chHex.value = c;
    }
  }

  function depuisCarre(e) {
    const r = carre.getBoundingClientRect();
    etatPerso.h = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 360;
    etatPerso.s = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    if (etatPerso.l === 0 || etatPerso.l === 1) etatPerso.l = 0.5;   // sinon le carré paraît sans effet
    rafraichir();
  }
  function depuisBarre(e) {
    const r = barre.getBoundingClientRect();
    etatPerso.l = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    rafraichir();
  }
  brancherGlissement(carre, depuisCarre);
  brancherGlissement(barre, depuisBarre);

  const depuisChamps = () => {
    const c = rvbVersHex(Number(chR.value) || 0, Number(chV.value) || 0, Number(chB.value) || 0);
    Object.assign(etatPerso, hexVersTsl(c));
    rafraichir({ champs: false });
    chHex.value = c;
  };
  [chR, chV, chB].forEach((ch) => ch.addEventListener('input', depuisChamps));
  chHex.addEventListener('change', () => {
    const v = chHex.value.trim().replace(/^([0-9A-Fa-f]{6})$/, '#$1');
    if (!hexValide(v)) { chHex.value = couleur(); return; }
    Object.assign(etatPerso, hexVersTsl(v));
    rafraichir();
  });

  d.querySelector('[data-r="retour"]').addEventListener('click', () => rendreVueCouleurs(d));
  d.querySelector('[data-r="valider"]').addEventListener('click', () => { retenir(couleur()); d.close(); });
  rafraichir();
}

/* Glissement au stylet / au doigt sur une zone, avec capture du pointeur. */
function brancherGlissement(el, surPoint) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    surPoint(e);
    const bouge = (ev) => surPoint(ev);
    const fin = () => { el.removeEventListener('pointermove', bouge); el.removeEventListener('pointerup', fin); el.removeEventListener('pointercancel', fin); };
    el.addEventListener('pointermove', bouge);
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
  });
}

/* ---------- Déclencheur réutilisable ----------
 * Rend une pastille cliquable (cible ≥ 40 px) doublée d'un champ caché portant la valeur : les fiches continuent
 * de lire `[name=…]` et de recevoir l'événement `change`, sans rien connaître du sélecteur. */
export function declencheurCouleur(nom, valeur, { pipette = false, titre = 'Couleur' } = {}) {
  const v = hexValide(valeur) ? valeur.toUpperCase() : '#000000';
  return `<span class="declencheur-couleur" data-declencheur="${echapper(nom)}" data-pipette="${pipette ? '1' : ''}" data-titre="${echapper(titre)}">
    <button type="button" class="pastille grande" style="background:${v}" title="${echapper(titre)} : ${v}"></button>
    <span class="valeur-hex">${v}</span>
    <input type="hidden" name="${echapper(nom)}" value="${v}">
  </span>`;
}

/* Branche tous les déclencheurs présents dans `racine`. */
export function brancherDeclencheurs(racine) {
  racine.querySelectorAll('.declencheur-couleur').forEach((z) => {
    if (z.dataset.branche) return;
    z.dataset.branche = '1';
    const bouton = z.querySelector('.pastille');
    const champ = z.querySelector('input');
    const lib = z.querySelector('.valeur-hex');
    bouton.addEventListener('click', () => ouvrirSelecteurCouleur({
      valeur: champ.value,
      avecPipette: z.dataset.pipette === '1',
      titre: z.dataset.titre || 'Couleur',
      surChoix: (c) => {
        champ.value = c;
        bouton.style.background = c;
        bouton.title = (z.dataset.titre || 'Couleur') + ' : ' + c;
        if (lib) lib.textContent = c;
        champ.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }));
  });
}
