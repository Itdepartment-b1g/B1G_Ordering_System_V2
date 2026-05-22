// Key Accounts Feature Types
// Additional types specific to the Key Accounts feature

import type {
  KeyAccountClient,
  KeyAccountShop,
  KeyAccountDeliveryAddress,
  KAMDirectorAssignment,
  KAMClientAssignment,
  KeyAccountWorkflowStatus,
  CompanyAccountType,
} from '@/types/database.types';

// Re-export database types for convenience
export type {
  KeyAccountClient,
  KeyAccountShop,
  KeyAccountDeliveryAddress,
  KAMDirectorAssignment,
  KAMClientAssignment,
  KeyAccountWorkflowStatus,
  CompanyAccountType,
};

// TODO Phase 2: Add feature-specific types:
// - ClientHierarchy: Combined client + shops + addresses
// - KAMDashboardStats: Metrics for KAM dashboard
// - DirectorDashboardStats: Metrics for Director dashboard
// - OrderWithHierarchy: Purchase order with full client/shop/address info

export interface ClientHierarchy {
  client: KeyAccountClient;
  shops: (KeyAccountShop & { addresses: KeyAccountDeliveryAddress[] })[];
}

export interface KAMDashboardStats {
  totalClients: number;
  totalShops: number;
  pendingOrders: number;
  approvedOrders: number;
  monthlyRevenue: number;
}

export interface DirectorDashboardStats {
  totalKAMs: number;
  totalClients: number;
  ordersPendingApproval: number;
  ordersApprovedThisMonth: number;
}
