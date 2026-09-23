import { executiveReducers } from "./executive";
import { kaAnalyticsReducer } from "./key-accounts/analytics";
import { kaDashboardReducer } from "./key-accounts/dashboard";
import { kaClientHierarchyReducer } from "./key-accounts/client-hierarchy";
import { kaPaymentSettingsReducer } from "./key-accounts/payment-settings";
import { kaPaymentTermsReducer } from "./key-accounts/payment-terms";
import { kaPurchaseOrderReducer } from "./key-accounts/purchase-order";
import { kaSalesTargetsReducer } from "./key-accounts/sales-targets";
import { kaUserManagementReducer } from "./key-accounts/user-management";
import { warehouseBatchViewReducer } from "./warehouse/batch-view";
import { warehouseLocationsReducer } from "./warehouse/locations";
import { warehouseStockAdjustmentsReducer } from "./warehouse/stock-adjustments";
import { warehouseStockRequestsReducer } from "./warehouse/stock-requests";
import { warehouseSubWarehousesReducer } from "./warehouse/sub-warehouses";

export const rootReducer = {
  ...executiveReducers,
  kaUserManagement: kaUserManagementReducer,
  kaClientHierarchy: kaClientHierarchyReducer,
  kaPurchaseOrder: kaPurchaseOrderReducer,
  kaPaymentSettings: kaPaymentSettingsReducer,
  kaPaymentTerms: kaPaymentTermsReducer,
  kaSalesTargets: kaSalesTargetsReducer,
  kaAnalytics: kaAnalyticsReducer,
  kaDashboard: kaDashboardReducer,
  warehouseLocations: warehouseLocationsReducer,
  warehouseStockRequests: warehouseStockRequestsReducer,
  warehouseStockAdjustments: warehouseStockAdjustmentsReducer,
  warehouseSubWarehouses: warehouseSubWarehousesReducer,
  warehouseBatchView: warehouseBatchViewReducer,
};
