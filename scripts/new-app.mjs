#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const name = process.argv.slice(2).join(" ").trim();
if (!name) {
  console.error('Usage: npm run new -- "App name"');
  process.exit(1);
}

const id = name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

if (!id) {
  console.error(`Could not derive a folder name from "${name}".`);
  process.exit(1);
}

const appDir = path.join(root, "apps", id);
const exists = await access(appDir).then(() => true).catch(() => false);
if (exists) {
  console.error(`apps/${id} already exists - pick another name.`);
  process.exit(1);
}

const template = await readFile(path.join(root, "scripts", "templates", "app.html"), "utf8");
const html = template.replaceAll("{{NAME}}", name).replaceAll("{{ID}}", id);

await mkdir(appDir, { recursive: true });
await writeFile(path.join(appDir, "index.html"), html);

const registryPath = path.join(root, "apps.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
registry.apps.push({
  id,
  name,
  description: "A new Meta Ray-Ban Display app.",
  path: `apps/${id}/`,
});
await writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");

console.log(`Created apps/${id}/index.html and registered it in apps.json.`);
console.log(`Run "npm run dev" and open http://localhost:8000 to see it listed.`);
