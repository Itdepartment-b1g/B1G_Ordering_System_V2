export interface PurchaseOrderItem {
    id: string;
    variant_id: string;
    warehouse_location_id?: string | null;
    warehouse_location?: { id: string; name: string; is_main: boolean } | null;
    brand_name: string;
    variant_name: string;
    /**
     * Item category/type coming from the variants table.
     * Historically only 'flavor' (pods) and 'battery' (devices) were used,
     * but COF must support additional types (e.g. FOC, NCV, POSM).
     */
    variant_type: string;
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
    warehouse_location_id?: string | null;
    warehouse_location?: { id: string; name: string; is_main: boolean } | null;
    supplier: Supplier | null;
    /** Requesting company (tenant that created the PO). */
    requestor_company?: {
        id: string;
        company_name: string;
    } | null;
    /** User profile that created the PO (requestor's contact info). */
    requestor_profile?: {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
        city: string | null;
        country: string | null;
    } | null;
    order_date: string;
    expected_delivery_date: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    discount: number;
    total_amount: number;
    status: 'draft' | 'submitted' | 'pending' | 'approved' | 'approved_for_fulfillment' | 'partially_fulfilled' | 'fulfilled' | 'rejected' | 'cancelled' | 'delivered';
    notes: string;
    created_by: string;
    approved_by?: string;
    approved_at?: string;
    created_at: string;
    items: PurchaseOrderItem[];
}
