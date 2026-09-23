import { Router } from '../../src/server/http/routeHandler';
import {
  createWarehouseInternalStockRequestsHandler,
  getWarehouseInternalStockRequestsHandler,
} from '../../src/server/controllers/warehouse/internal-stock-requests';

const router = Router();

/** GET /api/warehouse/internal-stock-requests - thin route -> controller */
router.get('/api/warehouse/internal-stock-requests', getWarehouseInternalStockRequestsHandler);
/** POST /api/warehouse/internal-stock-requests - thin route -> controller */
router.post('/api/warehouse/internal-stock-requests', createWarehouseInternalStockRequestsHandler);

export default router;
