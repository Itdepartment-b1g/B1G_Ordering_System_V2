import type { AllocationHistoryGroup } from './allocationHistoryMappers';
import type { CompanyRecipientOption, RecipientRole } from '../hooks/useCompanyTeamLeaders';

export type TlProductLine = {
  brandName: string;
  variantName: string;
  variantType: string | null;
  quantity: number;
};

export type TlBrandLine = {
  brandName: string;
  variantType: string | null;
  quantity: number;
};

export type RecipientAllocationSummary = {
  recipientId: string;
  recipientName: string;
  role: RecipientRole | 'unknown';
  status: 'active' | 'inactive' | 'unknown';
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  totalUnits: number;
  lines: TlProductLine[];
};

/** @deprecated Prefer RecipientAllocationSummary — kept for call-site clarity. */
export type TlAllocationSummary = RecipientAllocationSummary;

export type TlBrandAllocationSummary = {
  recipientId: string;
  recipientName: string;
  role: RecipientRole | 'unknown';
  status: 'active' | 'inactive' | 'unknown';
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  totalUnits: number;
  lines: TlBrandLine[];
};

function lineKey(
  brandName: string,
  variantId: string,
  variantName: string,
  variantType: string | null
): string {
  const typePart = variantType?.trim().toLowerCase() || '';
  const idPart = variantId.trim() || variantName.trim().toLowerCase();
  return `${brandName.trim().toLowerCase()}|${idPart}|${typePart}`;
}

function sortLines(a: TlProductLine, b: TlProductLine): number {
  const brandCmp = a.brandName.localeCompare(b.brandName);
  if (brandCmp !== 0) return brandCmp;
  const typeA = a.variantType ?? '';
  const typeB = b.variantType ?? '';
  const typeCmp = typeA.localeCompare(typeB);
  if (typeCmp !== 0) return typeCmp;
  return a.variantName.localeCompare(b.variantName);
}

function roleLabel(role: RecipientRole | 'unknown'): string {
  if (role === 'team_leader') return 'Team Leader';
  if (role === 'mobile_sales') return 'Mobile Sales';
  return 'Unknown role';
}

export function formatRecipientRoleLabel(role: RecipientRole | 'unknown'): string {
  return roleLabel(role);
}

export function formatRecipientStatusLabel(
  status: 'active' | 'inactive' | 'unknown' | null | undefined
): string {
  if (status === 'inactive') return 'Inactive';
  if (status === 'active') return 'Active';
  // Treat missing/unknown as Active so exports never show a useless "Unknown"
  return 'Active';
}

type AccEntry = {
  recipientName: string;
  role: RecipientRole | 'unknown';
  status: 'active' | 'inactive' | 'unknown';
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  lines: Map<string, TlProductLine>;
};

function emptyEntry(
  name: string,
  meta?: Partial<Pick<AccEntry, 'role' | 'status' | 'teamLeaderId' | 'teamLeaderName'>>
): AccEntry {
  return {
    recipientName: name,
    role: meta?.role ?? 'unknown',
    status: meta?.status ?? 'unknown',
    teamLeaderId: meta?.teamLeaderId ?? null,
    teamLeaderName: meta?.teamLeaderName ?? null,
    lines: new Map(),
  };
}

function addLinesFromGroup(entry: AccEntry, group: AllocationHistoryGroup) {
  if (group.allocatedToName && group.allocatedToName !== 'Unknown') {
    entry.recipientName = group.allocatedToName;
  }
  for (const line of group.lines) {
    const brandName = line.brandName.trim() || 'Unknown brand';
    const variantName = line.variantName.trim() || 'Unknown variant';
    const key = lineKey(brandName, line.variantId, variantName, line.variantType);
    const existing = entry.lines.get(key);
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      entry.lines.set(key, {
        brandName,
        variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      });
    }
  }
}

