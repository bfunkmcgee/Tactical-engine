export const INVENTORY_COMPONENT = 'Inventory' as const;

export interface InventoryItemRef {
  itemId: string;
  quantity: number;
}

export interface Inventory {
  items: InventoryItemRef[];
  maxSlots: number;
}
