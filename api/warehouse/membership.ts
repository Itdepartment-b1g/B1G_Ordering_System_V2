import { Router } from '../../src/server/http/routeHandler';
import { getWarehouseMembershipHandler } from '../../src/server/controllers/warehouse/locations';

const router = Router();

/** GET /api/warehouse/membership - thin route -> controller */
router.get('/api/warehouse/membership', getWarehouseMembershipHandler);

export default router;
