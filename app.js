const DB_NAME = "lowfo-local";
const DB_VERSION = 4;
const STORE_NAME = "journalEntries";
const SHOPPING_STORE = "shoppingItems";
const MENU_STORE = "weeklyMenus";
const PROFILE_STORE = "nutritionProfile";
const BACKUP_FORMAT = "lowfo-encrypted-backup";
const BACKUP_VERSION = 1;
const BACKUP_ITERATIONS = 310000;
const LAST_BACKUP_KEY = "lowfo:lastBackupAt";

const symptomLabels = {
  abdominal_pain: "Douleur abdominale",
  bloating: "Ballonnements",
  gas: "Gaz",
  diarrhoea: "Diarrhée",
  constipation: "Constipation",
  nausea: "Nausées",
  urgency: "Urgence intestinale",
  other: "Autre ressenti"
};

const views = ["home", "recipes", "menu", "shopping", "entry", "journal", "digestive", "phases", "backup"];
let database;
let recipeLibrary = [];
let foodCatalog = null;
let nutritionProfile = null;
let catalogIndexes = null;
let currentMenu = null;
let activeFilter = "all";
let noticeTimer;
let journalEntriesById = new Map();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Le stockage local n’est pas disponible dans ce navigateur."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("occurredAt", "occurredAt", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
      if (!db.objectStoreNames.contains(SHOPPING_STORE)) {
        const store = db.createObjectStore(SHOPPING_STORE, { keyPath: "id" });
        store.createIndex("checked", "checked", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(MENU_STORE)) {
        db.createObjectStore(MENU_STORE, { keyPath: "weekStart" });
      }
      if (!db.objectStoreNames.contains(PROFILE_STORE)) {
        db.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le journal local."));
    request.onblocked = () => reject(new Error("Fermez les autres onglets LOWFO puis réessayez."));
  });
}

function transactionStore(mode = "readonly") {
  if (!database) throw new Error("Le journal local n’est pas prêt.");
  return database.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function transactionShoppingStore(mode = "readonly") {
  if (!database) throw new Error("Le stockage local n’est pas prêt.");
  return database.transaction(SHOPPING_STORE, mode).objectStore(SHOPPING_STORE);
}

function getWeeklyMenu(weekStart) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(MENU_STORE, "readonly").objectStore(MENU_STORE).get(weekStart);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Impossible de lire ce menu."));
  });
}

function getWeeklyMenus() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(MENU_STORE, "readonly").objectStore(MENU_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Impossible de lire les menus enregistrés."));
  });
}

function saveWeeklyMenu(menu) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MENU_STORE, "readwrite");
    transaction.objectStore(MENU_STORE).put(menu);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’enregistrer le menu."));
    transaction.onabort = () => reject(transaction.error || new Error("L’enregistrement du menu a été interrompu."));
  });
}

function getNutritionProfile() {
  return new Promise((resolve, reject) => {
    const request = database.transaction(PROFILE_STORE, "readonly").objectStore(PROFILE_STORE).get("current");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Impossible de lire le profil nutritionnel local."));
  });
}

function saveNutritionProfile(profile) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROFILE_STORE, "readwrite");
    transaction.objectStore(PROFILE_STORE).put(profile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’enregistrer le profil nutritionnel."));
    transaction.onabort = () => reject(transaction.error || new Error("L’enregistrement du profil a été interrompu."));
  });
}

function deleteNutritionProfile() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROFILE_STORE, "readwrite");
    transaction.objectStore(PROFILE_STORE).delete("current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’effacer le profil nutritionnel."));
    transaction.onabort = () => reject(transaction.error || new Error("La suppression du profil a été interrompue."));
  });
}

function getEntries() {
  return new Promise((resolve, reject) => {
    const request = transactionStore().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Impossible de lire le journal."));
  });
}

function saveEntry(entry) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(entry);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’enregistrer cette entrée."));
    transaction.onabort = () => reject(transaction.error || new Error("L’enregistrement a été interrompu."));
  });
}

function deleteEntry(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible de supprimer cette entrée."));
    transaction.onabort = () => reject(transaction.error || new Error("La suppression a été interrompue."));
  });
}

function getShoppingItems() {
  return new Promise((resolve, reject) => {
    const request = transactionShoppingStore().getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Impossible de lire la liste de courses."));
  });
}

function saveShoppingItem(item) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_STORE, "readwrite");
    transaction.objectStore(SHOPPING_STORE).add(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’ajouter cet article."));
    transaction.onabort = () => reject(transaction.error || new Error("L’ajout a été interrompu."));
  });
}

function updateShoppingItem(item) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_STORE, "readwrite");
    transaction.objectStore(SHOPPING_STORE).put(item);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible de modifier cet article."));
    transaction.onabort = () => reject(transaction.error || new Error("La modification a été interrompue."));
  });
}

function deleteShoppingItem(id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_STORE, "readwrite");
    transaction.objectStore(SHOPPING_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible de supprimer cet article."));
    transaction.onabort = () => reject(transaction.error || new Error("La suppression a été interrompue."));
  });
}

function mergeEntries(entries) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      const lookup = store.get(entry.id);
      lookup.onsuccess = () => {
        if (!lookup.result) store.add(entry);
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’ajouter les entrées restaurées."));
    transaction.onabort = () => reject(transaction.error || new Error("La restauration a été interrompue."));
  });
}

function mergeShoppingItems(items) {
  if (!items.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_STORE, "readwrite");
    const store = transaction.objectStore(SHOPPING_STORE);
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const lookup = store.get(item.id);
      lookup.onsuccess = () => {
        if (!lookup.result) store.add(item);
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’ajouter les articles restaurés."));
    transaction.onabort = () => reject(transaction.error || new Error("La restauration des articles a été interrompue."));
  });
}

function mergeWeeklyMenus(menus) {
  if (!menus.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MENU_STORE, "readwrite");
    const store = transaction.objectStore(MENU_STORE);
    const seen = new Set();
    for (const menu of menus) {
      if (seen.has(menu.weekStart)) continue;
      seen.add(menu.weekStart);
      const lookup = store.get(menu.weekStart);
      lookup.onsuccess = () => {
        if (!lookup.result) store.add(menu);
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible d’ajouter les menus restaurés."));
    transaction.onabort = () => reject(transaction.error || new Error("La restauration des menus a été interrompue."));
  });
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((byte, index) => `${[4, 6, 8, 10].includes(index) ? "-" : ""}${byte.toString(16).padStart(2, "0")}`).join("");
}

function showNotice(message, isError = false) {
  const notice = $("#appNotice");
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.toggle("is-error", isError);
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.hidden = true; }, 6500);
}

