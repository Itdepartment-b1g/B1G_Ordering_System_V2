import type { CompanyPriceChangeItem } from './companyPriceChangeApi';

export type PriceItemBrandGroup = {
  key: string;
  brandId: string | null;
  brandName: string;
  /** Wave time: item updated_at (append) or created_at */
  updatedAt: string;
  items: CompanyPriceChangeItem[];
};

function itemWaveAt(item: CompanyPriceChangeItem): string {
  return item.updated_at || item.created_at;
}

/** Same brand can appear twice if variants were updated in different append waves. */
export function groupPriceItemsByBrandWave(
  items: CompanyPriceChangeItem[]
): PriceItemBrandGroup[] {
  const map = new Map<string, PriceItemBrandGroup>();

  for (const item of items) {
    const brandName = item.brand_name?.trim() || 'Unknown brand';
    const brandId = item.brand_id;
    const updatedAt = itemWaveAt(item);
    const key = `${brandId ?? brandName}::${updatedAt}`;

    let group = map.get(key);
    if (!group) {
      group = { key, brandId, brandName, updatedAt, items: [] };
      map.set(key, group);
    }
    group.items.push(item);
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.items.sort(
      (a, b) =>
        a.variant_name.localeCompare(b.variant_name) ||
        a.variant_type.localeCompare(b.variant_type)
    );
  }

  groups.sort((a, b) => {
    const byTime = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (byTime !== 0) return byTime;
    return a.brandName.localeCompare(b.brandName);
  });

  return groups;
}

export function formatPriceItemWave(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString();
}
