# Bibliothèque LOWFO : recettes, sources et repères nutritionnels

## Objectif

La bibliothèque active contient 50 repas de deux portions : 5 petits-déjeuners, 22 déjeuners et 23 dîners, sans collations. Les recettes utilisent des ingrédients simples, des quantités affichées par personne, des étapes originales et des valeurs nutritionnelles calculées séparément des repères FODMAP.

Les fichiers chargés par l’application sont `recipes.json` et `food_catalog.json`. Les propositions antérieures sont archivées dans `RECIPE-IDEAS-PENDING-VALIDATION.md` et `RECIPE-CARDS-DRAFT.md`.

## Portée de la revue Low FODMAP

La première série vise la phase 1 et s’appuie sur les informations publiques Monash accessibles sans recopier les entrées de l’application Food Guide. Les sources utilisées sont le tableau public Step 1 de 2026, la liste publique de courses publiée en février 2025, l’aide sur les poids crus/cuits et des recettes publiques Monash servant de repères quantitatifs. Une source publique secondaire est utilisée lorsque le site ne donne pas clairement une portion chiffrée exploitable.

Le périmètre appliqué aux fiches est le suivant :

- Les portions de légumes restent à 75 g crus par personne; la courgette est limitée à 65 g. La liste publique Monash indique 75 g comme portion standard faible pour les légumes répertoriés; le tableau Step 1 donne 65 g pour la courgette.
- Le riz est une alternative céréalière citée dans le tableau Step 1. Les fiches comptent 73 g de riz sec par personne pour les courses et les macros; cela donne environ 190 g cuits avec un rendement indicatif de 2,6. L’aide Monash précise que le riz se mesure cuit pour évaluer les portions FODMAP. FODMAP Everyday rapporte 190 g de riz blanc cuit comme portion faible Monash; la recette publique Monash Nasi Goreng fournit un autre repère de portion de riz cuit.
- Les flocons d’avoine sont limités à 41,5 g par personne, moitié des 83 g utilisés dans la recette publique Overnight Oats pour deux portions.
- Viandes, poissons, crevettes et œufs sont nature, sans marinade, sauce composée ou assaisonnement à base d’ail/oignon. L’huile infusée à l’ail est décrite comme filtrée et sans morceaux. Les légumes et les portions restent listés avec leur préparation.
- L’emmental est un fromage à pâte dure, catégorie citée dans les alternatives publiques Step 1. Les fiches utilisent une petite quantité culinaire de 10 à 20 g; les sources publiques consultées ne donnent pas de seuil numérique propre à ce fromage.

Les sources publiques ne donnent pas la portion numérique complète pour chaque aliment. L’application Monash contient des portions plus détaillées. La bibliothèque LOWFO affiche donc une **pré-sélection documentaire fondée sur les ressources publiques citées**; elle ne prétend ni avoir contrôlé la base complète de l’application, ni être certifiée Monash, ni avoir été validée par un diététicien. La tolérance reste individuelle. Les fiches affichent cette portée ainsi que la preuve publique correspondante ingrédient par ingrédient.

Les portions vertes peuvent être associées dans un repas : la FAQ publique Monash le confirme, y compris pour des aliments contenant le même type de FODMAP. La bibliothèque évite les ingrédients explicitement écartés de ces listes, notamment ail et oignon, produits marinés, poivron rouge et champignons de Paris. Le nom d’un aliment absent d’une ressource publique n’est pas traité comme une preuve d’absence de FODMAP.

## Sources de données nutritionnelles

La table de référence est Ciqual 2025 de l’Anses, sous Licence Ouverte 2.0. Pendant l’indisponibilité des portails officiels, les valeurs ont été consultées sur deux miroirs accessibles : MyMealMaker, qui indique reprendre les tables Ciqual 2025 sous licence ouverte, et le tableau de 82 aliments David Costa/Yumia, qui attribue les valeurs à Ciqual 2025. Les fiches conservent les noms d’aliments, les états de préparation, la version et les liens de consultation.