function formatDate(value, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function formatElapsedSinceMeal(mealAt, symptomAt) {
  const minutes = Math.max(0, Math.round((new Date(symptomAt) - new Date(mealAt)) / 60000));
  if (minutes < 60) return `${minutes} min avant`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes ? `${hours} h ${remainingMinutes} min avant` : `${hours} h avant`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} j ${remainingHours} h avant` : `${days} j avant`;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

const fodmapFamilies = new Set(["excess_fructose", "lactose", "fructans", "GOS", "sorbitol", "mannitol"]);
const nutrientKinds = new Set(["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"]);
const fodmapFamilyLabels = {
  excess_fructose: "Fructose en excès",
  lactose: "Lactose",
  fructans: "Fructanes",
  GOS: "GOS",
  sorbitol: "Sorbitol",
  mannitol: "Mannitol"
};
const nutrientLabels = { energy_kcal: "Énergie", protein_g: "Protéines", carbohydrate_g: "Glucides", fat_g: "Lipides" };

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueIndex(rows, keyName) {
  const index = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    if (!row || !hasText(row[keyName])) continue;
    const key = row[keyName];
    if (index.has(key)) duplicates.add(key);
    else index.set(key, row);
  }
  duplicates.forEach(key => index.delete(key));
  return index;
}

function sourceKeysAreReusable(keys, sources) {
  return Array.isArray(keys) && keys.length > 0 && keys.every(key => {
    const source = sources.get(key);
    if (!source || source.record_status !== "published" || source.reuse_status !== "allowed" || !hasText(source.title) || !hasText(source.url) || !hasText(source.reuse_basis)) return false;
    try { return new URL(source.url).protocol === "https:"; }
    catch { return false; }
  });
}

function sourceKeysAreCitable(keys, sources) {
  return Array.isArray(keys) && keys.length > 0 && keys.every(key => {
    const source = sources.get(key);
    if (!source || source.record_status !== "published" || !hasText(source.title) || !hasText(source.url)) return false;
    try { return new URL(source.url).protocol === "https:"; }
    catch { return false; }
  });
}

function indexFoodCatalog(data) {
  const sources = uniqueIndex(data.data_sources, "source_key");
  const ingredients = uniqueIndex(data.ingredients, "ingredient_key");
  const preparations = uniqueIndex(data.ingredient_preparations, "preparation_id");
  const fodmapAssessments = uniqueIndex(data.fodmap_portion_assessments, "assessment_id");
  const nutrientValues = uniqueIndex(data.nutrient_values, "nutrient_value_id");
  for (const [key, row] of ingredients) {
    if (!hasText(row.name_fr) || row.record_status !== "published" || !sourceKeysAreReusable(row.source_keys, sources)) ingredients.delete(key);
  }
  for (const [key, row] of preparations) {
    if (!ingredients.has(row.ingredient_key) || row.record_status !== "published" || !hasText(row.preparation_fr) || !hasText(row.citation_locator) || !sourceKeysAreReusable(row.source_keys, sources)) preparations.delete(key);
  }
  for (const [key, row] of fodmapAssessments) {
    const prep = preparations.get(row.preparation_id);
    if (!prep || row.ingredient_key !== prep.ingredient_key || !fodmapFamilies.has(row.family) || !["low", "not_detected"].includes(row.assessment_status) || row.review_status !== "verified" || row.record_status !== "published" || !Number.isFinite(row.tested_portion_g) || row.tested_portion_g <= 0 || !hasText(row.citation_locator) || !sourceKeysAreReusable([row.source_key], sources)) fodmapAssessments.delete(key);
  }
  for (const [key, row] of nutrientValues) {
    const prep = preparations.get(row.preparation_id);
    if (!prep || row.ingredient_key !== prep.ingredient_key || !nutrientKinds.has(row.nutrient) || row.review_status !== "verified" || row.record_status !== "published" || !Number.isFinite(row.value) || row.value < 0 || !Number.isFinite(row.reference_amount_g) || row.reference_amount_g <= 0 || !hasText(row.citation_locator) || !sourceKeysAreReusable([row.source_key], sources)) nutrientValues.delete(key);
  }
  return { sources, ingredients, preparations, fodmapAssessments, nutrientValues };
}

function isMenuReadyRecipe(recipe) {
  if (!catalogIndexes || !recipe || !hasText(recipe.recipe_key) || !hasText(recipe.name_fr) || !["breakfast", "lunch", "dinner"].includes(recipe.meal_type)) return false;
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.record_status !== "published" || recipe.review_status !== "verified" || recipe.fodmap_review_status !== "verified" || recipe.reuse_status !== "allowed") return false;
  const reviewBasis = recipe.fodmap_review_basis || "ingredient_measurements";
  if (!["ingredient_measurements", "external_food_guide", "public_sources"].includes(reviewBasis)) return false;
  if (reviewBasis === "public_sources" && !hasText(recipe.fodmap_scope_notice_fr)) return false;
  if (!sourceKeysAreReusable(recipe.source_keys, catalogIndexes.sources) || !sourceKeysAreCitable(recipe.fodmap_review_source_keys, catalogIndexes.sources) || !hasText(recipe.citation_locator) || !hasText(recipe.fodmap_review_citation_locator) || !hasText(recipe.fodmap_reviewer_role) || !hasText(recipe.fodmap_reviewed_at) || Number.isNaN(new Date(recipe.fodmap_reviewed_at).getTime())) return false;
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0 || !Array.isArray(recipe.instructions_fr) || recipe.instructions_fr.length === 0 || !recipe.instructions_fr.every(step => hasText(step))) return false;
  return recipe.ingredients.every(ingredient => {
    const food = catalogIndexes.ingredients.get(ingredient?.ingredient_key);
    const prep = catalogIndexes.preparations.get(ingredient?.preparation_id);
    if (!food || !prep || prep.ingredient_key !== food.ingredient_key || !Number.isFinite(ingredient.amount_g_per_serving) || ingredient.amount_g_per_serving <= 0 || !Number.isFinite(ingredient.amount_g_per_recipe) || ingredient.amount_g_per_recipe <= 0 || Math.abs((ingredient.amount_g_per_recipe / recipe.servings) - ingredient.amount_g_per_serving) > 0.01 || !hasText(ingredient.quantity_label_fr) || ingredient.quantity_label_fr.length > 100 || !hasText(ingredient.quantity_label_per_serving_fr) || ingredient.quantity_label_per_serving_fr.length > 100) return false;
    if (reviewBasis === "public_sources" && !hasText(ingredient.fodmap_evidence_fr)) return false;
    if (!Array.isArray(ingredient.nutrient_value_ids) || ingredient.nutrient_value_ids.length !== nutrientKinds.size) return false;
    if (reviewBasis === "external_food_guide" || reviewBasis === "public_sources") {
      if (!Array.isArray(ingredient.fodmap_assessment_ids) || ingredient.fodmap_assessment_ids.length !== 0) return false;
    } else {
      if (!Array.isArray(ingredient.fodmap_assessment_ids) || ingredient.fodmap_assessment_ids.length === 0) return false;
      const assessments = ingredient.fodmap_assessment_ids.map(id => catalogIndexes.fodmapAssessments.get(id));
      if (assessments.some(row => !row || row.ingredient_key !== food.ingredient_key || row.preparation_id !== prep.preparation_id || row.tested_portion_g < ingredient.amount_g_per_serving)) return false;
      if (![...fodmapFamilies].every(family => assessments.some(row => row.family === family))) return false;
    }
    const values = ingredient.nutrient_value_ids.map(id => catalogIndexes.nutrientValues.get(id));
    return values.every(row => row && row.ingredient_key === food.ingredient_key && row.preparation_id === prep.preparation_id) && new Set(values.map(row => row.nutrient)).size === nutrientKinds.size;
  });
}

async function loadRecipeLibrary() {
  const [recipeResponse, catalogResponse] = await Promise.all([fetch("./recipes.json"), fetch("./food_catalog.json")]);
  if (!recipeResponse.ok) throw new Error("Impossible de charger la bibliothèque de recettes.");
  if (!catalogResponse.ok) throw new Error("Impossible de charger le catalogue alimentaire documenté.");
  const [recipeData, catalogData] = await Promise.all([recipeResponse.json(), catalogResponse.json()]);
  if (recipeData?.schema_version !== 2 || !Array.isArray(recipeData.recipes)) throw new Error("Le fichier de recettes ne respecte pas le format attendu.");
  if (catalogData?.schema_version !== 1 || !Array.isArray(catalogData.data_sources) || !Array.isArray(catalogData.ingredients) || !Array.isArray(catalogData.ingredient_preparations) || !Array.isArray(catalogData.nutrient_values) || !Array.isArray(catalogData.fodmap_portion_assessments)) throw new Error("Le catalogue alimentaire ne respecte pas le format attendu.");
  foodCatalog = catalogData;
  catalogIndexes = indexFoodCatalog(catalogData);
  recipeLibrary = recipeData.recipes.filter(isMenuReadyRecipe);
  renderRecipeLibrary();
}

function getCatalogIngredient(ingredient) {
  return catalogIndexes.ingredients.get(ingredient.ingredient_key);
}

function calculateRecipeNutrition(recipe) {
  const totals = { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 };
  const upperBounds = { energy_kcal: false, protein_g: false, carbohydrate_g: false, fat_g: false };
  for (const ingredient of recipe.ingredients) {
    for (const valueId of ingredient.nutrient_value_ids) {
      const value = catalogIndexes.nutrientValues.get(valueId);
      totals[value.nutrient] += value.value * ingredient.amount_g_per_serving / value.reference_amount_g;
      if (value.value_qualifier === "upper_bound") upperBounds[value.nutrient] = true;
    }
  }
  return { ...totals, upperBounds };
}

function formatNutrient(value, unit) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: unit === "kcal" ? 0 : 1 }).format(value)} ${unit}`;
}

function appendCitationLink(container, sourceKey, locator) {
  const source = catalogIndexes.sources.get(sourceKey);
  if (!source) return;
  const link = document.createElement("a");
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = `${source.title}${locator ? ` — ${locator}` : ""}`;
  container.append(link);
}

