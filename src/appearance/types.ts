export type Id = string;

export interface BodyTypeDef {
  id: Id;
  name: string;
  tags: string[];
  rigProfileId: Id;
  defaultVisualLayers: VisualLayerRef[];
  defaultSlotBindings: SlotBindingDef[];
}

export interface RigProfileDef {
  id: Id;
  name: string;
  skeletonKey: string;
  requiredBones: string[];
  slotAnchors: Record<string, string>;
  retargetProfileId?: Id;
}

export interface AnimationSetDef {
  id: Id;
  name: string;
  rigProfileId: Id;
  clips: Record<AnimationState, AnimationClipRef>;
}

export type AnimationState =
  | 'idle'
  | 'move'
  | 'attack'
  | 'cast'
  | 'hit'
  | 'death';

export interface AnimationClipRef {
  clipId: Id;
  loop?: boolean;
  speedMultiplier?: number;
}

export interface SlotBindingDef {
  slot: GearSlot;
  anchorKey: string;
  defaultLayerOrder: number;
}

export type GearSlot =
  | 'head'
  | 'chest'
  | 'legs'
  | 'feet'
  | 'mainHand'
  | 'offHand'
  | 'back'
  | 'accessory';

export interface GearVisualDef {
  id: Id;
  slot: GearSlot;
  compatibleBodyTags: string[];
  layerOrder?: number;
  visualLayers: VisualLayerRef[];
  hiddenSlots?: GearSlot[];
  overrides?: Partial<AppearanceOverrides>;
}

export interface VisualLayerRef {
  assetId: Id;
  zIndex: number;
  tint?: string;
}

export interface AppearanceOverrides {
  bodyTypeId: Id;
  animationSetId: Id;
  visualLayers: VisualLayerRef[];
}

export interface EquippedItem {
  itemId: Id;
  slot: GearSlot;
  visualId?: Id;
}

export interface StatusVisualEffect {
  id: Id;
  layer: VisualLayerRef;
  priority: number;
}

export interface ActorAppearanceContext {
  actorId: Id;
  bodyTypeId: Id;
  animationSetId: Id;
  equippedItems: EquippedItem[];
  statusEffects?: StatusVisualEffect[];
  overrideAppearance?: Partial<AppearanceOverrides>;
}

export interface AppearanceRegistry {
  bodyTypes: Record<Id, BodyTypeDef>;
  rigProfiles: Record<Id, RigProfileDef>;
  animationSets: Record<Id, AnimationSetDef>;
  gearVisuals: Record<Id, GearVisualDef>;
}

export interface ResolvedAppearance {
  actorId: Id;
  bodyTypeId: Id;
  rigProfileId: Id;
  animationSetId: Id;
  hiddenSlots: GearSlot[];
  layers: VisualLayerRef[];
  warnings: string[];
}
