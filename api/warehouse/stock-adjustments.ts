import { Router } from '../../src/server/http/routeHandler';
import {
  createWarehouseStockAdjustmentsHandler,
  getWarehouseStockAdjustmentsHandler,
} from '../../src/server/controllers/warehouse/stock-adjustments';

const router = Router();

/** GET /api/warehouse/stock-adjustments - thin route -> controller */
router.get('/api/warehouse/stock-adjustments', getWarehouseStockAdjustmentsHandler);
/** POST /api/warehouse/stock-adjustments - thin route -> controller */
router.post('/api/warehouse/stock-adjustments', createWarehouseStockAdjustmentsHandler);

export default router;
