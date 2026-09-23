import { Router } from '../../src/server/http/routeHandler';
import { getWarehouseLocationsHandler } from '../../src/server/controllers/warehouse/locations';

const router = Router();

/** GET /api/warehouse/locations - thin route -> controller */
router.get('/api/warehouse/locations', getWarehouseLocationsHandler);

export default router;
