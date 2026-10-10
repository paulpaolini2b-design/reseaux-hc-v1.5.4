# Réseaux HC — tracé de réseaux BT/HTA sur tablette (lot 1, v1.5.4)

Application web progressive (PWA) hors ligne pour tracer, symboliser et annoter des réseaux électriques HTA/BT sur fond de plan (PDF, image, photo), sur tablette Android au stylet et au doigt. Aucun serveur, aucune dépendance en ligne : tout est stocké sur la tablette (IndexedDB).

## Contenu de la livraison

```
reseaux-hc/
├─ index.html, manifest.json, sw.js       coquille, manifeste PWA, service worker (précache intégral)
├─ nomenclature.json                       copie identique du fichier fourni (jamais régénéré)
├─ HYPOTHESES.md                           décisions prises faute d'information (à lire)
├─ css/app.css                             thème, cibles tactiles, portrait / paysage
├─ js/                                     modules ES (voir en-tête de chaque fichier)
│  ├─ charte.js                            TOUTE la charte graphique (couleurs, tiretés, cotes, textes)
│  └─ …
├─ icons/                                  icônes PWA
└─ vendor/                                 pdf.js (legacy), pdf-lib, fontkit, DejaVu Sans
```

## Déploiement (hébergement statique)

L'application est un dossier de fichiers statiques. Le seul prérequis est **HTTPS** (obligatoire pour le service worker et l'installation PWA), sauf en `http://localhost` pour les essais.

1. Copier le dossier `reseaux-hc/` tel quel sur l'hébergement (GitHub Pages, serveur web interne, partage HTTPS…). Aucune compilation, aucun `npm install`.
2. Vérifier que les fichiers `.mjs` sont servis avec le type MIME `text/javascript` et les `.wasm` avec `application/wasm` (GitHub Pages, nginx et Apache récents le font par défaut).
3. Ouvrir `https://…/reseaux-hc/index.html` une première fois **avec** connexion : le service worker met en cache les 81 ressources (≈ 8,3 Mo). L'application est ensuite utilisable sans réseau.

Mise à jour : après avoir remplacé les fichiers, incrémenter `VERSION` dans `sw.js` (livraison courante : `reseaux-hc-v1.5.4`). À la prochaine ouverture connectée, la tablette télécharge la nouvelle version et affiche « Nouvelle version installée : relancez l'application ».

Essai local : `python3 -m http.server 8000` dans le dossier, puis `http://localhost:8000/`.

## Installation sur la tablette

1. Ouvrir l'adresse dans **Chrome Android** (≥ 105 recommandé).
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »). L'icône « Réseaux HC » apparaît ; l'application s'ouvre plein écran.
3. Ouvrir une première fois l'application depuis l'icône avec la connexion active, puis passer en mode avion pour vérifier : elle démarre et le dernier projet en cours se rouvre à l'identique.
4. Recommandé : Chrome → Paramètres → Site → autoriser le **stockage** ; l'application demande elle-même le stockage persistant pour que les projets ne soient pas purgés.

Les projets, fonds et nomenclature personnalisée restent dans le navigateur de la tablette. Pour transférer un projet sur le PC : Projets → ⋮ → **Sauvegarder en .json…** (fond embarqué), puis Projets → **Importer un .json** sur l'autre appareil.

## Notice courte

### Démarrer
- **Projets** (icône dossier) : gestionnaire plein écran. Onglets **En cours**, **Terminés**, **Archivés**, **Corbeille** ; recherche sur nom, commune, N° SIEEP, N° EDF ; filtre par type d'affaire ; tri. Un appui sur une ligne ouvre le projet ; ⋮ ou appui long pour le reste (informations, PDF, .json, dupliquer, classer, corbeille).
- **Nouveau projet** : nom, commune et date obligatoires ; N° SIEEP, N° EDF et type d'affaire facultatifs. Le fond est demandé ensuite. Un appui sur le titre en haut modifie ces informations.
- **Fond de plan** (icône image) : PDF, image ou **photo** prise directement. Un PDF de plusieurs pages donne **un plan par page** (toutes, ou celles choisies). Le fond est net à tout niveau de zoom.
- **Plans** (à partir de 2) : ‹ › en bas à droite ou **Page préc. / Page suiv.** ; appui sur le nom pour la liste (renommer, supprimer, ajouter un plan).
- Au démarrage, le dernier projet se rouvre s'il est **En cours** ; sinon le gestionnaire s'affiche.
- Pastilles orange : **Jamais sauvegardé hors tablette** / **Modifié depuis la sauvegarde** — faire ⋮ → Sauvegarder en .json… régulièrement.

### Terrain (rapidité)
- Barre de gauche : **1** sélection, **2** tronçon, **0** fourreau, **3** support, **4** coffret, **5** poste, **6** boîte de jonction, **7** ERAS, **8** MALT, **9** note, gomme (X), gomme magique (masques du fond), bibliothèque, Outils, mode de pose (**P**).
- **Mode de pose** (bouton « Pose ∞ / Pose 1 », touche P, réglage propre à la tablette) : *continue*, l'outil reste actif ; *unique*, après chaque pose l'application repasse en Sélection, sélectionne l'objet et ouvre sa fiche.
- Bandeau du bas : **réseau** (HTA / BT / BRT / EP), **pose** (aérien / souterrain / façade), **état** (existant / à poser / à déposer / à remplacer). Il s'applique à tout ce qui est posé ensuite, et à la sélection courante — le réseau réévalue la MALT des ERAS (jamais sur BRT / EP) et conserve un article devenu incompatible en le signalant « à compléter ».
- **Un appui = un objet posé**, aucun champ obligatoire. Au stylet, glisser lors de la pose oriente le symbole.
- **Tronçon** : un appui par sommet, accrochage automatique aux extrémités et aux ouvrages (cercle vert) ; terminer par un appui sur le dernier sommet, Entrée ou double appui. Touche **A** : accrochage 0° / 45° / 90°.
- **Note** (9) : appui puis texte au clavier ; couleur, taille, cadre, fond, flèche de rappel.
- **Bibliothèque** : recherche dans la nomenclature (libellé, sigle, section), filtrée sur le marché (BPU) quand l'état est « à poser » ; favoris et récents. Choisir un article règle l'outil de pose ; un armement ou une dépose s'ajoute au matériel associé de la sélection.
- Navigation : le **doigt** déplace, deux doigts zooment, double appui au doigt ajuste. Le **stylet** dessine ; son bouton latéral gomme. Appui long : menu contextuel.

