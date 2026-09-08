import { createContext, useContext } from 'react';
import type { PurchaseOrder, Supplier } from './types';

export type PurchaseOrderWritePayload = {
    supplier_id: string | null;
    fulfillment_type: 'supplier' | 'warehouse_transfer';
    warehouse_company_id?: string | null;
    warehouse_location_id?: string | null;
    order_date: string;
    expected_delivery_date: string;
    items: Array<{
        variant_id: string;
        quantity: number;
        unit_price: number;
        warehouse_location_id?: string | null;
    }>;
    tax_rate: number;
    discount: number;
    notes: string;
    assigned_team_leader_id?: string | null;
};

export interface PurchaseOrderContextType {
    purchaseOrders: PurchaseOrder[];
    suppliers: Supplier[];
    /** Hub company id when the tenant has a warehouse assignment (internal PO target). */
    linkedWarehouseCompanyId: string | null;
    loading: boolean;
    fetchPurchaseOrders: (showLoading?: boolean, dedupeRealtime?: boolean) => Promise<void>;
    fetchSuppliers: () => Promise<void>;
    createPurchaseOrder: (orderData: PurchaseOrderWritePayload) => Promise<{ success: boolean; error?: string }>;
    updatePurchaseOrder: (
        poId: string,
        orderData: PurchaseOrderWritePayload
    ) => Promise<{ success: boolean; error?: string }>;
    approvePurchaseOrder: (poId: string) => Promise<{ success: boolean; error?: string }>;
    rejectPurchaseOrder: (poId: string) => Promise<{ success: boolean; error?: string }>;
    submitTeamLeaderPurchaseOrder: (poId: string) => Promise<{ success: boolean; error?: string }>;
    rejectTeamLeaderPurchaseOrder: (poId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
}

export const PurchaseOrderContext = createContext<PurchaseOrderContextType | undefined>(undefined);

export function usePurchaseOrders() {
    const context = useContext(PurchaseOrderContext);
    if (context === undefined) {
        throw new Error('usePurchaseOrders must be used within a PurchaseOrderProvider');
    }
    return context;
}
