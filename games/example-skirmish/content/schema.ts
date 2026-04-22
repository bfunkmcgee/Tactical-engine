import { z } from "zod";

export const unitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hp: z.number().int().positive(),
  movement: z.number().int().nonnegative(),
  actions: z.array(z.string().min(1)).min(1)
});

export const mapSchema = z.object({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  blockedTiles: z.array(z.tuple([z.number().int(), z.number().int()]))
});

export const contentPackSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  units: z.array(unitSchema).min(1),
  maps: z.array(mapSchema).min(1)
});

export type ContentPack = z.infer<typeof contentPackSchema>;
