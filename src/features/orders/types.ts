export interface PurchaseOrderItem {
    id: string;
    variant_id: string;
    brand_name: string;
    variant_name: string;
    variant_type: 'flavor' | 'battery';
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface Supplier {
    id: string;
    company_name: string;
    contact_person: string;
    email: string;
    phone: string;
    address: string;
    status: string;
}

export interface PurchaseOrder {
    id: string;
    po_number: string;
    company_id?: string;
    supplier_id: string | null;
    fulfillment_type?: 'supplier' | 'warehouse_transfer';
    warehouse_company_id?: string | null;
    supplier: Supplier | null;
    order_date: string;
    expected_delivery_date: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    discount: number;
    total_amount: number;
    status: 'pending' | 'approved' | 'rejected' | 'delivered';
    notes: string;
    created_by: string;
    approved_by?: string;
    approved_at?: string;
    created_at: string;
    items: PurchaseOrderItem[];
}
