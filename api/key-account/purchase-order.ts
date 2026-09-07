import { Router } from '../../src/server/http/routeHandler';
import {
  createKAPurchaseOrderHandler,
  getKAPurchaseOrder,
  updateKAPurchaseOrderHandler,
} from '../../src/server/controllers/key-accounts/purchase-order';

const router = Router();

/** GET /api/key-account/purchase-order - thin route -> controller */
router.get('/api/key-account/purchase-order', getKAPurchaseOrder);
/** POST /api/key-account/purchase-order - thin route -> controller */
router.post('/api/key-account/purchase-order', createKAPurchaseOrderHandler);
/** PATCH /api/key-account/purchase-order - thin route -> controller */
router.patch('/api/key-account/purchase-order', updateKAPurchaseOrderHandler);

export default router;
