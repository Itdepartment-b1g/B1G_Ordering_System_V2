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
}
