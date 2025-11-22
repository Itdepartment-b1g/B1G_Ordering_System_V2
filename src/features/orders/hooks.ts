import { createContext, useContext } from 'react';
import type { PurchaseOrder, Supplier } from './types';

export interface PurchaseOrderContextType {
    purchaseOrders: PurchaseOrder[];
    suppliers: Supplier[];
    loading: boolean;
    fetchPurchaseOrders: () => Promise<void>;
    fetchSuppliers: () => Promise<void>;
    createPurchaseOrder: (orderData: {
        supplier_id: string;
        order_date: string;
        expected_delivery_date: string;
        items: Array<{
            variant_id: string;
            quantity: number;
            unit_price: number;
        }>;
        tax_rate: number;
        discount: number;
        notes: string;
    }) => Promise<{ success: boolean; error?: string }>;
    approvePurchaseOrder: (poId: string) => Promise<{ success: boolean; error?: string }>;
    rejectPurchaseOrder: (poId: string) => Promise<{ success: boolean; error?: string }>;
}

export const PurchaseOrderContext = createContext<PurchaseOrderContextType | undefined>(undefined);

export function usePurchaseOrders() {
    const context = useContext(PurchaseOrderContext);
    if (context === undefined) {
        throw new Error('usePurchaseOrders must be used within a PurchaseOrderProvider');
    }
    return context;
}
