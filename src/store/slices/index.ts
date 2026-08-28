import { executiveReducers } from "./executive";
import { kaAnalyticsReducer } from "./key-accounts/analytics";
import { kaClientHierarchyReducer } from "./key-accounts/client-hierarchy";
import { kaPaymentSettingsReducer } from "./key-accounts/payment-settings";
import { kaPaymentTermsReducer } from "./key-accounts/payment-terms";
import { kaPurchaseOrderReducer } from "./key-accounts/purchase-order";
import { kaUserManagementReducer } from "./key-accounts/user-management";

export const rootReducer = {
  ...executiveReducers,
  kaUserManagement: kaUserManagementReducer,
  kaClientHierarchy: kaClientHierarchyReducer,
  kaPurchaseOrder: kaPurchaseOrderReducer,
  kaPaymentSettings: kaPaymentSettingsReducer,
  kaPaymentTerms: kaPaymentTermsReducer,
  kaAnalytics: kaAnalyticsReducer,
};
