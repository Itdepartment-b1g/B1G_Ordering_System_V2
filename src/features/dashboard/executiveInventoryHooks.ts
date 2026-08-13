import type { Brand, Variant } from "@/features/inventory/InventoryContext";
import {
  useExecutiveLeaderInventory as useStoreLeaderInventory,
  useExecutiveMainInventory as useStoreMainInventory,
  useExecutiveTeamLeaders,
  type ExecutiveInventoryBrand,
  type ExecutiveTeamLeaderMode,
} from "@/store/slices/executive";

export type ExecutiveStockLayer = "main" | "team_leader";
export type ExecutiveMainStockMode = "available" | "overall";
export type { ExecutiveTeamLeader, ExecutiveTeamLeaderMode } from "@/store/slices/executive";

export { useExecutiveTeamLeaders };

const LOW_STOCK_THRESHOLD = 10;

function calculateStatus(
  stock: number,
  reorderLevel: number = LOW_STOCK_THRESHOLD
): Variant["status"] {
  if (stock === 0) return "out-of-stock";
  if (stock <= reorderLevel) return "low-stock";
  return "in-stock";
}

function toBrand(dto: ExecutiveInventoryBrand): Brand {
  return {
    id: dto.id,
    name: dto.name,
    flavors: dto.flavors as Variant[],
    batteries: dto.batteries as Variant[],
    posms: dto.posms as Variant[],
    allVariants: dto.allVariants as Variant[],
    variantsByType: new Map(Object.entries(dto.variantsByType || {})),
  };
}

export function useExecutiveMainInventory(companyId: string | null) {
  const result = useStoreMainInventory(companyId);
  return {
    ...result,
    data: (result.data || []).map(toBrand),
  };
}

export function useExecutiveLeaderInventory(
  companyId: string | null,
  leaderId: string | null,
  mode: ExecutiveTeamLeaderMode = "leader_only"
) {
  const result = useStoreLeaderInventory(companyId, leaderId, mode);
  return {
    ...result,
    data: (result.data || []).map(toBrand),
  };
}

export function getExecutiveDisplayedStock(
  variant: Variant,
  layer: ExecutiveStockLayer,
  mainMode: ExecutiveMainStockMode
): number {
  if (layer === "team_leader") return variant.stock;
  if (mainMode === "overall") return variant.stock;
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
}

export function getExecutiveStockStatus(
  variant: Variant,
  layer: ExecutiveStockLayer,
  mainMode: ExecutiveMainStockMode
): Variant["status"] {
  const displayed = getExecutiveDisplayedStock(variant, layer, mainMode);
  return calculateStatus(displayed);
}