### Bureau (complétude)
- Sélectionner un objet puis **F**, Entrée, double appui ou *Fiche* dans le menu : type filtré (matériau → hauteur → classe → effort, valeurs libres possibles), fonction, renforcement et son sens, armement, sigle, section, fourreau, matériel associé (nomenclature, libre, packages), commentaire, désignation manuelle prioritaire. **Tab** passe au champ suivant, **Ctrl+Entrée** valide.
- Indicateur **« à compléter »** en haut : liste des objets incomplets, un appui centre et ouvre la fiche.
- Étiquettes déplaçables (poignée bleue), masquables (**E** ou fiche). Rotation par poignée ronde ou **R**. Sommets déplaçables, point bleu au milieu d'un segment pour insérer un sommet.
- **Calques** : visibilité / verrou / opacité (dont « Dessins et masques »), filtre par réseau, opacité et page du fond, taille des textes et des symboles, légende (visibilité, cadre, fond).
- **Étiquettes et états** : la désignation automatique porte l'état — « BE 11m D 500 ex », « RM300 à déposer », « BE 11m D 500 à remplacer par BE 11m D 1000 » (cible saisie dans le champ « Remplacé par » de la fiche, avec le sélecteur du type) ; rien pour l'à poser. Tronçons : « 3x150+70 : 85 m » (à poser), « 3x70+54,6 ex — 30 m », « … à déposer — 30 m ». EP souterrain sans section : « EP sous fourreau » à poser, « EP » sinon.
- **Légende** : croix sur la légende pour la masquer (réglages conservés) ; objet « Légende » de la boîte Outils pour la reposer ; déplaçable, poignée carrée pour la taille, cadre et fond au menu contextuel ou dans Calques ; masquée à l'écran = absente des exports.
- **Descriptif** (Outils → Descriptif, v1.5.0) : texte des travaux généré depuis le plan, modifiable à la main ; double appui pour l'éditer.
- **Aperçu papier** (icône page) : masque tout ce qui n'est pas exporté.

### Export
- **PDF** vectoriel : page d'origine conservée, texte sélectionnable, légende. **PNG** 150 / 200 / 300 dpi. **.json** pour transfert. Sur Android le panneau de partage s'ouvre (Drive, mail…).

### Raccourcis
Ctrl+Z / Ctrl+Y annuler / rétablir · Ctrl+S sauver (automatique de toute façon) · Ctrl+D dupliquer · Suppr supprimer · Échap abandonner / désélectionner / fermer · Entrée terminer un tracé / ouvrir la fiche · Ctrl+0 ajuster · + / − zoom · flèches déplacement fin (Maj ×10) · 1-9 outils · X gomme · P pose continue / unique · R rotation 90° · E étiquettes · A accrochage angulaire · F fiche · ? aide.

