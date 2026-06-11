import { useMemo } from 'react';

import type { CompanyBrandOption } from './useCompanyBrands';
import type { CompanyRecipientOption, RecipientRole } from './useCompanyTeamLeaders';
import { MULTIPLE_BRANDS_LABEL, type AllocationHistoryGroup } from '../utils/allocationHistoryMappers';
import { MULTIBRAND_FILTER_VALUE } from '../utils/allocationHistoryFilters';

type Option = { id: string; name: string };

function optionsByRole(recipients: CompanyRecipientOption[], role: RecipientRole): Option[] {
  return recipients
    .filter((r) => r.role === role)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function optionsFromHistory(
  groups: AllocationHistoryGroup[],
  pick: (group: AllocationHistoryGroup) => { id: string; name: string }
): Option[] {
  const map = new Map<string, string>();
  groups.forEach((group) => {
    const { id, name } = pick(group);
    map.set(id, name);
  });
  return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function useAllocationHistoryOptions(
  groups: AllocationHistoryGroup[],
  companyBrands: CompanyBrandOption[],
  companyRecipients: CompanyRecipientOption[]
) {
  const allocatedToTeamLeaderOptions = useMemo<Option[]>(() => {
    if (companyRecipients.length > 0) return optionsByRole(companyRecipients, 'team_leader');
    return optionsFromHistory(groups, (g) => ({
      id: g.allocatedToId,
      name: g.allocatedToName,
    }));
  }, [companyRecipients, groups]);

  const allocatedToMobileSalesOptions = useMemo<Option[]>(() => {
    if (companyRecipients.length > 0) return optionsByRole(companyRecipients, 'mobile_sales');
    return [];
  }, [companyRecipients, groups]);

  const allocatedByOptions = useMemo<Option[]>(() => {
    if (companyRecipients.length > 0) {
      return companyRecipients.map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }
    return optionsFromHistory(groups, (g) => ({
      id: g.allocatedById,
      name: g.allocatedByName,
    }));
  }, [companyRecipients, groups]);

  const brandOptions = useMemo<Option[]>(() => {
    const map = new Map<string, string>();
    if (companyBrands.length > 0) {
      companyBrands.forEach((brand) => map.set(brand.id, brand.name));
    } else {
      groups.forEach((group) => {
        if (group.brandId && group.brandName) map.set(group.brandId, group.brandName);
      });
    }

    const options = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const hasMultibrand = groups.some((group) => group.brandName === MULTIPLE_BRANDS_LABEL);
    if (hasMultibrand) {
      return [{ id: MULTIBRAND_FILTER_VALUE, name: 'Multibrand' }, ...options];
    }

    return options;
  }, [companyBrands, groups]);

  return {
    allocatedToTeamLeaderOptions,
    allocatedToMobileSalesOptions,
    allocatedByOptions,
    brandOptions,
  };
}