function calculateNutritionTargets(profile) {
  const sexAdjustment = profile.sexCoefficient === "male" ? 5 : -161;
  const restingEnergy = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.ageYears) + sexAdjustment;
  const energyKcal = Math.round((restingEnergy * profile.activityPal) / 50) * 50;
  const roundFive = value => Math.round(value / 5) * 5;
  return {
    energyKcal,
    proteinG: roundFive(profile.weightKg * 0.83),
    carbohydrateMinG: roundFive((energyKcal * 0.45) / 4),
    carbohydrateMaxG: roundFive((energyKcal * 0.60) / 4),
    fatMinG: roundFive((energyKcal * 0.20) / 9),
    fatMaxG: roundFive((energyKcal * 0.35) / 9)
  };
}

function renderNutritionProfile() {
  const result = $("#nutritionTargets");
  if (!nutritionProfile) {
    result.hidden = true;
    return;
  }
  $("#profileAge").value = nutritionProfile.ageYears;
  $("#profileHeight").value = nutritionProfile.heightCm;
  $("#profileWeight").value = nutritionProfile.weightKg;
  $("#profileSexCoefficient").value = nutritionProfile.sexCoefficient;
  $("#profileActivity").value = String(nutritionProfile.activityPal);
  const targets = calculateNutritionTargets(nutritionProfile);
  result.replaceChildren();
  result.append(textElement("h3", "", "Repères journaliers estimés"));
  result.append(textElement("p", "", `Énergie d’entretien : environ ${formatNutrient(targets.energyKcal, "kcal")}.`));
  result.append(textElement("p", "", `Protéines : ${formatNutrient(targets.proteinG, "g/j")} (repère populationnel EFSA de 0,83 g/kg/j).`));
  result.append(textElement("p", "", `Glucides : ${formatNutrient(targets.carbohydrateMinG, "g/j")} à ${formatNutrient(targets.carbohydrateMaxG, "g/j")} · Lipides : ${formatNutrient(targets.fatMinG, "g/j")} à ${formatNutrient(targets.fatMaxG, "g/j")}.`));
  result.append(textElement("p", "field-hint", "Les plages de glucides et de lipides sont des repères de répartition énergétique ; elles ne forment pas une prescription combinée. L’équation estime une moyenne, pas la dépense réelle de chaque personne."));
  result.hidden = false;
}

