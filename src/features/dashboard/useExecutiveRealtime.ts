// ============================================================================
// EXECUTIVE DASHBOARD REALTIME SUBSCRIPTIONS
// ============================================================================
// Provides live tracking - automatically updates when orders, sales, or
// actions happen in assigned companies. No page refresh needed!
// ============================================================================

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Enable real-time live tracking for executive dashboard
 * Automatically refreshes data when transactions occur in assigned companies
 * 
 * @param companyIds - Array of company IDs the executive has access to
 */
export function useExecutiveRealtime(companyIds: string[]) {
    const queryClient = useQueryClient();

    useEffect(() => {
        // Don't set up if no companies assigned
        if (!companyIds || companyIds.length === 0) {
            console.log('⏸️ [Executive Realtime] No companies assigned, skipping setup');
            return;
        }

        console.log('🔴 [Executive Realtime] Live tracking enabled for', companyIds.length, 'companies');

        const channels: RealtimeChannel[] = [];

        // ========================================================================
        // LIVE TRACKING: Orders (Sales & Transactions)
        // ========================================================================
        const ordersChannel = supabase
            .channel('exec-orders-live')
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE, DELETE
                    schema: 'public',
                    table: 'client_orders',
                },
                (payload) => {
                    // Check if this order belongs to an assigned company
                    const orderCompanyId = (payload.new as any)?.company_id || (payload.old as any)?.company_id;
                    
                    if (companyIds.includes(orderCompanyId)) {
                        console.log('🔴 [LIVE] New order/sale detected!', {
                            event: payload.eventType,
                            company: orderCompanyId,
                            order: payload.new
                        });
                        
                        // Refresh all dashboard data
                        queryClient.invalidateQueries({ queryKey: ['executive'] });
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ [Executive Realtime] Orders live tracking active');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ [Executive Realtime] Orders tracking failed');
                }
            });

        channels.push(ordersChannel);

        // ========================================================================
        // LIVE TRACKING: Financial Transactions
        // ========================================================================
        const transactionsChannel = supabase
            .channel('exec-transactions-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'financial_transactions',
                },
                (payload) => {
                    const txCompanyId = (payload.new as any)?.company_id || (payload.old as any)?.company_id;
                    
                    if (companyIds.includes(txCompanyId)) {
                        console.log('🔴 [LIVE] Financial transaction detected!', {
                            event: payload.eventType,
                            company: txCompanyId
                        });
                        
                        queryClient.invalidateQueries({ queryKey: ['executive'] });
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ [Executive Realtime] Transactions live tracking active');
                }
            });

        channels.push(transactionsChannel);

        // ========================================================================
        // LIVE TRACKING: New Clients
        // ========================================================================
        const clientsChannel = supabase
            .channel('exec-clients-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'clients',
                },
                (payload) => {
                    const clientCompanyId = (payload.new as any)?.company_id || (payload.old as any)?.company_id;
                    
                    if (companyIds.includes(clientCompanyId)) {
                        console.log('🔴 [LIVE] Client activity detected!', {
                            event: payload.eventType,
                            company: clientCompanyId
                        });
                        
                        queryClient.invalidateQueries({ queryKey: ['executive'] });
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ [Executive Realtime] Clients live tracking active');
                }
            });

        channels.push(clientsChannel);

        // ========================================================================
        // LIVE TRACKING: Company Access Changes
        // ========================================================================
        const assignmentsChannel = supabase
            .channel('exec-assignments-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'executive_company_assignments',
                },
                (payload) => {
                    console.log('🔴 [LIVE] Your company access was modified!', payload);
                    
                    // Refresh everything when access changes
                    queryClient.invalidateQueries({ queryKey: ['executive'] });
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ [Executive Realtime] Access tracking active');
                }
            });

        channels.push(assignmentsChannel);

        console.log('🎯 [Executive Realtime] All live tracking channels active!');

        // ========================================================================
        // CLEANUP: Remove subscriptions when dashboard closes
        // ========================================================================
        return () => {
            console.log('🔴 [Executive Realtime] Stopping live tracking');
            channels.forEach((channel) => {
                supabase.removeChannel(channel);
            });
        };
    }, [companyIds.join(','), queryClient]);
}
