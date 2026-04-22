import {
  ActorAppearanceContext,
  AppearanceRegistry,
  GearSlot,
  ResolvedAppearance,
  VisualLayerRef,
} from './types';

function uniqueSortedLayers(layers: VisualLayerRef[]): VisualLayerRef[] {
  const seen = new Set<string>();
  const deduped = layers.filter((layer) => {
    const key = `${layer.assetId}|${layer.zIndex}|${layer.tint ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => a.zIndex - b.zIndex);
}

function validateAnimationRigCompatibility(
  animationSetId: string,
  resolvedBodyRigProfileId: string,
  registry: AppearanceRegistry,
): void {
  const animationSet = registry.animationSets[animationSetId];
  if (!animationSet) {
    return;
  }

  if (animationSet.rigProfileId !== resolvedBodyRigProfileId) {
    throw new Error(
      `Animation set '${animationSet.id}' requires rig '${animationSet.rigProfileId}', but body rig is '${resolvedBodyRigProfileId}'.`,
    );
  }
}

export function resolveAppearance(
  context: ActorAppearanceContext,
  registry: AppearanceRegistry,
): ResolvedAppearance {
  const bodyType = registry.bodyTypes[context.bodyTypeId];
  if (!bodyType) {
    throw new Error(`Unknown body type: ${context.bodyTypeId}`);
  }

  const rigProfile = registry.rigProfiles[bodyType.rigProfileId];
  if (!rigProfile) {
    throw new Error(
      `Body type '${bodyType.id}' references unknown rig profile '${bodyType.rigProfileId}'.`,
    );
  }

  const warnings: string[] = [];
  const hiddenSlots = new Set<GearSlot>();
  const baseLayers: VisualLayerRef[] = [...bodyType.defaultVisualLayers];
  let resolvedAnimationSetId = context.animationSetId;

  for (const equippedItem of context.equippedItems) {
    if (!equippedItem.visualId) {
      continue;
    }

    const visual = registry.gearVisuals[equippedItem.visualId];
    if (!visual) {
      warnings.push(
        `Missing gear visual definition: ${equippedItem.visualId} for item ${equippedItem.itemId}`,
      );
      continue;
    }

    const compatible = visual.compatibleBodyTags.some((tag) =>
      bodyType.tags.includes(tag),
    );

    if (!compatible) {
      warnings.push(
        `Incompatible visual ${visual.id} for body type ${bodyType.id}; expected one of [${visual.compatibleBodyTags.join(', ')}]`,
      );
      continue;
    }

    if (visual.hiddenSlots) {
      for (const slot of visual.hiddenSlots) {
        hiddenSlots.add(slot);
      }
    }

    for (const layer of visual.visualLayers) {
      baseLayers.push({
        ...layer,
        zIndex: visual.layerOrder ?? layer.zIndex,
      });
    }

    if (visual.overrides?.animationSetId) {
      resolvedAnimationSetId = visual.overrides.animationSetId;
    }
  }

  if (context.overrideAppearance?.animationSetId) {
    resolvedAnimationSetId = context.overrideAppearance.animationSetId;
  }

  if (!registry.animationSets[resolvedAnimationSetId]) {
    warnings.push(
      `Unknown animation set '${resolvedAnimationSetId}'. Falling back to '${context.animationSetId}'.`,
    );
    resolvedAnimationSetId = context.animationSetId;
  }

  validateAnimationRigCompatibility(
    resolvedAnimationSetId,
    rigProfile.id,
    registry,
  );

  const overrideLayers = context.overrideAppearance?.visualLayers ?? [];
  const statusLayers =
    context.statusEffects?.
      slice()
      .sort((a, b) => a.priority - b.priority)
      .map((effect) => effect.layer) ?? [];

  const layers = uniqueSortedLayers([
    ...baseLayers,
    ...overrideLayers,
    ...statusLayers,
  ]);

  return {
    actorId: context.actorId,
    bodyTypeId: bodyType.id,
    rigProfileId: rigProfile.id,
    animationSetId: resolvedAnimationSetId,
    hiddenSlots: [...hiddenSlots],
    layers,
    warnings,
  };
}