function wireNutritionProfile() {
  $("#nutritionProfileForm").addEventListener("submit", async event => {
    event.preventDefault();
    const profile = {
      id: "current",
      ageYears: Number($("#profileAge").value),
      heightCm: Number($("#profileHeight").value),
      weightKg: Number($("#profileWeight").value),
      sexCoefficient: $("#profileSexCoefficient").value,
      activityPal: Number($("#profileActivity").value),
      updatedAt: new Date().toISOString()
    };
    if (!validateNutritionProfile(profile)) {
      showNotice("Vérifiez les valeurs du profil : cette estimation est limitée aux adultes de 19 à 78 ans et aux champs indiqués.", true);
      return;
    }
    const button = $("#nutritionProfileForm button[type='submit']");
    setBusy(button, true);
    try {
      await saveNutritionProfile(profile);
      nutritionProfile = profile;
      renderNutritionProfile();
      showNotice("Repères estimés et enregistrés sur cet appareil.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });
  $("#clearNutritionProfile").addEventListener("click", async event => {
    setBusy(event.currentTarget, true);
    try {
      await deleteNutritionProfile();
      nutritionProfile = null;
      $("#nutritionProfileForm").reset();
      $("#profileActivity").value = "1.6";
      renderNutritionProfile();
      showNotice("Le profil nutritionnel local a été effacé.");
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(event.currentTarget, false);
    }
  });
}

async function loadNutritionProfile() {
  nutritionProfile = await getNutritionProfile();
  if (nutritionProfile && !validateNutritionProfile(nutritionProfile)) {
    await deleteNutritionProfile();
    nutritionProfile = null;
  }
  renderNutritionProfile();
}

function createRecipeCard(recipe) {
  const card = document.createElement("article");
  card.className = "recipe-card";
  card.append(textElement("h2", "", recipe.name_fr));
  const sourceLine = textElement("p", "recipe-meta", `${recipe.servings} portion${recipe.servings > 1 ? "s" : ""} · Source${recipe.source_keys.length > 1 ? "s" : ""} : `);
  recipe.source_keys.forEach((sourceKey, index) => {
    if (index) sourceLine.append(document.createTextNode(" · "));
    appendCitationLink(sourceLine, sourceKey, recipe.citation_locator);
  });
  card.append(sourceLine);
  const nutrition = calculateRecipeNutrition(recipe);
  const nutrientText = (kind, unit) => (nutrition.upperBounds[kind] ? "≤" : "") + formatNutrient(nutrition[kind], unit);
  card.append(textElement("p", "recipe-meta", "Estimation par portion · " + nutrientText("energy_kcal", "kcal") + " · protéines " + nutrientText("protein_g", "g") + " · glucides " + nutrientText("carbohydrate_g", "g") + " · lipides " + nutrientText("fat_g", "g")));
  const ingredients = document.createElement("ul");
  ingredients.className = "recipe-ingredients";
  recipe.ingredients.forEach(ingredient => {
    const food = getCatalogIngredient(ingredient);
    ingredients.append(textElement("li", "", `${ingredient.quantity_label_fr} — ${food.name_fr}`));
  });
  card.append(ingredients);
  if (recipe.seasoning_note_fr) card.append(textElement("p", "recipe-meta", recipe.seasoning_note_fr));
  const details = document.createElement("details");
  details.append(textElement("summary", "", "Préparation"));
  const steps = document.createElement("ol");
  recipe.instructions_fr.forEach(step => steps.append(textElement("li", "", step)));
  details.append(steps);
  card.append(details);
  const evidence = document.createElement("details");
  evidence.className = "recipe-evidence";
  evidence.append(textElement("summary", "", "Voir la vérification Low FODMAP et les sources"));
  const reviewLine = textElement("p", "recipe-meta", `Revue de la recette entière : ${recipe.fodmap_reviewer_role}, ${formatDate(recipe.fodmap_reviewed_at, false)} · `);
  recipe.fodmap_review_source_keys.forEach((sourceKey, index) => {
    if (index) reviewLine.append(document.createTextNode(" · "));
    appendCitationLink(reviewLine, sourceKey, recipe.fodmap_review_citation_locator);
  });
  evidence.append(reviewLine);
  if ((recipe.fodmap_review_basis || "ingredient_measurements") === "public_sources") {
    evidence.append(textElement("p", "recipe-meta", recipe.fodmap_scope_notice_fr || "Contrôle documentaire fondé sur les ressources publiques citées; ce n’est pas une certification."));
  } else if ((recipe.fodmap_review_basis || "ingredient_measurements") === "external_food_guide") {
    evidence.append(textElement("p", "recipe-meta", "Pour la phase de restriction : chaque ingrédient, sa préparation et sa portion par personne ont été vérifiés par la personne indiquée auprès du guide alimentaire cité. LOWFO conserve la revue et sa référence, sans recopier les mesures ni les fiches de cette base. Cette vérification n’est pas une certification Monash."));
  }
  const evidenceList = document.createElement("ul");
  for (const ingredient of recipe.ingredients) {
    const food = getCatalogIngredient(ingredient);
    const item = document.createElement("li");
    item.append(textElement("p", "", `${food.name_fr} — portion recette : ${formatNutrient(ingredient.amount_g_per_serving, "g/personne")}`));
    if ((recipe.fodmap_review_basis || "ingredient_measurements") === "public_sources") {
      item.append(textElement("p", "recipe-meta", ingredient.fodmap_evidence_fr || "Ingrédient contrôlé à partir des ressources publiques citées."));
    } else if ((recipe.fodmap_review_basis || "ingredient_measurements") === "external_food_guide") {
      item.append(textElement("p", "recipe-meta", "Préparation et portion incluses dans la revue de la recette entière."));
    } else {
      const assessmentList = document.createElement("ul");
      const assessments = ingredient.fodmap_assessment_ids.map(id => catalogIndexes.fodmapAssessments.get(id));
      for (const family of fodmapFamilies) {
        const assessment = assessments.find(row => row.family === family);
        const row = document.createElement("li");
        const status = assessment.assessment_status === "low" ? "bas" : "non détecté";
        row.append(document.createTextNode(`${fodmapFamilyLabels[family]} : ${status} à ${formatNutrient(assessment.tested_portion_g, "g")} · `));
        appendCitationLink(row, assessment.source_key, assessment.citation_locator);
        assessmentList.append(row);
      }
      item.append(assessmentList);
    }
    const nutrientList = document.createElement("ul");
    for (const valueId of ingredient.nutrient_value_ids) {
      const value = catalogIndexes.nutrientValues.get(valueId);
      const row = document.createElement("li");
      const unit = value.nutrient === "energy_kcal" ? "kcal" : "g";
      const displayedValue = value.value_qualifier === "trace" ? "traces" : (value.value_qualifier === "upper_bound" ? "≤" : "") + formatNutrient(value.value, unit);
      row.append(document.createTextNode(nutrientLabels[value.nutrient] + " : " + displayedValue + " / " + formatNutrient(value.reference_amount_g, "g") + " · "));
      appendCitationLink(row, value.source_key, value.citation_locator);
      nutrientList.append(row);
    }
    item.append(textElement("p", "recipe-meta", "Données nutritionnelles de référence"), nutrientList);
    evidenceList.append(item);
  }
  evidence.append(evidenceList);
  evidence.append(textElement("p", "recipe-meta", "Nutrition estimée à partir de Ciqual 2025. Quand Ciqual publie une valeur « < x », la borne x est conservée et affichée avec ≤; les traces ne sont pas ajoutées au total. Les macros restent des estimations."));
  card.append(evidence);
  return card;
}

function renderRecipeLibrary() {
  const emptyState = $("#recipeEmptyState");
  const list = $("#recipeList");
  $("#recipeCount").textContent = recipeLibrary.length
    ? `${recipeLibrary.length} recette${recipeLibrary.length > 1 ? "s" : ""} disponible${recipeLibrary.length > 1 ? "s" : ""}.`
    : "Aucune recette publiée pour le moment.";
  emptyState.hidden = recipeLibrary.length > 0;
  list.hidden = recipeLibrary.length === 0;
  list.replaceChildren();
  const sortedRecipes = [...recipeLibrary].sort((a, b) => a.name_fr.localeCompare(b.name_fr, "fr", { sensitivity: "base", numeric: true }));
  for (const recipe of sortedRecipes) list.append(createRecipeCard(recipe));
}

function createEntryCard(entry, allowDelete = true) {
  const card = document.createElement("article");
  card.className = "entry-card";
  card.dataset.kind = entry.kind;

  const symbol = textElement("span", "entry-symbol", entry.kind === "meal" ? "🍽" : "◌");
  symbol.setAttribute("aria-hidden", "true");
  const content = document.createElement("div");
  const title = entry.kind === "meal" ? "Repas" : (symptomLabels[entry.symptomCode] || "Ressenti");
  content.append(textElement("p", "entry-title", title));
  if (entry.kind === "meal") {
    content.append(textElement("p", "entry-detail", entry.description));
    if (entry.amount) content.append(textElement("p", "entry-detail", `Quantité : ${entry.amount}`));
  } else if (entry.intensity !== null && entry.intensity !== undefined) {
    content.append(textElement("p", "entry-detail", `Intensité ressentie : ${entry.intensity}/10`));
  }
  if (entry.kind === "symptom" && Array.isArray(entry.relatedMeals) && entry.relatedMeals.length) {
    const mealList = document.createElement("ul");
    mealList.className = "related-meal-list";
    for (const meal of entry.relatedMeals) {
      const item = document.createElement("li");
      item.append(textElement("span", "", `${meal.description} — ${formatElapsedSinceMeal(meal.occurredAt, entry.occurredAt)}`));
      if (meal.amount) item.append(textElement("small", "entry-detail", `Quantité : ${meal.amount}`));
      mealList.append(item);
    }
    content.append(textElement("p", "entry-detail related-meal-heading", "Repas précédent(s) rapproché(s) :"), mealList);
  }
  const time = textElement("time", "entry-time", formatDate(entry.occurredAt));
  time.dateTime = entry.occurredAt;
  card.append(symbol, content, time);

  if (allowDelete) {
    const remove = textElement("button", "delete-entry", "Supprimer");
    remove.type = "button";
    remove.setAttribute("aria-label", `Supprimer l’entrée : ${title}, ${formatDate(entry.occurredAt)}`);
    remove.addEventListener("click", async () => {
      if (!window.confirm("Supprimer cette entrée du journal sur cet appareil ?")) return;
      try {
        await deleteEntry(entry.id);
        await refreshViews();
        showNotice("L’entrée a été supprimée de ce navigateur.");
      } catch (error) {
        showNotice(error.message, true);
      }
    });
    card.append(remove);
  }
  return card;
}

function renderEntries(container, entries, emptyMessage, allowDelete = true) {
  container.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.append(textElement("p", "", emptyMessage));
    container.append(empty);
    return;
  }
  entries.forEach(entry => container.append(createEntryCard(entry, allowDelete)));
}

function createShoppingItemCard(item) {
  const card = document.createElement("article");
  card.className = `shopping-item${item.checked ? " is-checked" : ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.checked;
  checkbox.setAttribute("aria-label", `${item.checked ? "Marquer comme à acheter" : "Marquer comme acheté"} : ${item.name}`);
  checkbox.addEventListener("change", async () => {
    try {
      await updateShoppingItem({ ...item, checked: checkbox.checked });
      await refreshViews();
    } catch (error) {
      checkbox.checked = item.checked;
      showNotice(error.message, true);
    }
  });

  const copy = document.createElement("div");
  copy.className = "shopping-item-copy";
  copy.append(textElement("span", "shopping-item-name", item.name));
  if (item.quantity) copy.append(textElement("span", "shopping-item-quantity", item.quantity));
  if (item.source === "menu") copy.append(textElement("span", "shopping-item-source", "Depuis le menu"));

  const remove = textElement("button", "shopping-remove", "Supprimer");
  remove.type = "button";
  remove.setAttribute("aria-label", `Supprimer ${item.name} de la liste de courses`);
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Supprimer « ${item.name} » de la liste ?`)) return;
    try {
      await deleteShoppingItem(item.id);
      await refreshViews();
      showNotice("Article supprimé de la liste de courses.");
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  card.append(checkbox, copy, remove);
  return card;
}

function renderShoppingItems(items) {
  const container = $("#shoppingItems");
  const ordered = [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || new Date(b.createdAt) - new Date(a.createdAt));
  const remaining = items.filter(item => !item.checked).length;
  $("#shoppingCount").textContent = `${remaining} ${remaining > 1 ? "articles à acheter" : "article à acheter"}`;
  container.replaceChildren();
  if (!ordered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.append(textElement("p", "", "Votre liste est vide. Ajoutez les articles dont vous avez besoin."));
    container.append(empty);
    return;
  }
  ordered.forEach(item => container.append(createShoppingItemCard(item)));
}

function localDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function menuWeekStart() {
  const inputValue = $("#menuWeekOf").value;
  const selectedDate = inputValue ? new Date(`${inputValue}T12:00:00`) : new Date();
  const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 12);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function getMenuSlotTypes(count = $("#mealsPerDay").value) {
  const slotsByCount = {
    "1": [{ key: "dinner", label: "Dîner" }],
    "2": [{ key: "lunch", label: "Déjeuner" }, { key: "dinner", label: "Dîner" }],
    "3": [{ key: "breakfast", label: "Petit-déjeuner" }, { key: "lunch", label: "Déjeuner" }, { key: "dinner", label: "Dîner" }]
  };
  return slotsByCount[String(count)] || slotsByCount["2"];
}

function makeEmptyMenuSlots(start, count) {
  const slots = [];
  const slotTypes = getMenuSlotTypes(count);
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const dateKey = localDateInputValue(date);
    slotTypes.forEach(slot => slots.push({ date: dateKey, mealType: slot.key, recipeKey: null }));
  }
  return slots;
}

function updateMenuControls() {
  const requiredTypes = getMenuSlotTypes().map(slot => slot.key);
  const missingTypes = [...new Set(requiredTypes)].filter(type => !recipeLibrary.some(recipe => recipe.meal_type === type));
  const canGenerate = missingTypes.length === 0;
  const menuReady = Boolean(currentMenu?.slots?.length && currentMenu.slots.every(slot => recipeLibrary.some(recipe => recipe.recipe_key === slot.recipeKey && recipe.meal_type === slot.mealType)));
  $("#generateMenu").disabled = !canGenerate;
  $("#generateMenu").textContent = currentMenu ? "Regénérer ma semaine" : "Générer ma semaine";
  $("#syncMenuShopping").disabled = !menuReady;
  if (missingTypes.length) {
    const labels = { breakfast: "petit-déjeuner", lunch: "déjeuner", dinner: "dîner" };
    $("#menuAvailability").textContent = recipeLibrary.length
      ? `Il manque des recettes publiées et vérifiées pour : ${missingTypes.map(type => labels[type]).join(", ")}.`
      : "Aucune recette publiée et vérifiée n’est disponible. Le générateur attend des fiches documentées pour chaque type de repas choisi.";
  } else if (menuReady) {
    $("#menuAvailability").textContent = `${recipeLibrary.length} recette${recipeLibrary.length > 1 ? "s" : ""} documentée${recipeLibrary.length > 1 ? "s" : ""}. La sélection respecte le type de chaque repas et parcourt les recettes avant répétition.`;
    if (nutritionProfile && requiredTypes.length === 3) {
      const profileMatchesMenu = currentMenu?.nutritionBalanced && currentMenu.nutritionProfileUpdatedAt === nutritionProfile.updatedAt;
      $("#menuAvailability").textContent += profileMatchesMenu
        ? " Les combinaisons quotidiennes approchent les repères estimés du profil."
        : " Régénère ce menu pour appliquer les repères estimés du profil.";
    }
  } else {
    $("#menuAvailability").textContent = `${recipeLibrary.length} recette${recipeLibrary.length > 1 ? "s" : ""} vérifiée${recipeLibrary.length > 1 ? "s" : ""}. Génère une semaine pour préparer son ajout aux courses.`;
  }
  if (nutritionProfile && requiredTypes.length < 3) {
    $("#menuAvailability").textContent += " Avec moins de trois repas planifiés, les totaux ne représentent qu’une partie de la journée et ne sont pas optimisés sur la cible quotidienne.";
  }
}

async function renderMenuWeek() {
  const start = menuWeekStart();
  const weekKey = localDateInputValue(start);
  try { currentMenu = database ? await getWeeklyMenu(weekKey) : null; }
  catch (error) { currentMenu = null; showNotice(error.message, true); }
  updateMenuControls();
  const slots = currentMenu?.slots?.length ? currentMenu.slots : makeEmptyMenuSlots(start, $("#mealsPerDay").value);
  const grid = $("#menuWeekGrid");
  grid.replaceChildren();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const dateKey = localDateInputValue(date);
    const card = document.createElement("article");
    card.className = "menu-day-card";
    const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(date);
    card.append(textElement("h2", "", `${label.charAt(0).toLocaleUpperCase("fr-FR")}${label.slice(1)}`));
    const daySlots = slots.filter(slot => slot.date === dateKey);
    daySlots.forEach(slot => {
      const item = document.createElement("div");
      item.className = "menu-slot";
      const slotType = getMenuSlotTypes("3").find(type => type.key === slot.mealType);
      item.append(textElement("span", "menu-slot-label", slotType?.label || "Repas"));
      const recipe = recipeLibrary.find(candidate => candidate.recipe_key === slot.recipeKey);
      const emptyLabel = currentMenu
        ? "Recette indisponible — vérifiez la bibliothèque"
        : recipeLibrary.some(candidate => candidate.meal_type === slot.mealType)
          ? "Aucun menu généré pour cette semaine"
          : "En attente d’une recette vérifiée pour ce repas";
      item.append(textElement("span", recipe ? "menu-slot-recipe" : "menu-slot-empty", recipe?.name_fr || emptyLabel));
      if (recipe) {
        const recipeDetails = document.createElement("details");
        recipeDetails.className = "menu-slot-recipe-details";
        recipeDetails.append(textElement("summary", "", "Afficher la recette"));
        recipeDetails.append(createRecipeCard(recipe));
        item.append(recipeDetails);
      }
      card.append(item);
    });
    const dayRecipes = daySlots.map(slot => recipeLibrary.find(recipe => recipe.recipe_key === slot.recipeKey));
    if (currentMenu && dayRecipes.length && dayRecipes.every(Boolean)) {
      const total = dayRecipes.reduce((sum, recipe) => {
        const values = calculateRecipeNutrition(recipe);
        for (const key of Object.keys(sum)) sum[key] += values[key];
        return sum;
      }, { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 });
      const completeDay = daySlots.length === 3 && new Set(daySlots.map(slot => slot.mealType)).size === 3;
      const summary = document.createElement("details");
      summary.className = "menu-nutrition-summary";
      summary.append(textElement("summary", "", completeDay ? "Apports estimés de la journée" : "Apports estimés des repas planifiés (partiel)"));
      summary.append(textElement("p", "", `${formatNutrient(total.energy_kcal, "kcal")} · protéines ${formatNutrient(total.protein_g, "g")} · glucides ${formatNutrient(total.carbohydrate_g, "g")} · lipides ${formatNutrient(total.fat_g, "g")}`));
      if (nutritionProfile && completeDay) {
        const profileMatchesMenu = currentMenu.nutritionBalanced && currentMenu.nutritionProfileUpdatedAt === nutritionProfile.updatedAt;
        if (profileMatchesMenu) {
          const targets = calculateNutritionTargets(nutritionProfile);
          summary.append(textElement("p", "field-hint", `Repères estimés : énergie ~${formatNutrient(targets.energyKcal, "kcal")}, protéines ${formatNutrient(targets.proteinG, "g/j")}, glucides ${formatNutrient(targets.carbohydrateMinG, "g/j")}–${formatNutrient(targets.carbohydrateMaxG, "g/j")}, lipides ${formatNutrient(targets.fatMinG, "g/j")}–${formatNutrient(targets.fatMaxG, "g/j")}.`));
        } else {
          summary.append(textElement("p", "field-hint", "Ce menu n’a pas été généré avec le profil actuel. Régénérez-le pour comparer les repères."));
        }
      }
      card.append(summary);
    }
    grid.append(card);
  }
}

