import { createContext, useContext } from 'react';
import type { AgentBrand } from './types';

export interface AgentInventoryContextType {
    agentBrands: AgentBrand[];
    loading: boolean;
    setAgentBrands: (brands: AgentBrand[]) => void;
    getAgentInventoryByBrand: (brandName: string) => AgentBrand | undefined;
    reduceStock: (brandName: string, variantName: string, variantType: 'flavor' | 'battery', quantity: number) => void;
    refreshInventory: () => Promise<void>;
}

export const AgentInventoryContext = createContext<AgentInventoryContextType | undefined>(undefined);

export function useAgentInventory() {
    const context = useContext(AgentInventoryContext);
    if (context === undefined) {
        throw new Error('useAgentInventory must be used within an AgentInventoryProvider');
    }
    return context;
}
