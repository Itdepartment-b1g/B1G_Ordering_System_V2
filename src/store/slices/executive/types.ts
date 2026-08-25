export type ExecutiveCompanyDto = {
  id: string;
  company_name: string;
  company_email: string;
  super_admin_name: string;
  super_admin_email: string;
  role: string;
  status: string;
  company_account_type: string;
  created_at: string;
  updated_at: string;
};

export type ExecutiveAssignmentDto = {
  id: string;
  executive_id: string;
  company_id: string;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  company: ExecutiveCompanyDto | null;
};

export type ExecutiveCompaniesResult = {
  assignments: ExecutiveAssignmentDto[];
  companies: ExecutiveCompanyDto[];
  companyIds: string[];
};

export type ExecutiveStatsResult = {
  totalRevenue: number;
  pendingRevenue: number;
  projectedRevenue: number;
  totalOrders: number;
  totalAgents: number;
  totalClients: number;
  pendingOrders: number;
  approvedOrders: number;
};

export type DateCompanyArgs = {
  companyIds: string[];
  from?: string;
  to?: string;
};

export type ExecutiveCompanyBreakdownRow = {
  company: ExecutiveCompanyDto;
  revenue: number;
  ordersCount: number;
  agentsCount: number;
  clientsCount: number;
  pendingOrders: number;
  approvedOrders: number;
};

export type ExecutiveRevenueTrendRow = {
  date: string;
  revenue: number;
};

export type ExecutiveTopPerformerRow = {
  agentId: string;
  agentName: string;
  companyName: string;
  totalRevenue: number;
  ordersCount: number;
};

export type ExecutiveActivityRow = {
  id: string;
  type: "order";
  title: string;
  description: string;
  companyName: string;
  status: string;
  amount: number;
  timestamp: string;
};

export type ExecutiveBrandMetric = {
  brandId: string;
  brandName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type ExecutiveVariantMetric = {
  variantId: string;
  variantName: string;
  brandId: string;
  brandName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type ExecutiveBrandPerformanceResult = {
  brands: ExecutiveBrandMetric[];
  flavors: ExecutiveVariantMetric[];
  batteries: ExecutiveVariantMetric[];
};

export type ExecutiveInventoryVariant = {
  id: string;
  name: string;
  variantType: string;
  stock: number;
  allocatedStock: number;
  price: number;
  sellingPrice: number;
  dspPrice: number;
  rspPrice: number;
  status: "in-stock" | "low-stock" | "out-of-stock";
  reorderLevel?: number;
  mainInventoryId?: string;
};

export type ExecutiveInventoryBrand = {
  id: string;
  name: string;
  flavors: ExecutiveInventoryVariant[];
  batteries: ExecutiveInventoryVariant[];
  posms: ExecutiveInventoryVariant[];
  variantsByType: Record<string, ExecutiveInventoryVariant[]>;
  allVariants: ExecutiveInventoryVariant[];
};

export type ExecutiveTeamLeader = {
  id: string;
  full_name: string;
  hub_names: string[];
};

export type ExecutiveTeamLeaderMode = "leader_only" | "team_total";
