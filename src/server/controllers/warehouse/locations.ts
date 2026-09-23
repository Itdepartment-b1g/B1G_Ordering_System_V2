import { requireWarehouseContext } from '../../auth/requireWarehouseContext';
import { getAuthorizationHeader } from '../../http/headers';
import { respond } from '../../http/respond';
import {
  getWarehouseMembership,
  listWarehouseLocations,
} from '../../repositories/warehouse/locations';

export async function getWarehouseMembershipHandler(req: any, res: any) {
  return respond(res, async () => {
    const ctx = await requireWarehouseContext(getAuthorizationHeader(req.headers || {}));
    return { status: 200, body: await getWarehouseMembership(ctx) };
  });
}

export async function getWarehouseLocationsHandler(req: any, res: any) {
  return respond(res, async () => {
    const ctx = await requireWarehouseContext(getAuthorizationHeader(req.headers || {}));
    return { status: 200, body: await listWarehouseLocations(ctx) };
  });
}
