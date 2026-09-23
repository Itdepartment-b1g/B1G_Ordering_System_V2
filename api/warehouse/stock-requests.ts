import { Router } from '../../src/server/http/routeHandler';
import {
  createWarehouseStockRequestsHandler,
  getWarehouseStockRequestsHandler,
  updateWarehouseStockRequestsHandler,
} from '../../src/server/controllers/warehouse/stock-requests';

const router = Router();

/** GET /api/warehouse/stock-requests - thin route -> controller */
router.get('/api/warehouse/stock-requests', getWarehouseStockRequestsHandler);
/** POST /api/warehouse/stock-requests - thin route -> controller */
router.post('/api/warehouse/stock-requests', createWarehouseStockRequestsHandler);
/** PATCH /api/warehouse/stock-requests - thin route -> controller */
router.patch('/api/warehouse/stock-requests', updateWarehouseStockRequestsHandler);

export default router;
