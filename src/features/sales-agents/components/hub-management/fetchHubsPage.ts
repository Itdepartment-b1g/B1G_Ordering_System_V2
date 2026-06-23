import { supabase } from "@/lib/supabase";

import type { HubSortDirection, HubSortKey } from "./hubListSorting";
import { normalizeSearchForFilter, quoteOrFilterValue } from "./hubSearchFilter";
import type { HubRow } from "./types";

function normalizeHubRows(raw: unknown): HubRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as HubRow & {
      creator_profile?: HubRow["profiles"] | { full_name?: string }[] | null;
      tl_profile?:
        | { id?: string; full_name?: string } | null
        | { id?: string; full_name?: string }[];
    };
    const p = r.creator_profile;
    const creator = Array.isArray(p)
      ? ((p[0] as { full_name?: string } | undefined) ?? null)
      : (p ?? null);

    const tlRaw = r.tl_profile;
    const tl = Array.isArray(tlRaw) ? tlRaw[0] : tlRaw ?? null;
    const assigned_team_leader =
      tl && typeof tl === "object" && tl.id && tl.full_name
        ? { id: String(tl.id), full_name: String(tl.full_name) }
        : null;

    const { tl_profile: _omitTl, creator_profile: _omitCreator, ...rest } = r as HubRow & {
      tl_profile?: unknown;
      creator_profile?: unknown;
    };

    return {
      ...rest,
      profiles:
        creator && "full_name" in creator
          ? { full_name: String(creator.full_name) }
          : null,
      assigned_team_leader,
    };
  });
}

function applyHubSort<T extends { order: (...args: never[]) => T }>(
  query: T,
  sortKey: HubSortKey,
  sortDirection: HubSortDirection
): T {
  const ascending = sortDirection === "asc";

  switch (sortKey) {
    case "hubName":
      return query.order("hub_name", { ascending }).order("created_at", { ascending: false });
    case "location":
      return query.order("hub_location", { ascending }).order("created_at", { ascending: false });
    case "teamLeader":
      return query
        .order("full_name", {
          ascending,
          foreignTable: "profiles!hubs_assigned_team_leader_id_fkey",
          nullsFirst: ascending,
        })
        .order("created_at", { ascending: false });
    case "createdBy":
      return query
        .order("full_name", {
          ascending,
          foreignTable: "profiles!hubs_created_by_fkey",
          nullsFirst: ascending,
        })
        .order("created_at", { ascending: false });
    case "createdAt":
    default:
      return query.order("created_at", { ascending });
  }
}

export async function fetchHubsPage(
  page: number,
  pageSize: number,
  search: string,
  sortKey: HubSortKey,
  sortDirection: HubSortDirection
): Promise<{ rows: HubRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const term = normalizeSearchForFilter(search);
  const pattern = term.length > 0 ? `%${term}%` : null;

  let query = applyHubSort(
    supabase
      .from("hubs")
      .select(
        `
      id,
      hub_name,
      hub_location,
      created_at,
      updated_at,
      created_by,
      assigned_team_leader_id,
      radius_meter,
      creator_profile:profiles!hubs_created_by_fkey ( full_name ),
      tl_profile:profiles!hubs_assigned_team_leader_id_fkey (
        id,
        full_name
      )
    `,
        { count: "exact" }
      ),
    sortKey,
    sortDirection
  );

  if (pattern) {
    const q = quoteOrFilterValue(pattern);
    query = query.or(`hub_name.ilike.${q},hub_location.ilike.${q}`);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) throw error;
  return { rows: normalizeHubRows(data), total: count ?? 0 };
}