`food_catalog.json` contient actuellement 29 ingrédients, 29 préparations et 116 valeurs nutritionnelles pour 100 g : énergie, protéines, glucides et lipides. Les valeurs notées « < x » par le miroir MyMealMaker sont conservées comme borne supérieure et présentées avec « ≤ ». Les traces sont distinguées et ne sont pas ajoutées aux totaux. Les macros affichées sont des estimations issues de données de référence, pas une analyse de laboratoire du plat.

Les sources Ciqual fournissent des données nutritionnelles, pas des mesures FODMAP. Aucun résultat FODMAP n’est calculé à partir des calories, protéines, glucides ou lipides.

## Format des données

`recipes.json` (schéma 2) contient pour chaque fiche :

- un identifiant, un nom, un type `breakfast`, `lunch` ou `dinner`, le nombre de portions, les durées, les étapes en français et des tags;
- une liste d’ingrédients liés à une fiche du catalogue, avec préparation, quantité totale, quantité par personne, libellés de courses, repère documentaire FODMAP et quatre identifiants nutritionnels;
- les citations nutritionnelles, la portée de la revue FODMAP, les sources publiques de référence, le rôle de curation et la date de revue.

`fodmap_review_basis` accepte trois voies : `ingredient_measurements` pour des mesures quantitatives FODMAP réutilisables; `external_food_guide` pour une attestation de vérification externe à la portion précise; et `public_sources` pour la pré-sélection actuelle fondée sur les ressources publiques citées. La dernière voie n’importe aucune fiche ni mesure de l’application Monash.

`food_catalog.json` décrit les sources, les aliments, leurs préparations et les quatre nutriments par 100 g. Les évaluations FODMAP quantitatives restent vides : les repères de cette série sont documentés au niveau des recettes et liés à leurs sources publiques, sans créer de fausses mesures de laboratoire.

## Menu et portions

Le menu intelligent ne choisit que les fiches publiées et documentées du type correspondant au créneau. Les quantités ne changent pas selon le profil nutritionnel. Pour trois repas planifiés et un profil enregistré, le générateur compare les totaux nutritionnels estimés aux repères journaliers; un ou deux repas ne sont pas comparés à une journée complète. La liste de courses reprend les quantités totales de chaque recette sélectionnée et fusionne les ingrédients communs.

La quantité totale d’achat et la quantité nutritionnelle concordent par personne. Pour le riz, le poids sec est conservé dans la fiche et dans les calculs nutritionnels; une note distincte donne le rendement cuit indicatif pour lire le repère FODMAP. Pour les légumes, le poids indiqué est cru, avant cuisson.

## Sources citées

- Anses, [Ciqual 2025](https://doi.org/10.57745/RDMHWY), référence nutritionnelle et Licence Ouverte 2.0.
- [MyMealMaker — table Ciqual 2025](https://mymealmaker.com/blog/table-ciqual), miroir de consultation et de secours.
- [David Costa / Yumia — tableau de 82 aliments d’après Ciqual 2025](https://davidcosta.fr/tableau-des-calories-des-aliments/), miroir de consultation et de secours.
- Monash, [Low FODMAP swaps — Step 1 (2026)](https://monashfodmap.com/documents/207/Monash_FODMAP_Resource_-_Step_1_Low_FODMAP_Diet.pdf).
- Monash, [FAQ — plusieurs portions vertes au même repas](https://www.monashfodmap.com/about-fodmap-and-ibs/frequently-asked-questions/).
- Monash, [Low FODMAP Shopping List (2025)](https://www.monashfodmap.com/blog/low-fodmap-shopping-list/).
- Monash, [aide sur les portions et les poids crus/cuits](https://www.monashfodmap.com/get-app-help/).
- FODMAP Everyday, [No FODMAP Rice](https://www.fodmapeveryday.com/recipes/no-fodmap-rice/), source publique secondaire rapportant la portion de 190 g de riz blanc cuit.
- Monash, [Overnight Oats](https://www.monashfodmap.com/recipe/overnight-oats/) et [Nasi Goreng](https://monashfodmap.com/documents/26/Monash_FODMAP_-_Low_FODMAP_Nasi_Goreng.pdf), utilisées uniquement comme repères quantitatifs publics; les fiches LOWFO sont rédigées indépendamment.
