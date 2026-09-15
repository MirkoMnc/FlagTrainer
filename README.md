# FlagTrainer

Petit jeu web pour apprendre à reconnaître les 195 drapeaux des pays du monde.

## Lancer le jeu

Double-clique sur `index.html` — c'est tout (HTML/CSS/JS, aucune dépendance).

Si ton navigateur bloque les fichiers locaux, un mini serveur est fourni :

```bash
node dev-server.js
```

puis ouvre http://localhost:5173.

> Les images des drapeaux sont chargées depuis [flagcdn.com](https://flagcdn.com) :
> une connexion internet est nécessaire.

## Trois modes de jeu

Le mode se choisit sur l'écran d'accueil.

| Mode | Comment on répond |
|---|---|
| **Réponse libre** | Tu tapes le nom du pays, puis **Entrée** (ou **Valider**). Un bouton **Je ne sais pas** révèle la réponse. |
| **QCM — 4 choix** | Quatre propositions, dont la bonne. Clic, ou touches **1** à **4**. La bonne réponse passe en vert, ton erreur en rouge. |
| **Carte** | Tu cliques sur le pays directement sur une carte du monde. Molette ou boutons **+ / −** pour zoomer, glisser pour déplacer, **⟲** pour revenir à la vue monde. En cas d'erreur, la carte se recadre sur la bonne réponse. |

En mode carte, les micro-États (Monaco, Singapour, Malte, îles du Pacifique…)
sont signalés par un petit cercle cliquable. La carte (≈ 1 Mo) n'est chargée
que la première fois que ce mode est lancé.

## Règles

1. L'écran d'accueil propose le mode, le nombre de drapeaux, et un bouton **Start**.
2. Les drapeaux sont présentés un par un, dans un ordre mélangé.
3. À chaque drapeau :
   - **Bonne réponse** → le drapeau sort définitivement du paquet.
   - **Mauvaise réponse** → la bonne réponse s'affiche, et le drapeau est
     réinséré à une position aléatoire du paquet : il reviendra plus tard.
     **Continuer** (ou **Entrée**) passe au suivant.
4. La partie se termine quand le paquet est vide. L'écran final affiche le
   nombre de drapeaux trouvés du premier coup, le total d'erreurs, la durée,
   et la liste des drapeaux à revoir.

## Classement local

Les 10 meilleures parties sont conservées **dans ton navigateur**
(`localStorage`) — rien n'est envoyé sur internet, et le classement ne suit pas
d'un appareil à l'autre.

- **Un classement par catégorie** : chaque combinaison mode × taille du paquet a
  le sien (QCM · 20 drapeaux, Réponse libre · tous les drapeaux, etc.).
- **Tri sur le nombre d'erreurs**, du plus petit au plus grand ; à égalité, la
  partie la plus rapide passe devant.
- L'écran d'accueil rappelle ton record pour le mode et la taille sélectionnés ;
  l'écran final met en évidence la partie que tu viens de jouer.
- Une partie **abandonnée n'est pas enregistrée**.
- Le bouton **Effacer ce classement** vide la catégorie affichée.

## Saisie des réponses (mode réponse libre)

La comparaison est souple :

- accents, majuscules, tirets et apostrophes ignorés (`cote d ivoire` = `Côte d’Ivoire`) ;
- article initial optionnel (`la France` = `France`) ;
- synonymes courants acceptés (`USA`, `Angleterre`, `RDC`, `Birmanie`/`Myanmar`, noms anglais…) ;
- petites fautes de frappe tolérées (`allemange` → Allemagne), **sauf** lorsque la
  faute rendrait la réponse ambiguë : `Niger`/`Nigeria`, `Iran`/`Irak`,
  `Zambie`/`Gambie`, `Mali`/`Malte` restent strictement distincts.

## Structure

```
index.html         écrans (accueil / jeu / résultats)
css/style.css      thème sombre, responsive
js/countries.js    les 195 pays : code ISO, nom français, synonymes
js/scores.js       classement local (localStorage), une liste par catégorie
js/map.js          carte interactive du mode Carte (zoom, clic, recadrage)
js/world-map-data.js  la carte SVG sous forme de chaîne JS, chargée à la demande
js/app.js          logique du jeu (paquet, modes, comparaison, score)
assets/world.svg   source de la carte (voir ci-dessous)
dev-server.js      serveur statique optionnel
```

## Carte du monde

La carte vient de [BlankMap-World.svg](https://commons.wikimedia.org/wiki/File:BlankMap-World.svg)
(Wikimedia Commons, domaine public). Chaque pays y est identifié par son code
ISO 3166-1 alpha-2, ce qui permet de faire le lien avec `js/countries.js`.

`assets/world.svg` est la version nettoyée (sans commentaires, sans feuille de
style et **sans les balises `<title>`** — elles afficheraient le nom du pays au
survol). `js/world-map-data.js` en est la copie sous forme de chaîne JS ; pour
la régénérer après modification du SVG :

```bash
node -e "const fs=require('fs');fs.writeFileSync('js/world-map-data.js','var WORLD_SVG = '+JSON.stringify(fs.readFileSync('assets/world.svg','utf8'))+';\n')"
```

## Personnaliser

- **Ajouter un pays ou un synonyme** : une ligne dans `js/countries.js`.
  Le `code` est le code ISO 3166-1 alpha-2 utilisé par flagcdn.
- **Changer la position de réinsertion** d'un drapeau raté : fonction
  `requeueCurrent()` dans `js/app.js` (par défaut : au moins 3 rangs plus loin).
