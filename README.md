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

## Règles

1. L'écran d'accueil propose un bouton **Start** (et le choix du nombre de drapeaux).
2. Les drapeaux sont présentés un par un, dans un ordre mélangé.
3. Tu tapes le nom du pays et valides (bouton **Valider** ou touche **Entrée**).
   - **Bonne réponse** → le drapeau sort définitivement du paquet.
   - **Mauvaise réponse** → la bonne réponse s'affiche, et le drapeau est
     réinséré à une position aléatoire du paquet : il reviendra plus tard.
4. **Je ne sais pas** révèle la réponse et compte comme une erreur (le drapeau revient aussi).
5. La partie se termine quand le paquet est vide. L'écran final affiche le
   nombre de drapeaux trouvés du premier coup, le total d'erreurs, la durée,
   et la liste des drapeaux à revoir.

## Saisie des réponses

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
js/app.js          logique du jeu (paquet, comparaison, score)
dev-server.js      serveur statique optionnel
```

## Personnaliser

- **Ajouter un pays ou un synonyme** : une ligne dans `js/countries.js`.
  Le `code` est le code ISO 3166-1 alpha-2 utilisé par flagcdn.
- **Changer la position de réinsertion** d'un drapeau raté : fonction
  `requeueCurrent()` dans `js/app.js` (par défaut : au moins 3 rangs plus loin).
