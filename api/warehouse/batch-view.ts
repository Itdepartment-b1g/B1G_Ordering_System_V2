import { Router } from '../../src/server/http/routeHandler';
import { getWarehouseBatchViewHandler } from '../../src/server/controllers/warehouse/batch-view';

const router = Router();

/** GET /api/warehouse/batch-view - thin route -> controller */
router.get('/api/warehouse/batch-view', getWarehouseBatchViewHandler);

export default router;
