# Mémos par groupe — design

## Intention

Garder des notes rapides par projet (groupe) et y revenir en un clic, sans quitter l'onglet en cours.

## Décisions

1. Nouveau kind d'item `memo` (le kind `note` reste le lecteur Markdown). Plusieurs mémos par groupe, nom par défaut « Mémo », renommable.
2. Un mémo est toujours épinglé : pas d'action « Désépingler ». Fermer l'onglet le garde dans la sidebar ; au démarrage les onglets mémo sont fermés.
3. Formatage : gras, italique, souligné, barré, liste à puces (Tab / Shift+Tab pour les sous-niveaux). Raccourcis Ctrl+B/I/U, Ctrl+Shift+X, Ctrl+Shift+L.
4. Éditeur `contentEditable` sans dépendance. Le HTML est nettoyé à la lecture et au collage (`sanitizeMemo` : allowlist, aucun attribut).
5. Stockage : un fichier par mémo, `userData/memos/<id>.html`, écrit en tmp + rename. L'id est validé côté main.
6. Sauvegarde : debounce de 500 ms, flush au blur, au changement de mémo/onglet et avant la fermeture de l'app.
7. Couleur : l'onglet garde un fond uni ; la fenêtre flottante est teintée de la couleur du groupe (gris neutre sans couleur), avec l'en-tête dans la couleur pleine.
8. Fenêtre flottante interne à l'app, ouverte par l'entrée « Mémo » au-dessus de « Paramètres » : liste déroulante des mémos qui reprend la hiérarchie de la sidebar (en-tête de groupe teinté, mémos rattachés par le trait coloré, mémo courant surligné à la couleur du groupe), contenu, barre de styles, croix. Déplaçable par l'en-tête, redimensionnable par le coin, toujours bornée à la zone visible (recalée au resize). État persisté dans `workspace.json` (`memoFloat`).
9. L'onglet et la fenêtre flottante partagent le même cache (`memoSync`) : une frappe d'un côté apparaît de l'autre.

## Hors périmètre

Images, liens, titres, export, recherche dans les mémos, fenêtre OS séparée.