function toSummary(recipientId: string, entry: AccEntry): RecipientAllocationSummary {
  const lines = [...entry.lines.values()].sort(sortLines);
  return {
    recipientId,
    recipientName: entry.recipientName,
    role: entry.role,
    status: entry.status,
    teamLeaderId: entry.teamLeaderId,
    teamLeaderName: entry.teamLeaderName,
    totalUnits: lines.reduce((sum, line) => sum + line.quantity, 0),
    lines,
  };
}

/**
 * Hierarchical column order: each Team Leader, then their Mobile Sales,
 * then unassigned Mobile Sales, then any unknown allocation recipients.
 */
function sortRecipientSummaries(
  summaries: RecipientAllocationSummary[]
): RecipientAllocationSummary[] {
  const tls = summaries
    .filter((s) => s.role === 'team_leader')
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName));

  const ms = summaries.filter((s) => s.role === 'mobile_sales');
  const unknown = summaries.filter((s) => s.role === 'unknown');

  const ordered: RecipientAllocationSummary[] = [];
  const placedMs = new Set<string>();

  for (const tl of tls) {
    ordered.push(tl);
    const under = ms
      .filter((m) => m.teamLeaderId === tl.recipientId)
      .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
    for (const agent of under) {
      ordered.push(agent);
      placedMs.add(agent.recipientId);
    }
  }

  const unassignedMs = ms
    .filter((m) => !placedMs.has(m.recipientId))
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
  ordered.push(...unassignedMs);

  unknown
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName))
    .forEach((u) => ordered.push(u));

  return ordered;
}

/**
 * Aggregate allocations for team leaders and mobile sales.
 * Includes both `main_to_leader` and `leader_to_agent`.
 * When `roster` is provided, every company TL/MS appears (even with 0 units).
 */
export function aggregateAllocationHistoryByTeamLeader(
  groups: AllocationHistoryGroup[],
  roster: CompanyRecipientOption[] = []
): RecipientAllocationSummary[] {
  const byRecipient = new Map<string, AccEntry>();

  for (const person of roster) {
    byRecipient.set(
      person.id,
      emptyEntry(person.name, {
        role: person.role,
        status: person.status,
        teamLeaderId: person.teamLeaderId,
        teamLeaderName: person.teamLeaderName,
      })
    );
  }

  for (const group of groups) {
    let entry = byRecipient.get(group.allocatedToId);
    if (!entry) {
      entry = emptyEntry(group.allocatedToName);
      byRecipient.set(group.allocatedToId, entry);
    }
    addLinesFromGroup(entry, group);
  }

  return sortRecipientSummaries(
    [...byRecipient.entries()].map(([id, entry]) => toSummary(id, entry))
  );
}

function brandLineKey(brandName: string, variantType: string | null): string {
  return `${brandName.trim().toLowerCase()}|${variantType?.trim().toLowerCase() || ''}`;
}

function sortBrandLines(a: TlBrandLine, b: TlBrandLine): number {
  const brandCmp = a.brandName.localeCompare(b.brandName);
  if (brandCmp !== 0) return brandCmp;
  return (a.variantType ?? '').localeCompare(b.variantType ?? '');
}

/**
 * Collapse variant-level summaries into Brand | Type | Qty per recipient.
 */
export function aggregateAllocationHistoryByTeamLeaderBrand(
  variantSummaries: RecipientAllocationSummary[]
): TlBrandAllocationSummary[] {
  return variantSummaries.map((person) => {
    const byBrand = new Map<string, TlBrandLine>();
    for (const line of person.lines) {
      const key = brandLineKey(line.brandName, line.variantType);
      const existing = byBrand.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        byBrand.set(key, {
          brandName: line.brandName,
          variantType: line.variantType,
          quantity: line.quantity,
        });
      }
    }
    const lines = [...byBrand.values()].sort(sortBrandLines);
    return {
      recipientId: person.recipientId,
      recipientName: person.recipientName,
      role: person.role,
      status: person.status,
      teamLeaderId: person.teamLeaderId,
      teamLeaderName: person.teamLeaderName,
      totalUnits: person.totalUnits,
      lines,
    };
  });
}