function shuffleRecipes(recipes) {
  const shuffled = [...recipes];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function scoreDailyRecipeCombination(recipes, targets) {
  const total = recipes.reduce((sum, recipe) => {
    const values = calculateRecipeNutrition(recipe);
    for (const key of Object.keys(sum)) sum[key] += values[key];
    return sum;
  }, { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 });
  const rangePenalty = (value, minimum, maximum) => value < minimum
    ? (minimum - value) / Math.max(minimum, 1)
    : value > maximum ? (value - maximum) / Math.max(maximum, 1) : 0;
  const energyPenalty = Math.abs(total.energy_kcal - targets.energyKcal) / Math.max(targets.energyKcal, 1);
  const proteinShortfall = Math.max(0, targets.proteinG - total.protein_g) / Math.max(targets.proteinG, 1);
  const carbohydratePenalty = rangePenalty(total.carbohydrate_g, targets.carbohydrateMinG, targets.carbohydrateMaxG);
  const fatPenalty = rangePenalty(total.fat_g, targets.fatMinG, targets.fatMaxG);
  return energyPenalty + (0.5 * proteinShortfall) + (0.35 * carbohydratePenalty) + (0.35 * fatPenalty);
}

function chooseNutritionAlignedDay(mealTypes, usedRecipeKeys) {
  const targets = calculateNutritionTargets(nutritionProfile);
  const pools = mealTypes.map(type => {
    const pool = recipeLibrary.filter(recipe => recipe.meal_type === type);
    const unused = pool.filter(recipe => !usedRecipeKeys.has(recipe.recipe_key));
    return shuffleRecipes(unused.length ? unused : pool);
  });
  let bestScore = Infinity;
  let bestCombinations = [];
  const visit = (index, selected) => {
    if (index === pools.length) {
      const score = scoreDailyRecipeCombination(selected, targets);
      if (score < bestScore - 0.0001) {
        bestScore = score;
        bestCombinations = [selected.slice()];
      } else if (score <= bestScore + 0.015 && bestCombinations.length < 8) {
        bestCombinations.push(selected.slice());
      }
      return;
    }
    for (const recipe of pools[index]) {
      selected.push(recipe);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  if (!bestCombinations.length) throw new Error("Impossible de composer une journée avec les recettes documentées disponibles.");
  return bestCombinations[Math.floor(Math.random() * bestCombinations.length)];
}

function createWeeklyMenu(start, mealsPerDay) {
  const slots = makeEmptyMenuSlots(start, mealsPerDay);
  const usedRecipeKeys = new Set();
  const startDay = new Date(start);
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = new Date(startDay);
    date.setDate(startDay.getDate() + dayIndex);
    const dateKey = localDateInputValue(date);
    const daySlots = slots.filter(slot => slot.date === dateKey);
    const fullDay = daySlots.length === 3 && new Set(daySlots.map(slot => slot.mealType)).size === 3;
    if (nutritionProfile && fullDay) {
      const selectedRecipes = chooseNutritionAlignedDay(daySlots.map(slot => slot.mealType), usedRecipeKeys);
      daySlots.forEach((slot, index) => {
        slot.recipeKey = selectedRecipes[index].recipe_key;
        usedRecipeKeys.add(slot.recipeKey);
      });
      continue;
    }
    for (const slot of daySlots) {
      const pool = recipeLibrary.filter(recipe => recipe.meal_type === slot.mealType);
      if (!pool.length) throw new Error(`Aucune recette vérifiée ne correspond au type de repas « ${slot.mealType} ».`);
      const unused = pool.filter(recipe => !usedRecipeKeys.has(recipe.recipe_key));
      const choices = unused.length ? unused : pool;
      const recipe = choices[Math.floor(Math.random() * choices.length)];
      slot.recipeKey = recipe.recipe_key;
      usedRecipeKeys.add(recipe.recipe_key);
    }
  }
  return {
    weekStart: localDateInputValue(start),
    mealsPerDay: Number(mealsPerDay),
    createdAt: new Date().toISOString(),
    nutritionBalanced: Boolean(nutritionProfile && Number(mealsPerDay) === 3),
    nutritionProfileUpdatedAt: nutritionProfile && Number(mealsPerDay) === 3 ? nutritionProfile.updatedAt : null,
    slots
  };
}

function replaceMenuShoppingItems(menu, newMenuItems) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SHOPPING_STORE, "readwrite");
    const store = transaction.objectStore(SHOPPING_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const previous = request.result || [];
      const retain = previous.filter(item => item.source !== "menu");
      const sameWeek = new Map(previous
        .filter(item => item.source === "menu" && item.sourceWeek === menu.weekStart)
        .map(item => [item.sourceKey, item]));
      const updated = newMenuItems.map(item => {
        const old = sameWeek.get(item.sourceKey);
        return { ...item, checked: old?.checked ?? false, createdAt: old?.createdAt || item.createdAt };
      });
      store.clear();
      [...retain, ...updated].forEach(item => store.put(item));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Impossible de synchroniser le menu avec les courses."));
    transaction.onabort = () => reject(transaction.error || new Error("La synchronisation a été interrompue."));
  });
}

