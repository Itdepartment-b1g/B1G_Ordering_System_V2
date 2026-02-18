export interface AgentVariant {
    id: string;
    name: string;
    variantType: string;
    stock: number;
    price: number;
    sellingPrice?: number;
    allocatedPrice?: number;
    dspPrice?: number;
    rspPrice?: number;
    unitPrice?: number;
    status: 'available' | 'low' | 'none';
}

export interface AgentBrand {
    id: string;
    name: string;
    flavors: AgentVariant[];
    batteries: AgentVariant[];
    posms: AgentVariant[];
    allVariants: AgentVariant[];
    variantsByType: Map<string, AgentVariant[]>;
}

// Remittance-related types
export interface RemittanceOrderItem {
    variantName: string;
    brandName: string;
    quantity: number;
    unitPrice: number;
}

export interface RemittanceOrder {
    id: string;
    orderNumber: string;
    clientName: string;
    // Amount being remitted (cash + cheque portions only)
    totalAmount: number;
    paymentMethod: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE';
    bankType?: string;
    items: RemittanceOrderItem[];
    createdAt: string;
    agentNotes?: string;
    // Split payment awareness for cash/cheque portions
    paymentMode?: 'FULL' | 'SPLIT';
    cashPortion?: number;
    chequePortion?: number;
    fullOrderTotal?: number;
    // For split payments: non-cash (bank / GCash) portion summary
    nonCashPortion?: number;
    nonCashLabel?: string;
}

export interface BankOrderNote {
    order_id: string;
    notes: string;
}

// Return inventory types
export interface ReturnItem {
    variant_id: string;
    variantName: string;
    brandName: string;
    variantType: string;
    quantity: number;
    maxQuantity: number;
}

export interface InventoryReturn {
    id: string;
    companyId: string;
    agentId: string;
    receiverId: string;
    returnDate: string;
    returnType: 'full' | 'partial';
    returnReason: string;
    reasonNotes?: string;
    signatureUrl?: string;
    signaturePath?: string;
    items: ReturnItem[];
    createdAt: string;
}