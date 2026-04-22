import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { contentPackSchema } from "../games/example-skirmish/content/schema.js";

const gamesDir = resolve(import.meta.dirname, "../games");
const gameNames = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const gameName of gameNames) {
  const packPath = resolve(gamesDir, gameName, "content/pack.json");
  const raw = readFileSync(packPath, "utf8");
  const data = JSON.parse(raw) as unknown;
  contentPackSchema.parse(data);
}

console.log(`Validated ${gameNames.length} game content pack(s)`);