## Nouveautés du lot 1.1 (v1.1.0)
- Le réseau BT s'affiche « BT » (clé interne inchangée), la BT à poser est en bleu `#171AEB`, l'état « à reprendre » devient « à remplacer ».
- Désignations : « ex » suit les objets existants / à remplacer (« BE ex » sans autre information) ; la longueur saisie d'un tronçon s'ajoute à son étiquette (« 3x70+54,6 ex — 30 m », « 3x150+70 : 85 m »), activable par plan (Calques) et par objet.
- Fiche tronçon : fourreau, nature de terrain, profondeur et grillage n'apparaissent qu'en pose souterraine (valeurs conservées).
- Repère librement éditable en tête de fiche ; **cartouche de repère** (cercle) sur les objets ponctuels, déplaçable par sa poignée ; jamais sur les tronçons.
- Étiquettes : une ligne par matériel associé (réordonnable), libellés abrégés définis dans `charte.js`, package MALT condensé en « Confection MALT » / « MALT ex ».
- **Déport** des objets ponctuels (poignée en croix, ligne de rappel vers l'ancrage), **tige MALT étirable** (poignée en losange), taille de symbole par objet (fiche et menu contextuel).
- Triangle de contrefiche : pointe sur le support, base côté pied.
- Barre d'outils avec libellés courts. Projets existants migrés automatiquement (schéma v2). Mettre à jour la tablette : ouvrir l'application connectée, puis la relancer.

## Nouveautés du lot 1.2 (v1.2.0)
- **Fourreau** (« Fourr », touche `0`) : un appui sur un tronçon puis un second sur le même tracé accroche le fourreau (il suit le tronçon, poignées vertes glissantes) ; hors tronçon, fourreau seul tracé comme un tronçon. Fiche : article FOURREAU, nombre, longueur, mention. Étiquette « 2 TPC ∅ 110 : 6 m ».
- **Boîte « Outils »** : flèches (simple, double, avec texte), flèche du nord, rond à texte, MALT libre, cotation, zone hachurée, trait libre au stylet, croix d'annulation — annotations sans nomenclature ni métré, calque « Annotations », couleur et épaisseur réglables.
- **Étiquettes réglables** : chaque bloc (désignation, matériel, cartouche) se déplace (point bleu), tourne (rond, A = 0/45/90°, Maj = 15°) et s'agrandit (carré fléché) à la poignée ; réglage numérique dans la fiche ; couleurs du cartouche ; « Réinitialiser l'aspect » au menu contextuel ; alerte de lisibilité (< 1,2 mm) en aperçu papier.
- **Mention libre** sur tous les objets, dernière ligne de l'étiquette ; le commentaire reste invisible sur le plan.
- **Échelle du trait** sur tronçons et fourreaux (poignée, fiche, menu) ; « Réinitialiser les tailles » sur une sélection multiple.
- **Échelle du plan** demandée à l'import du fond (1/200 … 1/2000, autre, inconnue) : tailles par défaut adaptées, objets déjà posés inchangés ; modifiable dans Calques.
- Poignées : 24 px minimum au stylet ; appui long sur des poignées superposées pour passer à la suivante. Tige MALT à haut fixe. Projets v1 et v2 migrés automatiquement (schéma v3).

## Nouveautés du lot 1.3 (v1.3.0)
- **Boîte Outils** : flèche double avec texte, **Trait** (segment rectiligne prolongeable, A = 0/45/90°, extrémités aucune / pointe / point), **Stylo** (main levée, ex-« trait libre »), et deux ouvrages EP à pose rapide — **Lanterne EP** et **Boucle EP** (rose à poser, violet existant ; article ÉCLAIRAGE PUBLIC, repère, légende, métré). Toutes les annotations ont une **poignée d'échelle** (trait, pointes, texte, hachures) ; épaisseur et taille du texte restent réglables séparément.
- **Gomme magique** (« Masq », près de la gomme) : masque une zone du **fond de plan** sans le modifier — rectangle (glisser), polygone (appuis), pinceau rond (glisser, diamètre réglable dans la barre d'options). Blanc opaque par défaut, couleur et opacité réglables ; dessiné sous tous les objets ; calque **« Masques »** pour tout réafficher ; exporté en PDF vectoriel et PNG ; jamais au métré ni en légende.
- **MALT** : sur un ouvrage, deux commandes distinctes — « **+ MALT ex** » (étiquette « MALT ex », aucun article) et « **+ Confection MALT** » (les 4 articles du package, sur support neuf comme existant). L'outil 8 ne produit qu'une ligne : « Confection MALT » (à poser) ou « MALT ex » (existante, sans article).
- **ERAS** : la MALT part du centre du rond, sa tige s'allonge indépendamment (poignée en losange) ; branchement et EP n'ont jamais de MALT (règle d'après `nomenclature.json`) ; l'article `a0377` s'étiquette « Remontée aéro-souterraine de branchement ».
- **Cartouche de repère** : croix rouge sur le cartouche d'un objet sélectionné pour le masquer en un appui (le repère est conservé ; la fiche le réaffiche). Utile quand une MALT ou une ERAS se pose sur un ouvrage déjà repéré.
- **Étiquettes** : bornes d'agrandissement portées à ×8 ; cadre (aucun / rectangle / arrondi), couleur de cadre et fond (translucide / blanc opaque / transparent) sur les blocs désignation et matériel, dans la fiche et le menu contextuel ; la Note gagne les mêmes cadres, le fond opaque, l'échelle par poignée.
- **Supports d'angle** : champ « angle en grades » (0–400, une décimale, virgule française), ligne « φ = 45 gr » sous la désignation, `φ` sélectionnable dans le PDF.
- **Sections dérivées** : les câbles `a0292` (3x150+70 / 3x150+95) et `a0293` (3x240+95 / 3x240+115) proposent leurs deux sections dans la fiche ; l'étiquette n'affiche que la section retenue, l'article de métré reste unique ; « 150+95 » trouve l'article dans la bibliothèque.
- **Boîtes de jonction** : poignée d'échelle (comme tous les ponctuels) ; sections raccordées sur la ligne de désignation (« BJ BT 150/150 »).
- **Matériel associé** : les neuf articles de raccordement / jonction (trousses DPH, LX C, DPG, EAJSE…) sont proposés en un appui sur supports, coffrets et ERAS, avec leurs libellés d'étiquette.
- **Échelle du plan** : les objets déjà posés gardent leur aspect **sans** que leur « taille du symbole » soit modifiée (elle reste à 1,0) ; « Aligner tous les objets sur l'échelle courante » (Calques) est le seul geste qui reprend les anciens objets. Projets v1 à v3 migrés automatiquement (schéma v4), y compris les compensations écrites par la v1.2.0.

## Nouveautés du lot 1.3.1 (v1.3.1)
- **MALT des ERAS par réseau** : une seule règle (`maltApplicable`), appliquée à tout changement de réseau — fiche, bandeau du bas (y compris sélection multiple), menu, import, ouverture d'un projet ancien. Une RAS BRT ou EP ne porte plus jamais de MALT automatique ; une MALT cochée à la main est conservée et l'objet apparaît « à compléter ». Un article devenu incompatible avec le réseau choisi est conservé et signalé.
- **États dans l'étiquette** : « ex » (existant), « à déposer », « à remplacer par … » ou « à remplacer » (cible non renseignée → objet « à compléter »), rien pour l'à poser ; le séparateur « : » de la longueur est réservé à l'à poser, « — » pour tout ce qui existe. Nouveau champ **« Remplacé par »** dans la fiche (même sélecteur que le type, texte libre en repli), repris dans l'étiquette, le `.json`, le PDF et le PNG ; au lot 3 il vaudra une dépose et une pose.
- **EP souterrain sans section** : « EP sous fourreau » (à poser), « EP » (existant, à déposer, à remplacer) ; la section reprend la main dès qu'elle est saisie.
- **Panneau de droite stable** : ajouter, réordonner, supprimer ou quantifier une ligne de matériel ne recharge plus le panneau — défilement, sections dépliées et focus clavier conservés ; Tab passe de quantité en quantité, Entrée valide et passe à la ligne suivante.
- **Légende pilotable** : croix de masquage (survol ou sélection), case dans Calques, objet « Légende » de la boîte Outils (grisé tant qu'elle est affichée) pour la reposer ; déplaçable, redimensionnable (×0,4 à ×4), cadre et fond réglables ; position, taille, visibilité et aspect enregistrés, exportés (PDF vectoriel, PNG) et annulables.
- Projets v1 à v4 migrés automatiquement (schéma v5). Mettre à jour la tablette : ouvrir l'application connectée, puis la relancer.

## Nouveautés du lot 1.3.2 (v1.3.2)
- **Tailles papier revues sur mesures d'un PDF exporté** (A3, fond cadastral au 1/500) : la désignation passe de 1,1 mm à **2,5 mm** — la taille des numéros de parcelle du cadastre —, le matériel et les repères à 2,25 mm, le sigle d'un coffret à 2,25 mm sans descendre sous 2 mm. Symboles environ doublés (support béton D 4 mm de large, coffret 6 × 4,1 mm, poste 9,2 × 6 mm), traits épaissis (BT 0,6 mm, HTA 0,78 mm), légende portée à 80 mm de large.
- **Alerte de lisibilité à 1,8 mm** (au lieu de 1,2 mm) : les tailles par défaut sont maintenant au-dessus du seuil à toutes les échelles, 1/200 à 1/2000.
- **Sigle aligné sur le coffret** : il tourne avec le symbole (il restait horizontal) et se retourne automatiquement pour ne jamais se lire à l'envers.
- **Attention aux plans déjà tracés** : ils grossissent à l'ouverture, c'est le but. Un plan dont les étiquettes avaient été agrandies à la main est à revoir ; Calques → taille des textes / des symboles à 0,5 rétablit l'aspect antérieur.

## Nouveautés du lot 1.3.3 (v1.3.3)
- **Repère de cartouche à 3,5 mm** : plus besoin d'agrandir chaque cartouche à la main. Les cartouches déjà agrandis (×1,05 à ×2,2) reviennent à ×1 à l'ouverture ; au-delà de ×2,2, l'agrandissement est conservé.
- **Sigle confiné dans le symbole** : `RM450`, `S17` ou un sigle long ne dépassent plus du rectangle noir — le coffret s'élargit (jamais en hauteur) plutôt que de laisser le texte sortir ou descendre sous 2 mm ; au-delà de 2,5 fois sa largeur, le sigle affiché est tronqué avec « … », le sigle complet restant intact dans la fiche.
- **Couleur du texte** réglable dans « Aspect du bloc désignation » et « Aspect du bloc matériel ».
- **Palette élargie** : les teintes des réseaux s'ajoutent aux couleurs génériques — marron HTA existant, jaune BT existant aérien, rose EP à poser, et les autres. Chaque pastille est nommée en info-bulle.
- **La gomme magique devient l'outil Dessin** (nouvelle icône de pinceau) : masquer une zone du fond, ou poser un aplat coloré. Case **Surligneur** : l'aplat passe au-dessus des ouvrages, en semi-transparent, pour mettre un tracé en évidence. **Pipette** : touchez un ouvrage pour reprendre sa couleur, ou le fond de plan pour prélever sa teinte (Échap annule). La couleur choisie est conservée d'un dessin à l'autre.
- Projets v1 à v5 migrés automatiquement (schéma v6).

## Nouveautés du lot 1.3.4 (v1.3.4)
- **Nouveau sélecteur de couleur**, le même partout (Dessin, notes, blocs, annotations, légende) : fenêtre centrée avec les **couleurs du marché** nommées (marron HTA existant, jaune BT existant aérien, rose EP à poser…), les **récentes** communes à tous les usages, un nid d'abeilles de 61 teintes, une rangée de gris, la pipette, et un bouton **Personnalisé…** (carré teinte/saturation, barre de luminosité, champs Rouge/Vert/Bleu et Hex). Le panneau du système Android n'apparaît plus.
- **Formes arrondies dans l'outil Dessin** : **ellipse** (Maj ou accrochage angulaire = cercle) et **rectangle arrondi** à rayon d'angle réglable, dans la barre d'options comme dans la fiche. Elles se comportent comme le rectangle : couleur, opacité, surligneur, déplacement, poignées, exports.
- **Correctif de saisie** : la fenêtre de texte d'un « Rond avec texte », d'une flèche avec texte, d'une cotation ou d'une note ne se referme plus toute seule quand on pose l'objet au stylet. Une saisie annulée **conserve** l'annotation (texte vide, à renseigner dans sa fiche) au lieu de la supprimer.
- Projets v1 à v6 migrés automatiquement (schéma v7).

## Nouveautés du lot 1.3.5 (v1.3.5) — reconstitué d'après le code
- **Export PDF fiabilisé** : le fond est relu depuis la base de la tablette (plus d'erreur « The source image could not be decoded » après une veille), le format d'image est reconnu par son contenu, plusieurs replis de décodage, et un fond PDF non copiable est rastérisé plutôt que de faire échouer l'export. Une erreur éventuelle nomme l'étape fautive.
- **Vraie transparence dans le PDF** : surlignages et fonds translucides laissent voir le tracé et le fond de plan dessous, au tirage comme à l'écran.

## Nouveautés du lot 1.4 (v1.4.0)
- **Gestionnaire de projets plein écran** : En cours, Terminés, Archivés, Corbeille, avec compteurs ; recherche sans accents ni majuscules ; filtre par type d'affaire (Aérien HTA/BT, Souterrain HTA/BT, Aérien BT, Souterrain BT, Enfouissement, Déplacement) ; tri ; pastilles Ouvert, sauvegarde, commune à renseigner, indice.
- **Informations d'affaire** : N° SIEEP, N° EDF, type d'affaire ; commune désormais obligatoire.
- **Export sans ouvrir** : PDF et .json d'un projet directement depuis le gestionnaire, vers **Partager (Drive, mail…)** ou **Enregistrer sur la tablette**, sans toucher au plan ouvert (vue, sélection, Ctrl+Z conservés).
- **Noms de fichiers** : `N°SIEEP_Commune_Nom_AAAAMMJJ`, et pour le PDF d'un projet **Terminé** un indice `_A`, `_B`… à chaque nouvel export.
- **Classement réversible** : changement de statut et corbeille avec « Annuler » pendant 5 s ; la corbeille se vide seule après 30 jours.
- **Archivés en consultation** : le plan s'ouvre en lecture seule (bandeau « Archivé — consultation ») ; « Désarchiver pour modifier » rend la main. **Libérer la place…** retire un archivé de la tablette après sauvegarde .json vérifiée.
- **Import** : si le projet existe déjà, choix Remplacer / Garder les deux / Annuler, avec la version la plus récente indiquée ; la date de modification du fichier est conservée.
- Déplacer ou zoomer un plan ne le fait plus remonter en tête de liste. Correctif : ouvrir un projet après un projet à fond PDF ne provoque plus d'erreur.
- **v1.4.1** : le .json partagé vers Drive part sous le nom `….json.txt` (Android refuse l'extension .json au partage) ; il se réimporte tel quel. « Enregistrer sur la tablette » garde `.json`.
- **v1.4.2** : le bandeau « Archivé — consultation » ne s'affiche plus sur les projets modifiables.

## Nouveautés de la v1.4.3 — outil Mesure

Distance sur plan **indicative**. La longueur des tronçons reste saisie à la main dans leur fiche.

1. Icône règle de la barre du haut, ou touche **M**. Un second appui revient à la Sélection.
2. **Calibrer** (une fois par fond et par page) : pointer les deux extrémités d'une distance connue (cote, barre d'échelle, dimension relevée), zoomer pour être précis, puis saisir la distance réelle en mètres.
3. **Contrôler** : pointer une autre distance connue, de préférence longue et dans une autre direction ; l'écart s'affiche. Au-delà de 1 %, la calibration est signalée douteuse.
4. **Mesurer** : un appui par point, cumul affiché ; appui sur le dernier point, Entrée ou double appui pour terminer. Glisser un point pour l'ajuster ; Retour arrière retire le dernier ; Échap efface.
5. Lire l'état en tête du panneau : « Calibrée, contrôlée » est l'état fiable. Sans calibration, un PDF à échelle déclarée donne une valeur « ≈ » non vérifiée ; une photo ne donne rien.
6. La valeur est une distance **horizontale** : hors dénivelé, remontées aéro-souterraines et réserves de câble. Elle n'est jamais exportée.

Fichiers ajoutés : `js/mesure.js`, `js/mesure-calcul.js`, `js/mesure.test.mjs` (essais : `node js/mesure.test.mjs`). Détail des décisions : `HYPOTHESES.md`, H-182 à H-200.
- Projets v1 à v7 migrés automatiquement (schéma v8) : ils apparaissent tous « En cours » et « Jamais sauvegardé hors tablette ». Mettre à jour la tablette : ouvrir l'application connectée, puis la relancer.

## Nouveautés de la v1.4.4

1. **Outil Trait — style pointillé** : bouton Plein / Pointillé dans la barre d'options pendant le tracé, dans la fiche de l'objet une fois posé, et au menu contextuel (appui long) — y compris sur une sélection de plusieurs Traits à la fois. Épaisseur et extrémités restent réglables uniquement dans la fiche, comme avant. Suit le trait à l'écran, en export PDF et en export PNG. Aucun projet existant ne change d'aspect à l'ouverture (repli « Plein »).
2. **Outil Note — taille de police en saisie libre** : un champ « Taille (mm) » (virgule française, une décimale) est ajouté à côté du menu déroulant existant, dans la fiche de la note ; les deux restent synchronisés (le menu affiche « Personnalisé » sur une valeur hors liste). Le menu contextuel permet aussi d'appliquer un palier du menu à toute une sélection de notes.
3. Aucune migration de schéma (version 8 inchangée) : les deux nouveaux réglages ont une valeur de repli.

Écarts constatés entre le cahier des charges v1.4.4 et le code v1.4.3 (barre d'options et menu contextuel du Trait absents, pas de mécanisme de sélection multiple à état indéterminé à reprendre, alerte de lisibilité non applicable aux Notes) : détail des décisions dans `HYPOTHESES.md`, H-201 à H-206.

## Nouveautés de la v1.4.5 — PDF de plusieurs pages

Défaut corrigé : en v1.4.4, un PDF de plusieurs pages était un seul fond ; la liste « Page » de Calques changeait la page mais laissait les objets en place (ceux de la page 1 apparaissaient sur les pages 2 et 3) et l'export ne sortait qu'une page.

1. **Import** : Fond de plan → choisir le PDF → **Toutes les pages (N)**, ou « seulement les pages » (`2`, `1-3`, `1,3`, `1-3; 5`). Un plan par page ; le fichier n'est stocké qu'une fois. Si le plan affiché a déjà un fond : **Ajouter comme nouveaux plans** ou **Remplacer le fond** (objets conservés, pages suivantes insérées après). L'échelle n'est demandée qu'une fois.
2. **Navigation** : ‹ › en bas à droite, ou Page préc. / Page suiv. au clavier. Chaque plan a ses objets, sa légende, sa vue, sa calibration de mesure et son Annuler / Rétablir. Repères (P1, P2…), calques, réglages et **échelle du plan sont communs** à tous les plans : un PDF dont les pages sont à des échelles différentes garde les mêmes tailles par défaut.
3. **Liste des plans** (appui sur le nom) : ouvrir, renommer, supprimer (« Annuler » 5 s, pas Ctrl+Z ; le dernier plan ne se supprime pas), ajouter un plan (PDF, image ou photo).
4. **Projet d'une version antérieure** : il s'ouvre à l'identique. **Répartir les pages en plans** (Calques, Fond de plan ou liste des plans) crée les plans manquants ; les objets déjà tracés restent sur la page affichée — **vérifiez-les**, l'application ne peut pas savoir sur quelle page ils ont été tracés. Rien n'est supprimé.
5. **Export PDF** : tous les plans, une page par plan, format de chaque page conservé. **PNG** : plan affiché. `.json` : le PDF n'y est embarqué qu'une fois. Un projet d'un seul plan s'exporte exactement comme en v1.4.4.
6. **À compléter** : tous les plans, groupés par plan ; un appui ouvre le bon plan.
7. Aucune migration (schéma 8). Mettre à jour la tablette : ouvrir l'application connectée, puis la relancer.

Fichiers ajoutés : `js/plans.js`, `js/plans-calcul.js`, `js/ui/plans.js`, `js/plans-calcul.test.mjs` (essais : `node js/plans-calcul.test.mjs`). Détail des décisions : `HYPOTHESES.md`, H-207 à H-231.

## Nouveautés de la v1.4.6 — mise en forme, images, formes, étiquette fléchée, sections EP

1. **Note** : **G / I / S** (gras, italique, souligné) sur la sélection, aussi Ctrl+B / Ctrl+I / Ctrl+U ; alignement **gauche, centré, droite, justifié** pour toute la note. Le collage se fait en texte brut. Une note sans mise en forme est enregistrée et dessinée exactement comme avant.
2. **Image / photo** : Outils → groupe « Plan » → **Image / photo** (galerie ou appareil photo). L'image se pose au centre de la vue, sur le fond de plan et sous les dessins et le réseau. Poignée ronde : rotation (Maj = 15°, accrochage angulaire = 45°) ; poignée carrée : taille, proportions conservées ; fiche : opacité, largeur en mm, rotation, « Remplacer l'image ». Calque **« Images et photos »**. Hors métré, hors légende. Photo ramenée à 2 400 px de côté, orientation de l'appareil respectée. Le fond de plan n'est pas modifié.
3. **Dessin** : modes **Carré** et **Rond** (proportions conservées ensuite). Rectangle, rectangle arrondi, ellipse, carré, rond et polygone se tournent par une **poignée ronde**, la touche R ou le menu (± 90°) ; le redimensionnement par un coin garde le coin opposé en place, même tourné.
4. **Étiquette fléchée** : Outils → « Flèches et repères ». Un appui, puis le texte : note encadrée dont la flèche part du **coin du cadre situé du côté de la pointe** ; la pointe se déplace à la poignée losange (longueur et direction), le coin de départ suit. Choix « Départ de la flèche » dans toute note ; les notes existantes gardent leur flèche au milieu du bord gauche.
5. **Sections EP** : tronçon EP souterrain → 3 X 6, 5 X 6, 3 X 10, 5 X 10, 3 X 16, 4 X 25 mm² cuivre (U1000 R2V, a0296 à a0301) ; EP aérien et façade → 2 x 16 seul (câble de branchement torsadé PCR, a0278). Sans section, un tronçon EP souterrain reste « EP sous fourreau » / « EP ». Listes BT, BRT et HTA inchangées. `nomenclature.json` n'est pas modifié.
6. Schéma 9, migration silencieuse : un projet v1.4.5 s'ouvre, s'affiche et s'exporte à l'identique (vérifié : PDF de même contenu, PNG identique au pixel, rendu écran identique). Une v1.4.5 refuse un .json enregistré en v1.4.6.

Fichiers ajoutés : `js/forme-calcul.js` (calculs purs, essais : `node js/forme-calcul.test.mjs`), `js/images.js`, `vendor/fonts/DejaVuSans-Bold.ttf`, `-Oblique.ttf`, `-BoldOblique.ttf` (DejaVu 2.37, licence `vendor/fonts/LICENSE_DEJAVU`). Détail des décisions : `HYPOTHESES.md`, H-232 à H-244.

## Nouveautés de la v1.4.7 — rognage des images et photos

1. **Rogner** une image ou une photo posée sur le plan : bouton **Rogner** de la fiche, **Rogner l'image** à l'appui long, ou touche **C** (une seule image sélectionnée).
2. Pendant le rognage, l'image entière apparaît en transparence ; la partie retenue est à pleine opacité dans un cadre tireté.
   - **Barres** au milieu des côtés : rognent ce côté seulement.
   - **Équerres** aux coins : rognent les deux côtés, sans conserver les proportions.
   - **Glisser à l'intérieur** de la partie retenue : recadre, la taille visible ne change pas.
   - Au moins 5 % de l'image restent visibles dans chaque sens. Le contenu ne bouge pas sur le plan, même sur une photo tournée.
3. **Valider** : bouton « Valider le rognage », Entrée, ou appui hors de l'image. Une seule étape : un Ctrl+Z défait tout le rognage. **Annuler** : bouton « Annuler », Échap ou Ctrl+Z pendant le rognage — rien n'est changé. Changer d'outil, de plan, de projet, d'objet sélectionné, ou passer en aperçu papier annule aussi.
4. **Non destructif** : le fichier de l'image n'est jamais modifié. **Réinitialiser le rognage** (fiche) rend l'image entière ; **Remplacer l'image** remet le rognage à zéro.
5. Après rognage : l'image ne se sélectionne que dans sa partie visible ; la rotation et la taille (poignées, fiche, menu, R) se font autour du **centre de la partie visible** ; « Largeur (mm) » de la fiche est la **largeur visible**, celle du papier.
6. **Exports** : PDF, PNG et écran concordent. Le PDF embarque l'image entière, découpée : pas de perte de qualité, mais pas d'allègement du fichier.
7. Schéma 10, migration sans changement d'aspect : un projet v1.4.6 s'ouvre, s'affiche et s'exporte à l'identique (vérifié : même contenu de page PDF, PNG identique au pixel, rendu écran identique). Une v1.4.6 refuse un .json enregistré en v1.4.7.

Fichier ajouté : `js/ui/rognage.js` (barre flottante). Calculs dans `js/forme-calcul.js` (essais : `node js/forme-calcul.test.mjs`). Détail des décisions : `HYPOTHESES.md`, H-245 à H-256.

## Nouveautés de la v1.4.8 — symboles des supports (légende SIEEP-HC)

1. **Symboles des supports alignés sur la légende de supports du SIEEP-HC** :
   - **existant** : symbole vide ;
   - **à poser** : symbole **demi-rempli** (béton, bois : diagonale, moitié bas-droite noire ; métallique : moitié basse ; console : moitié droite ; ancrage : platine demi-remplie) ;
   - **à déposer** : symbole **plein + croix débordante** (console et ancrage : pleins, sans croix) ;
   - **à remplacer** : symbole vide **barré d'une seule oblique** (non illustré sur la légende du SIEEP-HC, voir H-257).
2. **ME tub** : octogone (remplace l'anneau). **ME ptr** : carré à **croix droite (+)** inscrite.
3. **Renforcements** : bois jumelé en symboles tangents ; contrefiche à triangle plein en pose, une seule croix sur l'ensemble à la dépose ; hauban inchangé, croix sur le support seul.
4. **Nouveaux types** dans la liste « Matériau / type » du support : **Console de façade** et **Ancrage en façade**. L'ancrage demande son type : EAF (a0195), EADF (a0196) pour la BT, ancrage de branchement (a0286) pour le branchement. Désignations : « Console », « Ancrage EAF », « Ancrage EADF », « Ancrage BRT », avec les suffixes d'état habituels. Ni hauteur, ni classe, ni effort, ni renforcement.
5. **Légende** : une ligne par type, classe, renforcement et état (« Support bois contrefiché à poser »).
6. **Inchangé** : coffrets, bornes, postes, boîtes de jonction, ERAS, MALT, ouvrages EP et tronçons (vérifié primitive par primitive contre la v1.4.7). Aucun changement de schéma : un projet v1.4.7 s'ouvre sans migration ; seul le dessin des supports change.
7. **Planche de contrôle** : `planche-supports.html` (à ouvrir à la main, non liée depuis l'application et non mise en cache) dessine toutes les combinaisons à la taille papier réelle, à 0° et à 30°, pour contrôle sur tablette et impression à 100 %.

Fichiers ajoutés : `planche-supports.html`, `js/planche-supports.js`, `js/symboles-supports.test.mjs`, `js/symboles-supports.reference-v1.4.7.json`. Essais : `node js/symboles-supports.test.mjs`. Détail des décisions : `HYPOTHESES.md`, H-257 à H-262.

## Nouveautés de la v1.4.9 — couleurs, étiquettes, mode de pose, conducteurs nus

1. **Couleurs** (écart au v9 §8.1 demandé par le SIEEP-HC, H-263) :
   - BT existant aérien et façade (donc aussi à déposer / à remplacer) : jaune **`#F5DD27`** avec liseré sombre (v1.4.8 : `#C8960C`) ; BT souterrain existant inchangé ;
   - branchement (BRT) existant / à déposer / à remplacer, toutes poses : orange foncé **`#C47500`** (v1.4.8 : `#B35A00`) ;
   - branchement à poser, toutes poses : orange fluo **`#FF6A00`** avec liseré sombre (v1.4.8 : `#FF8A00`) ;
   - fourreau TPC existant : **`#E85A64`**, plus voyant mais plus clair que le TPC à poser `#E2001A` (v1.4.8 : `#E08C8C`) ; acier inchangé ;
   - ERAS / RAS de couleur fluo (jaune BT existant, orange BRT à poser, vert BT souterrain existant, rose EP à poser) : liseré sombre autour du rond ;
   - boîtes de jonction et ERAS suivent les nouvelles teintes ; palette et légende aussi. Les couleurs déjà choisies dans les notes, annotations et blocs ne sont pas modifiées.
2. **Retour à la ligne des étiquettes** (H-264) : réglage par bloc dans la fiche (« Retour à la ligne de la désignation / du matériel » : par défaut, automatique, jamais) et à l'appui long sur le bloc. Par défaut : **sur une ligne** pour les tronçons et fourreaux, automatique pour les autres ouvrages. En automatique, ne sont jamais coupés : nombre + unité (« 60 m », « 54,6 mm² »), « 3 x 70 + 54,6 », « déposer — 60 m », « à déposer », « à remplacer par », « sous fourreau », « Nu ≥ 22 mm² ». **Conséquence** : sur un projet v1.4.8 rouvert, une étiquette de tronçon jusqu'ici coupée s'affiche sur une ligne (rétablir « Automatique » dans la fiche si besoin).
3. **Mode de pose** (H-265) : bouton « Pose ∞ / Pose 1 » de la barre de gauche ou touche **P**. *Pose unique* : après la pose d'un ouvrage (au stylet, après l'orientation), la fin d'un tronçon ou d'un fourreau, ou la pose d'une annotation ponctuelle, retour à la Sélection, objet sélectionné, fiche ouverte (annotations à texte : la saisie du texte s'ouvre, pas la fiche). Notes, dessins, gomme, traits, zones, flèches, cotations et stylo : inchangés. Réglage de la tablette, conservé hors ligne.
4. **Couleur manuelle d'un tronçon ou d'un fourreau** (H-266) : fiche, section **Avancé** seulement, « Couleur du tracé » (sélecteur et pipette), « Revenir à la couleur de la charte ». Seule la couleur change ; elle est conservée si l'état ou le réseau change ; rappel « Couleur personnalisée » en tête de fiche ; **jamais dans la légende**.
5. **Conducteurs nus** (H-268) : sections « Nu < 22 mm² » et « Nu ≥ 22 mm² » en tête de liste pour un tronçon **BT aérien existant, à déposer ou à remplacer** (seuil ≥ 22 mm² du marché, articles de dépose a0465 / a0466 indiqués dans la fiche, jamais ajoutés automatiquement). Un tronçon « Nu » passé à poser, en souterrain ou en façade garde sa section et devient « à compléter ».
6. **Schéma 11** (H-269) : propriétés facultatives `retour_ligne` et `couleur_manuelle` ; un projet v1.4.8 s'ouvre sans transformation ; **une v1.4.8 refuse un .json v1.4.9** — mettre à jour toutes les tablettes ensemble.

Fichier ajouté : `js/coupure-texte.test.mjs`. Essais : `node js/coupure-texte.test.mjs`, `node js/symboles-supports.test.mjs` (référence v1.4.7 conservée, seuls changements de couleur et liseré admis). Détail des décisions : `HYPOTHESES.md`, H-263 à H-270.

## Nouveautés de la v1.5.0 — descriptif des travaux, efforts BE anciens

1. **Efforts béton hors marché** (§1, H-271) : pour un support béton de classe D (ou sans classe) **existant, à déposer ou à remplacer**, la liste des efforts propose en tête un groupe « Anciens — hors marché » : **250, 300, 400, 500 daN**, quelle que soit la hauteur. Aucun article, aucune fourniture (`ref_article` vide) ; jamais proposés pour un support à poser ni dans « Remplacé par ». Un support portant l'un de ces efforts passé **à poser** garde sa valeur et devient « à compléter » (« effort hors marché pour un support à poser »). Désignation et symbole inchangés (« BE 11m D 500 ex »). « Autre… » reste disponible.
2. **Descriptif des travaux** (§2) : texte des ouvrages et tronçons du plan, sur le modèle des APS 5052, 5055, 5033. **Outils → Descriptif** le crée (génération complète, coin haut-droit de la page) ou le réaffiche. Un descriptif **par plan**.
   - **En-tête** : commune et affaire en majuscules, ligne « Coordonnées — à saisir » (éditeur seulement tant qu'elle est vide), `EDF …`, `N°…`, lignes libres.
   - **Ouvrages** : repère en rouge (« S1. »), première ligne selon l'état (« Pose BE 12m D 650 », « BE 13m D 1000 à déposer – Pose BE 13m D 1000 », « φ = 55 gr - Pose … », « Poste « SUALI » PSS-B 160 kVA existant »…), puis ERAS rattachées, armement d'un support à poser, matériel associé (« Pose 3 EAS », « Confection MALT », libellés commençant par Pose / Dépose / Repose / Confection / Sectionnement / Démolition repris tels quels), MALT rattachée, mention. Un existant sans travaux est créé **non inclus** (visible et cochable). Nom facultatif du poste : nouveau champ de la fiche poste.
   - **Tronçons** : une entrée par réseau + pose + état + section (« BTA à construire 3 x 150 + 70 — Long = 612 ml de S1 à S12 », « BTS à construire : 3 x 240 (0,40 m × 1,00 m) de P à A1 », « BTA à déposer T70 et T35 = 105 ml de S1 à S6 » par fusion), détail par tronçon « De A0 à A1 : 135 ml », linéaire total, fourreaux, **fourniture calculée** (BTS + 2 ml par émergence, HTA/S + 5 ml, aérien × 1,08 arrondi au mètre supérieur, façade sans majoration, BRT et EP à saisir) avec le détail du calcul dans l'éditeur, tranchée en texte libre (10 dernières valeurs proposées), trait d'échantillon à gauche.
   - **Longueurs** : seul le champ « longueur » saisi est repris, jamais la mesure. Tronçon sans longueur : « 170 ml — incomplet (1 tronçon(s) sans longueur) », à l'écran et à l'export.
3. **Toujours modifiable, jamais écrasé** (§2.7) : le descriptif suit le plan en direct (lignes automatiques recalculées à chaque modification) ; une ligne modifiée à la main, une ligne libre, l'ordre, les sauts de colonne et les champs ne sont jamais touchés. Objet modifié sous une ligne manuelle : pastille orange « objet source modifié », levée par **Vu** ou **Rétablir l'automatique**. Entrée supprimée : jamais recréée (« Réintégrer » en bas de l'éditeur). Tout est annulable (Ctrl+Z / Ctrl+Y), y compris la suppression d'un objet et de son entrée.
4. **Éditeur** (double appui sur le bloc, menu du bloc, Calques) : plein écran, ligne par ligne, gras / italique / souligné / **couleur** du texte sélectionné, alignement, niveau 0 à 2, puce •  ou ➢ ; par entrée (⋮ ou appui long) : inclure, monter / descendre, glisser (⠿), fusionner avec la suivante, saut de colonne, trait, détail, tranchée, fourniture, rétablir, centrer sur le plan, supprimer. Entrée = nouvelle ligne, Ctrl+↑ / Ctrl+↓ = déplacer l'entrée, Échap = fermer. Archivé : consultation seule.
5. **Bloc sur le plan** : comme la légende — déplaçable (doigt, stylet, flèches), **poignée carrée de largeur** (la hauteur suit le contenu), croix de masquage, cadre / fond / couleur, 1 à 3 colonnes égales coupées entre entrées, échelle du texte (jamais sous 1,8 mm). Au-dessus des objets, sous la légende. Contour rouge et proposition « Sortie en page annexe » s'il dépasse la page.
6. **Exports** : PDF vectoriel, texte sélectionnable (DejaVu, `φ`, `Ø`, `²`, `•`, `➢` vérifiés) — **sur le plan** ou en **page annexe** ajoutée juste après la page du plan (même format, marges 10 mm, en-tête « affaire — Descriptif — N° »). PNG : bloc sur le plan. Descriptif masqué : absent des exports. S'il reste des alertes : dialogue **Exporter quand même / Corriger**. Les alertes apparaissent aussi dans **À compléter**, rubrique « Descriptif ».
7. **Schéma 12** : `plan.descriptif`, `attributs.nom` des postes ; un projet v1.4.9 s'ouvre sans changement d'aspect ; **une v1.4.9 refuse un .json v1.5.0**. Les versions publiées sous le même domaine partagent la base de la tablette : ouvrir un projet v1.5.0 avec une v1.4.9 ne le refuse pas (le descriptif est conservé mais n'est plus mis à jour) — mettre toutes les tablettes à jour ensemble.

Fichiers ajoutés : `js/descriptif.js` (génération, mise à jour), `js/descriptif-rendu.js` (mise en page, primitives), `js/ui/descriptif.js` (éditeur), `js/descriptif.test.mjs`. Essais : `node js/descriptif.test.mjs` (20 essais, dont les recettes 5055, 5052 et 5033). Détail des décisions : `HYPOTHESES.md`, H-271 à H-292.

## Nouveautés de la v1.5.1 — MALT sur l'ouvrage, « Confection », fourniture BT souterraine, revêtements, GPS, annexe A4

1. **Symbole MALT sur l'ouvrage** (H-293, H-294) : « + MALT ex » ou « + Confection MALT » (fiche, menu contextuel, package contenant la MALT) pose directement le symbole MALT sous l'ouvrage. Ouvrage sélectionné : **losange** au haut de la tige pour le déplacer au stylet, **poignée basse** pour allonger la tige. Couleurs : **gris** = MALT existante, **bleu** = confection sur la BT, **rouge** = confection sur la HTA ; l'objet MALT (outil 8) suit la même règle ; la légende distingue les trois. Case « Symbole MALT sur le plan » dans la fiche (afficher / masquer ; les plans existants ne reçoivent aucun symbole d'office). La MALT d'une ERAS est inchangée.
2. **Descriptif — « Confection »** (H-295) : « Confection 1 EAJSE T 150/3x240+95 », « Confection 1 Jonct. torsadé/torsadé DPG4 », « Confection 1 Dériv. torsadé/torsadé DPH4 », remontées aéro-souterraines, boîtes et manchons de jonction ; les autres articles restent en « Pose ».
3. **Fourniture BT souterraine** (H-296) : linéaire + **2 ml au départ et 2 ml à l'arrivée de chaque tronçon tracé**. HTA/S (+ 5 ml par émergence), aérien (× 1,08) et façade inchangés.
4. **Revêtements multiples** (H-297) : fiche d'un tronçon souterrain, « + Revêtement » (nature + linéaire en ml), contrôle de la somme. Descriptif : « De P2 à C1 : 60 ml (Terre) » pour un revêtement unique, une ligne à puce par revêtement sinon, cumul par nature en « Total seul » ; alerte si la somme ne correspond pas.
5. **Point GPS de l'affaire** (H-298), facultatif : Informations de l'affaire → « Point GPS ». Coller les coordonnées de Google Maps (appui long sur la carte → copier « 42.1028902, 9.2117636 »), ou bouton « Coller », ou « Position de la tablette » ; « Voir sur Google Maps ». Reprise en en-tête du descriptif.
6. **Couleur du texte du descriptif** (H-299, correctif) : sélectionner le texte puis la pastille de couleur ; sans sélection, toute la ligne.
7. **Page annexe du descriptif en A4 portrait** (H-300), quel que soit le format du plan.
8. **Schéma 13** (H-301) : un projet v1.5.0 s'ouvre sans changement d'aspect ; une v1.5.0 refuse un .json v1.5.1 — ne plus utiliser l'adresse de la v1.5.0.

Fichier ajouté : `js/v151.test.mjs`. Essais : `node js/v151.test.mjs` (10 essais). Détail des décisions : `HYPOTHESES.md`, H-293 à H-301.

## Nouveauté v1.5.4 — plan de situation

Outil **Dessin → Plan → « Plan de situation »** (H-305) : carte **Plan IGN** centrée sur le **point GPS de l'affaire** (à renseigner d'abord dans les informations de l'affaire), avec un **rond rouge à fond transparent** sur le point. Connexion nécessaire à la création ; ensuite la carte reste dans la tablette (hors ligne, export PDF / PNG).
- **Taille de la carte** : poignée carrée, ou « Largeur (mm) » dans la fiche ; rotation, opacité et rognage comme une image.
- **Taille du rond** : fiche → « Diamètre du rond (mm) » (champ ou curseur).
- **Échelle de la carte** : fiche → niveau 12 à 18 (la largeur réelle couverte est affichée) ; nouvelle carte téléchargée.
- **Point GPS modifié** : fiche → « Retélécharger la carte ».

## Correctif v1.5.3 — sens des tronçons au descriptif

Les tronçons d'une chaîne sont décrits par défaut dans l'**ordre logique des ouvrages** (S1 → A1 → A2 → … → A6), comme sur le plan et dans la section Ouvrages, quel que soit le sens de tracé (H-304). Pour inverser : champ **« Sens »** de l'entrée (« Ordre des ouvrages » / « Inversé ») ou menu ⋮ → « Inverser le sens des tronçons ».

## Correctif v1.5.2 — MALT depuis le centre de l'ouvrage, Ricciata et Bi-couche

1. **MALT portée par un ouvrage** (H-302) : la tige part du **centre** du support, du coffret ou du poste et passe **sous** le symbole ; elle est toujours assez longue pour que les barres sortent de l'ouvrage. Ouvrage sélectionné : la **poignée au bout des barres** fait **tourner la MALT autour de l'ouvrage** et règle sa longueur (pas de 15° avec l'accrochage angulaire). Orientation et longueur aussi dans la fiche. Les MALT déjà déplacées en v1.5.1 gardent leur direction, longueur remise en automatique.
2. **Revêtements** (H-303) : **Ricciata** et **Bi-couche** ajoutés.

## Modifier la charte ou la nomenclature
- Couleurs, tiretés, épaisseurs, dimensions des symboles, tailles de textes, hachures : uniquement `js/charte.js`.
- Descriptif (v1.5.0) : formats de phrase, abréviations de réseau, libellés de coffret, règles de fourniture, tailles et tolérance dans `js/charte.js` → `CHARTE.descriptif`.
- Nomenclature : remplacer `nomenclature.json` sur l'hébergement (et incrémenter `VERSION` dans `sw.js`), ou importer un fichier depuis la Bibliothèque sur la tablette.
