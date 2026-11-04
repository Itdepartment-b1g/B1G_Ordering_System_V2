import { Router } from '../../src/server/http/routeHandler';
import { getMotoSalesRemittancesHandler } from '../../src/server/controllers/moto-sales/remittances';

const router = Router();

/** GET /api/moto-sales/remittances - thin route -> controller */
router.get('/api/moto-sales/remittances', getMotoSalesRemittancesHandler);

export default router;
