export interface AgentVariant {
    id: string;
    name: string;
    stock: number;
    price: number; // effective price used in UI (selling -> allocated -> unit)
    sellingPrice?: number; // explicit selling price from main inventory, may be 0
    allocatedPrice?: number; // price set during allocation
    dspPrice?: number; // DSP price from agent inventory
    rspPrice?: number; // RSP price from agent inventory
    unitPrice?: number; // cost price from main inventory
    status: 'available' | 'low' | 'none';
}

export interface AgentBrand {
    id: string;
    name: string;
    flavors: AgentVariant[];
    batteries: AgentVariant[];
    posms: AgentVariant[];
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
    totalAmount: number;
    paymentMethod: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE';
    bankType?: string;
    items: RemittanceOrderItem[];
    createdAt: string;
    agentNotes?: string;
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
    variantType: 'flavor' | 'battery' | 'posm';
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