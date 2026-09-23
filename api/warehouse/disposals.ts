import { Router } from '../../src/server/http/routeHandler';
import { getWarehouseDisposalsHandler } from '../../src/server/controllers/warehouse/disposals';

const router = Router();

/** GET /api/warehouse/disposals - thin route -> controller */
router.get('/api/warehouse/disposals', getWarehouseDisposalsHandler);

export default router;
