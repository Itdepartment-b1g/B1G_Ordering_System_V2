import { Router } from '../../src/server/http/routeHandler';
import {
  createWarehouseSubWarehousesHandler,
  getWarehouseSubWarehousesHandler,
} from '../../src/server/controllers/warehouse/sub-warehouses';

const router = Router();

/** GET /api/warehouse/sub-warehouses - thin route -> controller */
router.get('/api/warehouse/sub-warehouses', getWarehouseSubWarehousesHandler);
/** POST /api/warehouse/sub-warehouses - thin route -> controller */
router.post('/api/warehouse/sub-warehouses', createWarehouseSubWarehousesHandler);

export default router;
