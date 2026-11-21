# LOWFO — carnet alimentaire Low FODMAP

PWA statique en français, sans compte ni service externe. Le journal, le profil nutritionnel, le menu et la liste de courses sont enregistrés dans IndexedDB sur l’appareil. Le catalogue public est séparé des données personnelles.

## Aperçu local

La PWA doit être servie depuis `localhost` ou une origine HTTPS. Depuis ce dossier, lancer `python3 -m http.server 8000`, puis ouvrir `http://localhost:8000`.

## Hébergement et installation mobile

La configuration `.github/workflows/deploy.yml` publie automatiquement l’application statique sur GitHub Pages après un push sur `main` (ou un lancement manuel du workflow). Elle ne publie que les fichiers nécessaires à l’application. Pages est activé avec la source **GitHub Actions**. Adresse publiée : https://kvillaeys-source.github.io/lowfo/.

Sur GitHub Free, GitHub Pages nécessite un dépôt public. Le site publié est accessible publiquement, même si le dépôt est privé sur une formule qui l’autorise. Le code de LOWFO et les recettes sont destinés à être publics; le journal, le profil, les symptômes et la liste de courses restent dans IndexedDB sur l’appareil et ne sont pas copiés vers GitHub. GitHub consigne les adresses IP des visiteurs pour la sécurité. GitHub Pages convient à ce site statique personnel, pas à un service SaaS ou à des transactions sensibles; voir les [limites GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Une fois l’adresse HTTPS publiée, l’installation se fait depuis le navigateur du téléphone : sur iPhone, Safari → Partager → **Ajouter à l’écran d’accueil**; sur Android, Chrome → menu → **Installer l’application** ou **Ajouter à l’écran d’accueil**. La même adresse doit être ouverte sur le téléphone avant l’installation. L’aperçu `localhost` et le site hébergé sont deux espaces de stockage distincts : les entrées déjà saisies dans l’aperçu ne seront pas transférées automatiquement. Exporter une sauvegarde depuis LOWFO avant de changer d’origine si des données doivent être conservées.

La PWA en ligne se mettra à jour hors ligne sur chaque appareil après son premier chargement. L’installation ajoute un raccourci/app web à l’écran d’accueil; elle ne passe pas par l’App Store ou Google Play.

## Bibliothèque active

`recipes.json` contient 50 recettes de deux portions : 5 petits-déjeuners, 22 déjeuners et 23 dîners. Aucune collation n’est incluse. Les recettes alimentent la bibliothèque, le menu intelligent et la synchronisation avec la liste de courses.

`food_catalog.json` contient 29 ingrédients, leurs préparations et quatre valeurs nutritionnelles Ciqual 2025 par 100 g (116 valeurs au total). Les valeurs sont attribuées à l’Anses et consultées via les miroirs de secours MyMealMaker et David Costa, car le portail Ciqual était indisponible. Les cellules « < x » sont conservées comme bornes supérieures et les traces ne sont pas comptées dans les totaux.

## Portée des repères Low FODMAP

Les fiches ont été construites à partir des ressources publiques Monash citées dans chacune d’elles, sans copier les entrées de l’application payante. La FAQ Monash confirme que plusieurs portions vertes peuvent être associées dans un repas; les quantités retenues restent celles qui sont sourcées dans les fiches. Les légumes sont pesés crus, jusqu’à 75 g par personne (65 g pour la courgette). Le riz est pesé sec pour les courses et les macros, puis servi cuit; les fiches retiennent 73 g secs, soit environ 190 g cuits avec un rendement indicatif de 2,6. Cette portion cuite est rapportée depuis [FODMAP Everyday](https://www.fodmapeveryday.com/recipes/no-fodmap-rice/) comme portion faible Monash; faute d’un chiffre public clairement accessible sur le site Monash pour le riz blanc, cette autre source documente ce repère. Les flocons d’avoine sont limités à 41,5 g par personne, moitié de la quantité de la recette publique [Monash Overnight Oats](https://www.monashfodmap.com/recipe/overnight-oats/). Les protéines sont nature, sans marinade ni mélange avec ail ou oignon.

Les ressources publiques sont indicatives et ne publient pas une portion chiffrée pour chaque ingrédient, notamment le fromage affiné. La bibliothèque est donc une pré-sélection documentaire basée sur ces sources publiques; elle ne prétend pas reproduire la vérification complète de l’application Monash ni une certification Monash ou une validation par diététicien. Les fiches détaillent la portée et les quantités dans la section « Voir le contrôle Low FODMAP et les sources ». Les sources et limites sont décrites dans [RECIPES-NUTRITION-SPEC.md](RECIPES-NUTRITION-SPEC.md).

## Nutrition et menu

Les macros sont calculées séparément des repères FODMAP à partir des données Ciqual 2025. Elles restent des estimations. Le menu hebdomadaire choisit les recettes disponibles pour les repas sélectionnés; avec trois repas et un profil adulte enregistré, il cherche une combinaison proche des estimations quotidiennes. Il ne modifie pas les quantités documentées des recettes.

## Données et sauvegarde

- Le journal et la liste de courses restent locaux à l’appareil.
- Le suivi digestif permet d’associer un ressenti aux repas enregistrés dans les 72 heures précédentes et affiche le délai observé. Cette association aide à tenir un journal; elle n’établit pas de causalité.
- Générer ou synchroniser un menu remplace uniquement les articles issus du menu précédent; les articles ajoutés à la main sont conservés.
- Une sauvegarde chiffrée exportée par l’utilisateur comprend le journal, le profil, les menus et les courses. L’application ne l’envoie pas automatiquement vers le cloud.
- Le profil nutritionnel reste modifiable et effaçable depuis le menu.

Les anciennes fiches de travail sont signalées comme remplacées par `recipes.json`; elles ne sont pas chargées par l’application. La PWA est publiée sur https://kvillaeys-source.github.io/lowfo/.
