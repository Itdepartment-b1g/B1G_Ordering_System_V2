import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type {
  PhysicalCountBatchCatalog,
  PhysicalCountBrandOption,
  PhysicalCountVariantOption,
} from '../types';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const EMPTY_CATALOG: PhysicalCountBatchCatalog = { brands: [], variantsByBrand: {} };

export function usePhysicalCountBatchCatalog({
  companyId,
  locationId,
  batchId,
  enabled,
}: {
  companyId?: string;
  locationId?: string;
  batchId?: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['physical-count-batch-catalog', companyId, locationId, batchId],
    enabled: enabled && !!companyId && !!locationId && !!batchId,
    staleTime: 0,
    queryFn: async (): Promise<PhysicalCountBatchCatalog> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          variant:variants (
            id,
            name,
            variant_type,
            brand:brands ( id, name )
          )
        `
        )
        .eq('company_id', companyId!)
        .eq('warehouse_location_id', locationId!)
        .eq('batch_id', batchId!);

      if (error) throw error;

      const brandMap = new Map<string, PhysicalCountBrandOption>();
      const variantsByBrand = new Map<string, Map<string, PhysicalCountVariantOption>>();

      for (const raw of data ?? []) {
        const row = raw as Record<string, unknown>;
        const variant = firstRelation(
          row.variant as {
            id: string;
            name: string;
            variant_type: string;
            brand: { id: string; name: string } | { id: string; name: string }[] | null;
          } | null
        );
        const brand = variant ? firstRelation(variant.brand) : null;
        if (!variant || !brand) continue;

        brandMap.set(brand.id, { id: brand.id, name: brand.name });

        let brandVariants = variantsByBrand.get(brand.id);
        if (!brandVariants) {
          brandVariants = new Map();
          variantsByBrand.set(brand.id, brandVariants);
        }

        if (!brandVariants.has(variant.id)) {
          brandVariants.set(variant.id, {
            id: variant.id,
            name: variant.name,
            variant_type: variant.variant_type,
            brand_id: brand.id,
          });
        }
      }

      const brands = [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name));
      const variantsByBrandRecord: Record<string, PhysicalCountVariantOption[]> = {};

      for (const [brandIdKey, variantMap] of variantsByBrand) {
        variantsByBrandRecord[brandIdKey] = [...variantMap.values()].sort((a, b) => {
          const typeCompare = a.variant_type.localeCompare(b.variant_type);
          return typeCompare !== 0 ? typeCompare : a.name.localeCompare(b.name);
        });
      }

      return { brands, variantsByBrand: variantsByBrandRecord };
    },
  });

  const catalog = query.data ?? EMPTY_CATALOG;

  const getVariantsForBrand = useCallback(
    (brandId: string): PhysicalCountVariantOption[] => catalog.variantsByBrand[brandId] ?? [],
    [catalog.variantsByBrand]
  );

  return useMemo(
    () => ({
      brands: catalog.brands,
      getVariantsForBrand,
      isLoading: query.isLoading,
    }),
    [catalog.brands, getVariantsForBrand, query.isLoading]
  );
}