async function syncMenuShoppingList(menu = currentMenu) {
  if (!menu?.slots?.length) throw new Error("Générez d’abord un menu pour cette semaine.");
  const ingredientsByKey = new Map();
  for (const slot of menu.slots) {
    const recipe = recipeLibrary.find(candidate => candidate.recipe_key === slot.recipeKey);
    if (!recipe) throw new Error("Une recette de ce menu n’est plus disponible dans la bibliothèque.");
    for (const ingredient of recipe.ingredients) {
      const key = ingredient.ingredient_key;
      if (!ingredientsByKey.has(key)) ingredientsByKey.set(key, { name: getCatalogIngredient(ingredient).name_fr, uses: [] });
      ingredientsByKey.get(key).uses.push(`${ingredient.quantity_label_per_serving_fr} — ${recipe.name_fr}`);
    }
  }
  const now = new Date().toISOString();
  const menuItems = [...ingredientsByKey.entries()].map(([sourceKey, ingredient]) => ({
    id: `menu:${menu.weekStart}:${sourceKey}`,
    name: ingredient.name,
    quantity: ingredient.uses.join(" · ").slice(0, 4000),
    checked: false,
    createdAt: now,
    source: "menu",
    sourceWeek: menu.weekStart,
    sourceKey
  }));
  await replaceMenuShoppingItems(menu, menuItems);
}

async function generateMenuForSelectedWeek() {
  const missingTypes = [...new Set(getMenuSlotTypes().map(slot => slot.key))].filter(type => !recipeLibrary.some(recipe => recipe.meal_type === type));
  if (missingTypes.length) throw new Error("La bibliothèque ne contient pas encore de recette publiée et vérifiée pour chaque repas sélectionné.");
  if (currentMenu && !window.confirm("Regénérer cette semaine remplacera le menu actuel et actualisera ses articles de courses. Les articles saisis manuellement seront conservés.")) return;
  const start = menuWeekStart();
  const menu = createWeeklyMenu(start, $("#mealsPerDay").value);
  await saveWeeklyMenu(menu);
  currentMenu = menu;
  try {
    await syncMenuShoppingList(menu);
  } catch (error) {
    await renderMenuWeek();
    throw new Error(`Le menu est enregistré, mais la synchronisation des courses a échoué : ${error.message}`);
  }
  await renderMenuWeek();
  await refreshViews();
  showNotice(nutritionProfile && Number($("#mealsPerDay").value) === 3
    ? "Menu créé : les combinaisons de trois repas approchent les repères nutritionnels estimés. Les ingrédients par portion sont ajoutés aux courses ; les articles manuels sont conservés."
    : "Menu créé et ingrédients par portion ajoutés à la liste de courses. Les articles saisis manuellement sont conservés.");
}

async function refreshViews() {
  const [storedEntries, shoppingItems] = await Promise.all([getEntries(), getShoppingItems()]);
  const entries = sortEntries(storedEntries);
  journalEntriesById = new Map(entries.map(entry => [entry.id, entry]));
  $("#entryCount").textContent = String(entries.length);
  $("#latestEntry").textContent = entries.length ? formatDate(entries[0].occurredAt) : "Aucune pour le moment";
  renderEntries($("#recentEntries"), entries.slice(0, 4), "Votre journal est encore vide. Ajoutez une première entrée quand vous le souhaitez.", false);
  const filtered = activeFilter === "all" ? entries : entries.filter(entry => entry.kind === activeFilter);
  const labels = { all: "Aucune entrée pour le moment.", meal: "Aucun repas dans le journal.", symptom: "Aucun ressenti dans le journal." };
  renderEntries($("#journalEntries"), filtered, labels[activeFilter]);
  renderEntries($("#digestiveEntries"), entries.filter(entry => entry.kind === "symptom"), "Aucun ressenti consigné pour le moment. Notez un symptôme et reliez-le aux repas récents pour commencer le suivi.");
  renderShoppingItems(shoppingItems);
}

function setView(viewName, moveFocus = false) {
  if (!views.includes(viewName)) return;
  for (const name of views) {
    const panel = $(`#view-${name}`);
    const button = $(`[data-view-button="${name}"]`);
    panel.hidden = name !== viewName;
    button.setAttribute("aria-selected", String(name === viewName));
    button.id = `tab-${name}`;
    button.tabIndex = name === viewName ? 0 : -1;
  }
  if (moveFocus) $(`#view-${viewName}`).focus();
  if (location.hash !== `#${viewName}`) history.replaceState(null, "", `#${viewName}`);
}

function setEntryKind(kind) {
  const isSymptom = kind === "symptom";
  $("#mealFields").hidden = isSymptom;
  $("#symptomFields").hidden = !isSymptom;
  $("#mealDescription").disabled = isSymptom;
  $("#mealAmount").disabled = isSymptom;
  $("#mealDescription").required = !isSymptom;
  $("#symptomCode").disabled = !isSymptom;
  $("#intensity").disabled = !isSymptom;
  if (isSymptom) void renderMealAssociations();
}

