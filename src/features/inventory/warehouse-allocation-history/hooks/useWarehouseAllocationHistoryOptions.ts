import { useMemo } from 'react';

import type { WarehouseAllocationGroup } from '../types';
import type { CompanyBrandOption } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyBrands';
import { MULTIPLE_BRANDS_LABEL } from '../utils/warehouseAllocationMappers';
import { MULTIBRAND_FILTER_VALUE } from '../utils/warehouseAllocationHistoryFilters';

type Option = { id: string; name: string };

export function useWarehouseAllocationHistoryOptions(
  groups: WarehouseAllocationGroup[],
  companyBrands: CompanyBrandOption[]
) {
  return useMemo(() => {
    const locationMap = new Map<string, string>();
    const performerMap = new Map<string, string>();

    for (const group of groups) {
      locationMap.set(group.locationId, group.locationName);
      performerMap.set(group.performedById, group.performedByName);
    }

    const locationOptions: Option[] = [...locationMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const performedByOptions: Option[] = [...performerMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const brandMap = new Map<string, string>();
    if (companyBrands.length > 0) {
      companyBrands.forEach((brand) => brandMap.set(brand.id, brand.name));
    } else {
      for (const group of groups) {
        if (group.brandId && group.brandName) {
          brandMap.set(group.brandId, group.brandName);
        }
        for (const line of group.lines) {
          if (line.brandId) {
            brandMap.set(line.brandId, line.brandName);
          }
        }
      }
    }

    const brandOptions: Option[] = [...brandMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const hasMultibrand = groups.some((group) => group.brandName === MULTIPLE_BRANDS_LABEL);
    const brandFilterOptions = hasMultibrand
      ? [{ id: MULTIBRAND_FILTER_VALUE, name: 'Multiple brands' }, ...brandOptions]
      : brandOptions;

    return { locationOptions, performedByOptions, brandOptions: brandFilterOptions };
  }, [groups, companyBrands]);
}
