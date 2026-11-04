import { executiveReducers } from "./executive";
import { kaAnalyticsReducer } from "./key-accounts/analytics";
import { kaDashboardReducer } from "./key-accounts/dashboard";
import { kaClientHierarchyReducer } from "./key-accounts/client-hierarchy";
import { kaPaymentSettingsReducer } from "./key-accounts/payment-settings";
import { kaPaymentTermsReducer } from "./key-accounts/payment-terms";
import { kaPurchaseOrderReducer } from "./key-accounts/purchase-order";
import { kaSalesTargetsReducer } from "./key-accounts/sales-targets";
import { kaUserManagementReducer } from "./key-accounts/user-management";
import { motoClientReturnsReducer } from "./moto-sales/client-returns";
import { motoRemittancesReducer } from "./moto-sales/remittances";
import { motoReturnLeaderReducer } from "./moto-sales/return-leader";
import { warehouseBatchViewReducer } from "./warehouse/batch-view";
import { warehouseDisposalsReducer } from "./warehouse/disposals";
import { warehouseInternalStockRequestsReducer } from "./warehouse/internal-stock-requests";
import { warehouseLocationsReducer } from "./warehouse/locations";
import { warehouseStockAdjustmentsReducer } from "./warehouse/stock-adjustments";
import { warehouseStockRequestsReducer } from "./warehouse/stock-requests";
import { motoSalesTlTransfersReducer } from "./motosales/tl-stock-transfers";
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
  motoClientReturns: motoClientReturnsReducer,
  motoRemittances: motoRemittancesReducer,
  motoReturnLeader: motoReturnLeaderReducer,
  warehouseLocations: warehouseLocationsReducer,
  warehouseStockRequests: warehouseStockRequestsReducer,
  warehouseStockAdjustments: warehouseStockAdjustmentsReducer,
  warehouseSubWarehouses: warehouseSubWarehousesReducer,
  warehouseBatchView: warehouseBatchViewReducer,
  warehouseInternalStockRequests: warehouseInternalStockRequestsReducer,
  warehouseDisposals: warehouseDisposalsReducer,
  motoSalesTlTransfers: motoSalesTlTransfersReducer,
};
