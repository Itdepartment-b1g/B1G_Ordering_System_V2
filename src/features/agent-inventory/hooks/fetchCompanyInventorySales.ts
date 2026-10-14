import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import { aggregateInventoryOrderSales } from '../utils/inventorySalesSummary';

/** Query the Orders page's source directly, paging every item instead of cached UI data. */
export async function fetchCompanyInventorySales(companyId: string) {
  const rows = await fetchAllPaginated(async (from, to) => supabase
    .from('client_order_items')
    .select(`
      id, variant_id, quantity,
      order:client_orders!inner(company_id, agent_id, status, stage),
      variant:variants!inner(id, name, variant_type, brand_id, brand:brands!inner(id, name))
    `)
    .eq('order.company_id', companyId)
    .in('order.status', ['pending', 'approved'])
    .order('id').range(from, to));
  return aggregateInventoryOrderSales(rows.map((row) => {
    const order = Array.isArray(row.order) ? row.order[0] : row.order;
    const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
    const brand = Array.isArray(variant?.brand) ? variant.brand[0] : variant?.brand;
    if (!order || !variant || !brand) throw new Error('Order variant details could not be loaded.');
    return {
      itemId: row.id, agentId: order.agent_id, status: order.status, stage: order.stage,
      brandId: brand.id, brandName: brand.name,
      variantId: row.variant_id, variantName: variant.name, variantType: variant.variant_type,
      quantity: Number(row.quantity),
    };
  }));
}
