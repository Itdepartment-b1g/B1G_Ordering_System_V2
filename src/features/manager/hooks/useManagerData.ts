import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

// Types
export interface DashboardStats {
    totalMembers: number;
    totalLeaders: number;
    totalInventory: number;
    pendingDepositsCount: number;
}

export interface ManagerDepositRow {
    id: string;
    depositDate: string;
    amount: number;
    bankAccount: string;
    referenceNumber: string;
    status: string;
    agentName: string;
    agentId: string;
}

export interface ManagerRemittanceRow {
    id: string;
    remittance_date: string;
    remitted_at: string;
    agent_name: string;
    items_remitted: number;
    total_revenue: number;
    orders_count: number;
}

// Fetch Functions (extracted for use in both hook and prefetcher)
export const fetchManagerDashboardData = async (companyId: string, userId: string): Promise<{
    stats: DashboardStats;
    pendingDeposits: ManagerDepositRow[];
    remittances: ManagerRemittanceRow[];
}> => {
    // 1. Get Team Hierarchy (My Team)
    const { data: relationships, error: relError } = await supabase
        .from('leader_teams')
        .select('agent_id, leader_id')
        .eq('company_id', companyId);

    if (relError) throw relError;

    // Identify direct and indirect reports
    const directReports = (relationships || [])
        .filter(r => r.leader_id === userId)
        .map(r => r.agent_id);

    const secondLevelReports = (relationships || [])
        .filter(r => directReports.includes(r.leader_id))
        .map(r => r.agent_id);

    const allTeamIds = Array.from(new Set([...directReports, ...secondLevelReports]));

    // Calculate Stats
    // Fetch Profiles for roles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, role')
        .in('id', allTeamIds);

    const totalMembers = allTeamIds.length;
    const totalLeaders = profiles?.filter(p => p.role === 'team_leader').length || 0;

    // Fetch Inventory Sum
    const { data: inventoryData } = await supabase
        .from('agent_inventory')
        .select('stock')
        .in('agent_id', allTeamIds);

    const totalInventory = inventoryData?.reduce((sum, item) => sum + (item.stock || 0), 0) || 0;

    // 2. Fetch Pending Cash Deposits (from Team Leaders/Members)
    const { data: depositsData, error: depositsError } = await supabase
        .from('cash_deposits')
        .select(`
      id, deposit_date, amount, bank_account, reference_number, status, 
      profiles!cash_deposits_agent_id_fkey(full_name, id)
    `)
        .in('agent_id', allTeamIds)
        .eq('status', 'pending_verification')
        .order('deposit_date', { ascending: false });

    if (depositsError) throw depositsError;

    const formattedDeposits = (depositsData || []).map((d: any) => ({
        id: d.id,
        depositDate: d.deposit_date,
        amount: d.amount,
        bankAccount: d.bank_account,
        referenceNumber: d.reference_number,
        status: d.status,
        agentName: d.profiles?.full_name || 'Unknown',
        agentId: d.profiles?.id || ''
    }));

    // 3. Fetch Remittances (Remitted TO me)
    const { data: remittancesData, error: remitError } = await supabase
        .from('remittances_log')
        .select(`
      id, remittance_date, remitted_at, items_remitted, total_revenue, orders_count,
      profiles!remittances_log_agent_id_fkey(full_name)
    `)
        .eq('leader_id', userId)
        .order('remitted_at', { ascending: false })
        .limit(20);

    if (remitError) throw remitError;

    const formattedRemittances = (remittancesData || []).map((r: any) => ({
        id: r.id,
        remittance_date: r.remittance_date,
        remitted_at: r.remitted_at,
        agent_name: r.profiles?.full_name || 'Unknown',
        items_remitted: r.items_remitted,
        total_revenue: r.total_revenue,
        orders_count: r.orders_count
    }));

    return {
        stats: {
            totalMembers,
            totalLeaders,
            totalInventory,
            pendingDepositsCount: formattedDeposits.length
        },
        pendingDeposits: formattedDeposits,
        remittances: formattedRemittances
    };
};

export const fetchManagerTeamInventory = async (companyId: string, userId: string) => {
    // 1. Get Team Hierarchy
    const { data: relationships, error: relError } = await supabase
        .from('leader_teams')
        .select('agent_id, leader_id')
        .eq('company_id', companyId);

    if (relError) throw relError;

    const directReports = (relationships || [])
        .filter(r => r.leader_id === userId)
        .map(r => r.agent_id);

    const secondLevelReports = (relationships || [])
        .filter(r => directReports.includes(r.leader_id))
        .map(r => r.agent_id);

    const allTeamIds = Array.from(new Set([...directReports, ...secondLevelReports]));

    if (allTeamIds.length === 0) return [];

    // 2. Fetch Profiles
    const { data: profiles, error: profError } = await supabase
        .from('profiles')
        .select('id, full_name, role, region')
        .eq('company_id', companyId)
        .in('id', allTeamIds);

    if (profError) throw profError;

    // 3. Fetch Inventory Data
    const { data: inventoryData, error: invError } = await supabase
        .from('agent_inventory')
        .select(`
            id,
            stock,
            agent_id,
            variants!inner (
                id,
                name,
                variant_type,
                brand_id, 
                brands!inner (
                    id,
                    name
                )
            )
        `)
        .eq('company_id', companyId)
        .in('agent_id', allTeamIds)
        .gt('stock', 0);

    if (invError) throw invError;

    // 4. Process and Aggregate Data
    const inventoryMap = new Map<string, any[]>();

    inventoryData?.forEach((item: any) => {
        const agentId = item.agent_id;
        if (!inventoryMap.has(agentId)) {
            inventoryMap.set(agentId, []);
        }

        inventoryMap.get(agentId)?.push({
            id: item.id,
            variantName: item.variants.name,
            variantType: item.variants.variant_type,
            brandId: item.variants.brands.id,
            brandName: item.variants.brands.name,
            stock: item.stock
        });
    });

    const summaries = (profiles || []).map(profile => {
        const agentInventory = inventoryMap.get(profile.id) || [];
        const totalStock = agentInventory.reduce((sum, i) => sum + i.stock, 0);

        return {
            agentId: profile.id,
            agentName: profile.full_name,
            agentRole: profile.role,
            agentRegion: profile.region || 'N/A',
            totalStock: totalStock,
            variantCount: agentInventory.length,
            inventory: agentInventory.sort((a, b) => b.stock - a.stock)
        };
    });

    return summaries.sort((a, b) => {
        if (a.agentRole === 'team_leader' && b.agentRole !== 'team_leader') return -1;
        if (a.agentRole !== 'team_leader' && b.agentRole === 'team_leader') return 1;
        return b.totalStock - a.totalStock;
    });
};

// Hooks
export function useManagerDashboardData() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['manager', 'dashboard', user?.company_id, user?.id],
        queryFn: () => fetchManagerDashboardData(user!.company_id!, user!.id),
        enabled: !!user?.company_id && !!user?.id && user.role === 'manager',
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

export function useManagerTeamInventory() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['manager', 'inventory', user?.company_id, user?.id],
        queryFn: () => fetchManagerTeamInventory(user!.company_id!, user!.id),
        enabled: !!user?.company_id && !!user?.id && user.role === 'manager',
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}
