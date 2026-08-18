import { executiveReducers } from "./executive";
import { kaClientHierarchyReducer } from "./key-accounts/client-hierarchy";
import { kaUserManagementReducer } from "./key-accounts/user-management";

export const rootReducer = {
  ...executiveReducers,
  kaUserManagement: kaUserManagementReducer,
  kaClientHierarchy: kaClientHierarchyReducer,
};
