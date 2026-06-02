import { useMemo } from 'react';

import type { CompanyBrandOption } from './useCompanyBrands';
import type { CompanyRecipientOption, RecipientRole } from './useCompanyTeamLeaders';
import type { AllocationHistoryGroup } from '../utils/allocationHistoryMappers';

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
    if (companyBrands.length > 0) return companyBrands;
    const map = new Map<string, string>();
    groups.forEach((group) => {
      if (group.brandId && group.brandName) map.set(group.brandId, group.brandName);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [companyBrands, groups]);

  return {
    allocatedToTeamLeaderOptions,
    allocatedToMobileSalesOptions,
    allocatedByOptions,
    brandOptions,
  };
}
