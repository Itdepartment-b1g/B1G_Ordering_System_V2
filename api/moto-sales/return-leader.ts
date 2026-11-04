import { Router } from '../../src/server/http/routeHandler';
import {
  createMotoSalesReturnLeaderHandler,
  getMotoSalesReturnLeaderHandler,
} from '../../src/server/controllers/moto-sales/return-leader';

const router = Router();

/** GET /api/moto-sales/return-leader - thin route -> controller */
router.get('/api/moto-sales/return-leader', getMotoSalesReturnLeaderHandler);
/** POST /api/moto-sales/return-leader - thin route -> controller */
router.post('/api/moto-sales/return-leader', createMotoSalesReturnLeaderHandler);

export default router;