async function renderMealAssociations() {
  const container = $("#relatedMealChoices");
  if (!container) return;
  const selectedIds = new Set($$('input[name="relatedMealIds"]:checked', container).map(input => input.value));
  container.replaceChildren();
  if (!database) {
    container.append(textElement("p", "field-hint", "Le journal local se prépare…"));
    return;
  }
  const symptomAt = new Date($("#occurredAt").value);
  if (Number.isNaN(symptomAt.getTime())) {
    container.append(textElement("p", "field-hint", "Indiquez d’abord la date et l’heure du ressenti."));
    return;
  }
  try {
    const windowStart = symptomAt.getTime() - (72 * 60 * 60 * 1000);
    const meals = sortEntries(await getEntries()).filter(entry => entry.kind === "meal" && new Date(entry.occurredAt).getTime() <= symptomAt.getTime() && new Date(entry.occurredAt).getTime() >= windowStart);
    if (!meals.length) {
      container.append(textElement("p", "field-hint", "Aucun repas enregistré dans les 72 heures précédant cette observation. Vous pouvez d’abord ajouter le repas, puis revenir ici."));
      return;
    }
    meals.forEach(meal => {
      const label = document.createElement("label");
      label.className = "meal-association";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "relatedMealIds";
      checkbox.value = meal.id;
      checkbox.checked = selectedIds.has(meal.id);
      const copy = document.createElement("span");
      copy.className = "meal-association-copy";
      copy.append(textElement("strong", "", meal.description));
      const mealMeta = [formatDate(meal.occurredAt), formatElapsedSinceMeal(meal.occurredAt, symptomAt)];
      if (meal.amount) mealMeta.push(`Quantité : ${meal.amount}`);
      copy.append(textElement("small", "", mealMeta.join(" · ")));
      label.append(checkbox, copy);
      container.append(label);
    });
  } catch (error) {
    container.append(textElement("p", "field-hint", error.message || "Impossible de lire les repas enregistrés."));
  }
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function validateNutritionProfile(profile) {
  return Boolean(profile && typeof profile === "object" && profile.id === "current" && Number.isInteger(profile.ageYears) && profile.ageYears >= 19 && profile.ageYears <= 78 && Number.isFinite(profile.heightCm) && profile.heightCm >= 120 && profile.heightCm <= 230 && Number.isFinite(profile.weightKg) && profile.weightKg >= 30 && profile.weightKg <= 300 && ["female", "male"].includes(profile.sexCoefficient) && [1.4, 1.6, 1.8].includes(profile.activityPal) && typeof profile.updatedAt === "string" && !Number.isNaN(new Date(profile.updatedAt).getTime()));
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || typeof entry.occurredAt !== "string" || Number.isNaN(new Date(entry.occurredAt).getTime())) return false;
  if (entry.kind === "meal") return typeof entry.description === "string" && entry.description.length > 0 && entry.description.length <= 500 && (entry.amount === null || typeof entry.amount === "string");
  if (entry.kind === "symptom") {
    const relatedMealsValid = entry.relatedMeals === undefined || (Array.isArray(entry.relatedMeals) && entry.relatedMeals.length <= 100 && entry.relatedMeals.every(meal => meal && typeof meal.id === "string" && meal.id.length > 0 && typeof meal.description === "string" && meal.description.length > 0 && meal.description.length <= 500 && (meal.amount === null || typeof meal.amount === "string") && typeof meal.occurredAt === "string" && !Number.isNaN(new Date(meal.occurredAt).getTime()) && new Date(meal.occurredAt).getTime() <= new Date(entry.occurredAt).getTime()));
    return Object.hasOwn(symptomLabels, entry.symptomCode) && (entry.intensity === null || (Number.isInteger(entry.intensity) && entry.intensity >= 0 && entry.intensity <= 10)) && relatedMealsValid;
  }
  return false;
}

function validateShoppingItem(item) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || item.name.length === 0 || item.name.length > 120 || !(item.quantity === null || (typeof item.quantity === "string" && item.quantity.length <= 4000)) || typeof item.checked !== "boolean" || typeof item.createdAt !== "string" || Number.isNaN(new Date(item.createdAt).getTime())) return false;
  if (item.source === "menu") return typeof item.sourceWeek === "string" && !Number.isNaN(new Date(`${item.sourceWeek}T12:00:00`).getTime()) && typeof item.sourceKey === "string" && item.sourceKey.length > 0;
  return item.source === undefined || item.source === "manual";
}

function validateWeeklyMenu(menu) {
  if (!menu || typeof menu !== "object") return false;
  const validMealTypes = new Set(["breakfast", "lunch", "dinner"]);
  const dateIsValid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  const nutritionMarkerValid = (menu.nutritionBalanced === undefined || typeof menu.nutritionBalanced === "boolean") && (menu.nutritionProfileUpdatedAt === undefined || menu.nutritionProfileUpdatedAt === null || (typeof menu.nutritionProfileUpdatedAt === "string" && !Number.isNaN(new Date(menu.nutritionProfileUpdatedAt).getTime()))) && (menu.nutritionBalanced !== true || (menu.mealsPerDay === 3 && typeof menu.nutritionProfileUpdatedAt === "string"));
  return Boolean(dateIsValid(menu.weekStart) && Number.isInteger(menu.mealsPerDay) && menu.mealsPerDay >= 1 && menu.mealsPerDay <= 3 && Array.isArray(menu.slots) && menu.slots.length === menu.mealsPerDay * 7 && menu.slots.every(slot => dateIsValid(slot.date) && validMealTypes.has(slot.mealType) && typeof slot.recipeKey === "string" && slot.recipeKey.length > 0) && typeof menu.createdAt === "string" && !Number.isNaN(new Date(menu.createdAt).getTime()) && nutritionMarkerValid);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof value !== "string" || value.length > 20_000_000) throw new Error("Le fichier de sauvegarde est invalide ou trop volumineux.");
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function exportBackup() {
  const passphrase = $("#backupPassphrase").value;
  const confirmation = $("#backupPassphraseConfirm").value;
  if (passphrase.length < 12) throw new Error("Choisissez une phrase secrète d’au moins 12 caractères.");
  if (passphrase.length > 256) throw new Error("La phrase secrète ne peut pas dépasser 256 caractères.");
  if (passphrase !== confirmation) throw new Error("Les deux phrases secrètes ne sont pas identiques.");
  if (!crypto.subtle) throw new Error("Le chiffrement nécessite un navigateur récent en contexte sécurisé (HTTPS ou localhost).");
  const [storedEntries, shoppingItems, weeklyMenus, profile] = await Promise.all([getEntries(), getShoppingItems(), getWeeklyMenus(), getNutritionProfile()]);
  const entries = sortEntries(storedEntries);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, BACKUP_ITERATIONS);
  const payload = { format: "lowfo-journal-data", schemaVersion: 4, entries, shoppingItems, weeklyMenus, nutritionProfile: profile };
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  const file = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: BACKUP_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `lowfo-sauvegarde-${day}.lowfo`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); }
  catch { /* La sauvegarde reste téléchargeable même si le navigateur bloque ses préférences locales. */ }
  updateBackupDate();
  $("#backupPassphrase").value = "";
  $("#backupPassphraseConfirm").value = "";
  showNotice("Le fichier chiffré a été préparé. Conservez la phrase secrète séparément du fichier.");
}

async function restoreBackup() {
  const fileInput = $("#restoreFile");
  const file = fileInput.files?.[0];
  const passphrase = $("#restorePassphrase").value;
  if (!file) throw new Error("Choisissez d’abord un fichier de sauvegarde.");
  if (!passphrase) throw new Error("Saisissez la phrase secrète de cette sauvegarde.");
  if (passphrase.length > 256) throw new Error("La phrase secrète ne peut pas dépasser 256 caractères.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Ce fichier dépasse la taille maximale acceptée (25 Mo).");
  if (!crypto.subtle) throw new Error("Le déchiffrement nécessite un navigateur récent en contexte sécurisé (HTTPS ou localhost).");

  let backup;
  try { backup = JSON.parse(await file.text()); }
  catch { throw new Error("Le fichier sélectionné ne contient pas une sauvegarde LOWFO lisible."); }
  if (backup?.format !== BACKUP_FORMAT || backup?.version !== BACKUP_VERSION || backup?.kdf?.name !== "PBKDF2" || backup?.kdf?.hash !== "SHA-256" || backup?.cipher?.name !== "AES-GCM") {
    throw new Error("Le format de cette sauvegarde n’est pas reconnu.");
  }
  const iterations = Number(backup.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) throw new Error("Les paramètres de chiffrement du fichier ne sont pas acceptés.");

  let payload;
  try {
    const salt = base64ToBytes(backup.kdf.salt);
    const iv = base64ToBytes(backup.cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("Paramètres invalides");
    const key = await deriveKey(passphrase, salt, iterations);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(backup.cipher.ciphertext));
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Déchiffrement impossible. Vérifiez la phrase secrète et l’intégrité du fichier.");
  }
  const schemaVersion = payload?.schemaVersion;
  const shoppingItems = payload?.shoppingItems ?? [];
  const weeklyMenus = payload?.weeklyMenus ?? [];
  if (payload?.format !== "lowfo-journal-data" || ![1, 2, 3, 4].includes(schemaVersion) || !Array.isArray(payload.entries) || payload.entries.length > 100_000 || !payload.entries.every(validateEntry) || (schemaVersion >= 2 && !Array.isArray(payload.shoppingItems)) || !Array.isArray(shoppingItems) || shoppingItems.length > 100_000 || !shoppingItems.every(validateShoppingItem) || (schemaVersion >= 3 && !Array.isArray(payload.weeklyMenus)) || !Array.isArray(weeklyMenus) || weeklyMenus.length > 1000 || !weeklyMenus.every(validateWeeklyMenu) || (schemaVersion === 4 && !(payload.nutritionProfile === null || validateNutritionProfile(payload.nutritionProfile)))) {
    throw new Error("Le contenu déchiffré ne correspond pas au format de journal LOWFO attendu.");
  }
  await mergeEntries(payload.entries);
  await mergeShoppingItems(shoppingItems);
  await mergeWeeklyMenus(weeklyMenus);
  if (schemaVersion === 4) {
    if (payload.nutritionProfile) await saveNutritionProfile(payload.nutritionProfile);
    else await deleteNutritionProfile();
    nutritionProfile = payload.nutritionProfile;
    renderNutritionProfile();
  }
  $("#restorePassphrase").value = "";
  fileInput.value = "";
  await refreshViews();
  await renderMenuWeek();
  showNotice(`${payload.entries.length} entrée(s) de journal, ${shoppingItems.length} article(s) de course, ${weeklyMenus.length} menu(s)${schemaVersion === 4 ? " et le profil nutritionnel" : ""} restauré(s) ou déjà présent(s).`);
}

