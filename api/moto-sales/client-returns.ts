import { Router } from '../../src/server/http/routeHandler';
import {
  createMotoSalesClientReturnsHandler,
  getMotoSalesClientReturnsHandler,
} from '../../src/server/controllers/moto-sales/client-returns';

const router = Router();

/** GET /api/moto-sales/client-returns - thin route -> controller */
router.get('/api/moto-sales/client-returns', getMotoSalesClientReturnsHandler);
/** POST /api/moto-sales/client-returns - thin route -> controller */
router.post('/api/moto-sales/client-returns', createMotoSalesClientReturnsHandler);

export default router;
