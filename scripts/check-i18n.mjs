import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localesDir = path.join(root, "src", "shared", "i18n", "locales");
const baseLocale = "en";

function flattenKeys(value, prefix = "") {
  const keys = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      keys.push(...flattenKeys(nestedValue, nextKey));
    } else {
      keys.push(nextKey);
    }
  }

  return keys;
}

function findEmptyStrings(value, prefix = "") {
  const keys = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return keys;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      keys.push(...findEmptyStrings(nestedValue, nextKey));
    } else if (typeof nestedValue === "string" && nestedValue.trim() === "") {
      keys.push(nextKey);
    }
  }

  return keys;
}

async function readLocale(locale) {
  const filePath = path.join(localesDir, `${locale}.json`);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${locale}: ${details}`, { cause: error });
  }
}

function printList(title, values) {
  if (values.length === 0) return;
  console.error(`${title}:`);
  for (const value of values) {
    console.error(`- ${value}`);
  }
}

const localeFiles = (await readdir(localesDir)).filter((fileName) => fileName.endsWith(".json")).sort();
const locales = localeFiles.map((fileName) => path.basename(fileName, ".json"));

if (!locales.includes(baseLocale)) {
  console.error(`i18n check failed. Base locale is missing: ${baseLocale}`);
  process.exit(1);
}

let baseResource;
try {
  baseResource = await readLocale(baseLocale);
} catch (error) {
  console.error("i18n check failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const baseKeys = flattenKeys(baseResource).sort();
const baseKeySet = new Set(baseKeys);
const failures = [];
let missingCount = 0;
let extraCount = 0;
let emptyCount = findEmptyStrings(baseResource).length;

for (const locale of locales.filter((entry) => entry !== baseLocale)) {
  let resource;
  try {
    resource = await readLocale(locale);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    continue;
  }

  const localeKeys = flattenKeys(resource).sort();
  const localeKeySet = new Set(localeKeys);
  const missing = baseKeys.filter((key) => !localeKeySet.has(key));
  const extra = localeKeys.filter((key) => !baseKeySet.has(key));
  const empty = findEmptyStrings(resource);

  missingCount += missing.length;
  extraCount += extra.length;
  emptyCount += empty.length;

  if (missing.length > 0 || extra.length > 0 || empty.length > 0) {
    failures.push(locale);
    printList(`${locale} missing`, missing);
    printList(`${locale} extra`, extra);
    printList(`${locale} empty`, empty);
  }
}

if (emptyCount > 0) {
  printList(`${baseLocale} empty`, findEmptyStrings(baseResource));
}

if (failures.length > 0 || missingCount > 0 || extraCount > 0 || emptyCount > 0) {
  console.error("i18n check failed.");
  console.error(`Base locale: ${baseLocale}`);
  console.error(`Locales checked: ${locales.filter((entry) => entry !== baseLocale).join(", ") || "(none)"}`);
  console.error(`Keys: ${baseKeys.length}`);
  console.error(`Missing: ${missingCount}`);
  console.error(`Extra: ${extraCount}`);
  console.error(`Empty: ${emptyCount}`);
  process.exit(1);
}

console.log("i18n check passed.");
console.log(`Base locale: ${baseLocale}`);
console.log(`Locales checked: ${locales.filter((entry) => entry !== baseLocale).join(", ") || "(none)"}`);
console.log(`Keys: ${baseKeys.length}`);
console.log("Missing: 0");
console.log("Extra: 0");
console.log("Empty: 0");
