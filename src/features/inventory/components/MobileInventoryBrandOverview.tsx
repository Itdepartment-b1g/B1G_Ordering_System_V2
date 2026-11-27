import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import type { AgentBrand, AgentVariant } from '../types';
import {
  formatVariantTypeLabel,
  getBrandTotalStock,
  sortedVariantTypeEntries,
} from '../utils/myInventoryBrandDisplay';
import { variantTypeTone } from '../utils/variantTypeTone';

const VARIANT_TYPES_QUERY_KEY = 'variant-types';

type VariantTypeRow = {
  name: string;
  display_name: string;
  color_code: string | null;
};

function unitLabel(count: number) {
  return Math.abs(count) === 1 ? 'unit' : 'units';
}

function formatMoney(value: number | undefined) {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `₱${amount.toFixed(2)}`;
}

function PriceLine({ variant }: { variant: AgentVariant }) {
  const parts = [
    { key: 'price', label: null, value: formatMoney(variant.price) },
    { key: 'rsp', label: 'RSP', value: formatMoney(variant.rspPrice) },
    { key: 'dsp', label: 'DSP', value: formatMoney(variant.dspPrice) },
  ];

  return (
    <p className="mt-0.5 flex flex-wrap items-center text-[11px] font-normal leading-4">
      {parts.map((part, index) => (
        <span key={part.key} className="inline-flex items-center">
          {index > 0 ? (
            <span className="px-1.5 text-[#C5CDEA]" aria-hidden>
              |
            </span>
          ) : null}
          {part.label ? <span className="text-[#02066F]/45">{part.label}</span> : null}
          <span className={`tabular-nums text-[#02066F]/70 ${part.label ? 'ml-1' : ''}`}>{part.value}</span>
        </span>
      ))}
    </p>
  );
}

export function MobileInventoryBrandOverview({
  brands,
  isFiltered = false,
  onShowDetails,
}: {
  brands: AgentBrand[];
  isFiltered?: boolean;
  onShowDetails: (brandId: string) => void;
}) {
  const { user } = useAuth();

  const { data: variantTypes = [] } = useQuery({
    queryKey: [VARIANT_TYPES_QUERY_KEY, user?.company_id],
    enabled: !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_types')
        .select('name, display_name, description, color_code')
        .eq('company_id', user!.company_id)
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as VariantTypeRow[];
    },
  });

  const typeByName = useMemo(
    () => new Map(variantTypes.map((type) => [type.name.toLowerCase(), type])),
    [variantTypes]
  );

  if (brands.length === 0) {
    return (
      <div className="rounded-lg border border-[#D5DCF3] bg-white py-12 text-center text-sm text-[#02066F]/55">
        <p>{isFiltered ? 'No results found' : 'No inventory'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {brands.map((brand) => {
        const totalUnits = getBrandTotalStock(brand);
        const typeEntries = sortedVariantTypeEntries(brand.variantsByType);

        return (
          <section key={brand.id} className="overflow-hidden rounded-lg border border-[#D5DCF3] bg-white">
            <header className="flex items-center justify-between gap-3 border-b border-[#E4E8F5] px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="h-8 w-1 shrink-0 rounded-full bg-[#02066F]" aria-hidden />
                <div className="min-w-0">
                  <h3 className="break-words text-[15px] font-semibold leading-tight text-[#02066F]">
                    {brand.name}
                  </h3>
                  <p className="mt-0.5 text-xs font-normal text-[#02066F]/50">Brand inventory</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[22px] font-semibold leading-none tabular-nums text-[#02066F]">
                  {totalUnits.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] font-normal text-[#02066F]/50">Total units</p>
              </div>
            </header>

            <div className="px-3.5">
              {typeEntries.map(([type, variants]) => {
                const typeRecord = typeByName.get(type.toLowerCase());
                const tone = variantTypeTone(typeRecord?.color_code);
                const typeLabel = typeRecord?.display_name?.trim() || formatVariantTypeLabel(type, false);
                const skuLabel = `${variants.length} SKU${variants.length === 1 ? '' : 's'}`;

                return (
                  <div key={type} className="border-b border-[#E4E8F5] py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.accent}`} aria-hidden />
                      <h4 className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-[#02066F]">
                        {typeLabel}
                      </h4>
                      <span className="shrink-0 rounded-full bg-[#F4F5FB] px-2.5 py-0.5 text-[11px] font-medium text-[#02066F]">
                        {skuLabel}
                      </span>
                    </div>

                    <ul className="mt-1">
                      {variants.map((variant) => (
                        <li
                          key={variant.id}
                          className="flex items-start justify-between gap-3 border-b border-[#EEF1F8] py-2.5 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium leading-snug text-[#1C1C3A]">
                              {variant.name}
                            </p>
                            <PriceLine variant={variant} />
                          </div>
                          <p className="shrink-0 pt-0.5 text-right leading-none whitespace-nowrap">
                            <span className="text-sm font-semibold tabular-nums text-[#1C1C3A]">
                              {variant.stock.toLocaleString()}
                            </span>
                            <span className="ml-1 text-xs font-normal text-[#02066F]/55">
                              {unitLabel(variant.stock)}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="px-3.5 py-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-lg border-[#C9D0EA] bg-white text-sm font-medium text-[#02066F] shadow-none hover:bg-[#F7F8FC] hover:text-[#02066F]"
                onClick={() => onShowDetails(brand.id)}
              >
                Show Details
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