function updateBackupDate() {
  const target = $("#lastBackup");
  const reminder = $("#backupReminder");
  let value;
  try { value = localStorage.getItem(LAST_BACKUP_KEY); }
  catch {
    target.textContent = "La date de dernière exportation n’est pas disponible dans ce navigateur.";
    reminder.textContent = "Le stockage du navigateur peut être effacé. Conservez le fichier exporté et sa phrase secrète en lieu sûr.";
    return;
  }
  if (!value) {
    target.textContent = "Aucune sauvegarde exportée depuis ce navigateur.";
    reminder.textContent = "Aucune exportation n’est enregistrée ici. Pensez à créer une sauvegarde chiffrée régulièrement.";
    return;
  }
  const backupDate = new Date(value);
  if (Number.isNaN(backupDate.getTime())) {
    target.textContent = "La date de dernière exportation est illisible.";
    reminder.textContent = "Vérifiez que le fichier exporté et sa phrase secrète sont conservés en lieu sûr.";
    return;
  }
  target.textContent = `Dernière exportation depuis ce navigateur : ${formatDate(value)}.`;
  const daysSinceBackup = (Date.now() - backupDate.getTime()) / 86_400_000;
  reminder.textContent = daysSinceBackup >= 7
    ? `La dernière exportation remonte au ${formatDate(value, false)}. Pensez à en créer une nouvelle.`
    : `Dernière exportation le ${formatDate(value, false)}. Pensez à renouveler votre sauvegarde régulièrement.`;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

async function runBackupAction(button, action) {
  setBusy(button, true);
  try { await action(); }
  catch (error) { showNotice(error.message || "Une erreur est survenue.", true); }
  finally { setBusy(button, false); }
}

function wireNavigation() {
  $$('[data-view-button]').forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.viewButton));
    button.addEventListener("keydown", event => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const buttons = $$('[data-view-button]');
      const index = buttons.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      setView(buttons[next].dataset.viewButton);
    });
  });
  $$('[data-view-link]').forEach(link => link.addEventListener("click", () => {
    const requestedKind = link.dataset.entryKind;
    if (requestedKind) {
      const radio = $(`input[name="entryKind"][value="${requestedKind}"]`);
      if (radio) {
        radio.checked = true;
        setEntryKind(requestedKind);
      }
    }
    setView(link.dataset.viewLink, true);
  }));
  const requested = location.hash.replace("#", "");
  setView(views.includes(requested) ? requested : "home");
}

function wireForm() {
  $$('input[name="entryKind"]').forEach(input => input.addEventListener("change", () => setEntryKind(input.value)));
  $("#occurredAt").value = localDateTimeValue();
  $("#occurredAt").addEventListener("change", () => {
    if (new FormData($("#entryForm")).get("entryKind") === "symptom") void renderMealAssociations();
  });
  $("#intensity").addEventListener("input", event => { $("#intensityValue").value = event.currentTarget.value; });
  $("#entryForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const kind = new FormData(form).get("entryKind");
    const occurredAt = new Date($("#occurredAt").value).toISOString();
    const entry = kind === "meal"
      ? { id: makeId(), kind, occurredAt, description: $("#mealDescription").value.trim(), amount: $("#mealAmount").value.trim() || null }
      : {
          id: makeId(),
          kind,
          occurredAt,
          symptomCode: $("#symptomCode").value,
          intensity: $("#intensity").value === "0" ? null : Number($("#intensity").value),
          relatedMeals: $$('input[name="relatedMealIds"]:checked', $("#relatedMealChoices"))
            .map(input => journalEntriesById.get(input.value))
            .filter(meal => meal?.kind === "meal" && new Date(meal.occurredAt) <= new Date(occurredAt))
            .map(meal => ({ id: meal.id, description: meal.description, amount: meal.amount ?? null, occurredAt: meal.occurredAt }))
        };
    try {
      await saveEntry(entry);
      form.reset();
      $("#occurredAt").value = localDateTimeValue();
      $("#intensityValue").value = "0";
      setEntryKind("meal");
      await refreshViews();
      setView("journal");
      showNotice(kind === "symptom"
        ? (entry.relatedMeals.length ? "Ressenti enregistré avec les repas rapprochés." : "Ressenti enregistré sur cet appareil.")
        : "Repas enregistré sur cet appareil.");
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

function wireShoppingForm() {
  $("#shoppingForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const name = $("#shoppingName").value.trim();
    if (!name) {
      $("#shoppingName").setCustomValidity("Saisissez le nom de l’article.");
      form.reportValidity();
      $("#shoppingName").setCustomValidity("");
      return;
    }
    const item = {
      id: makeId(),
      name,
      quantity: $("#shoppingQuantity").value.trim() || null,
      checked: false,
      createdAt: new Date().toISOString(),
      source: "manual"
    };
    try {
      await saveShoppingItem(item);
      form.reset();
      await refreshViews();
      $("#shoppingName").focus();
      showNotice("Article ajouté à la liste de courses sur cet appareil.");
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

function wireMenuPlanner() {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  $("#menuWeekOf").value = localDateInputValue(monday);
  $("#menuWeekOf").addEventListener("change", renderMenuWeek);
  $("#mealsPerDay").addEventListener("change", renderMenuWeek);
  $("#generateMenu").addEventListener("click", event => runMenuAction(event.currentTarget, generateMenuForSelectedWeek));
  $("#syncMenuShopping").addEventListener("click", event => runMenuAction(event.currentTarget, async () => {
    await syncMenuShoppingList();
    await refreshViews();
    showNotice("Les ingrédients du menu sélectionné sont synchronisés avec la liste de courses.");
  }));
  renderMenuWeek();
}

async function runMenuAction(button, action) {
  setBusy(button, true);
  try { await action(); }
  catch (error) { showNotice(error.message || "Impossible de mettre à jour le menu.", true); }
  finally { setBusy(button, false); }
}

function wireFilters() {
  $$("[data-filter]").forEach(button => button.addEventListener("click", async () => {
    activeFilter = button.dataset.filter;
    $$("[data-filter]").forEach(item => {
      const selected = item === button;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    await refreshViews();
  }));
}

function wireBackup() {
  $("#exportBackup").addEventListener("click", event => runBackupAction(event.currentTarget, exportBackup));
  $("#restoreBackup").addEventListener("click", event => runBackupAction(event.currentTarget, restoreBackup));
  updateBackupDate();
}

function updateOfflineStatus() {
  $("#offlineNotice").hidden = navigator.onLine;
}

async function initialize() {
  wireNavigation();
  wireForm();
  wireShoppingForm();
  wireNutritionProfile();
  wireMenuPlanner();
  wireFilters();
  wireBackup();
  window.addEventListener("online", updateOfflineStatus);
  window.addEventListener("offline", updateOfflineStatus);
  updateOfflineStatus();
  try {
    database = await openDatabase();
    await refreshViews();
    if (new FormData($("#entryForm")).get("entryKind") === "symptom") await renderMealAssociations();
    await loadNutritionProfile();
    try {
      await loadRecipeLibrary();
    } catch (error) {
      recipeLibrary = [];
      foodCatalog = null;
      catalogIndexes = null;
      renderRecipeLibrary();
      updateMenuControls();
      showNotice(error.message, true);
    }
    await renderMenuWeek();
  } catch (error) {
    showNotice(`${error.message} Les entrées ne peuvent pas être enregistrées pour le moment.`, true);
    ["#entryForm", "#shoppingForm", "#nutritionProfileForm", "#clearNutritionProfile"].forEach(selector => $(selector).querySelectorAll("button, input, textarea, select").forEach(control => { control.disabled = true; }));
  }
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      showNotice("L’application est disponible en ligne, mais son cache hors ligne n’a pas pu être préparé.", true);
    });
  }
}

initialize();
