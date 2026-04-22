import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { contentPackSchema } from "../content/schema.js";

const packPath = resolve(import.meta.dirname, "../content/pack.json");
const payload = JSON.parse(readFileSync(packPath, "utf8")) as unknown;

contentPackSchema.parse(payload);
console.log("example-skirmish content pack is valid");
