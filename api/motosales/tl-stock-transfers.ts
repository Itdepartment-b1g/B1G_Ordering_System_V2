import { Router } from '../../src/server/http/routeHandler';
import {
  getMotoSalesTlTransfersHandler,
  postMotoSalesTlTransfersHandler,
} from '../../src/server/controllers/motosales/tl-stock-transfers';

const router = Router();

/** GET /api/motosales/tl-stock-transfers - thin route -> controller */
router.get('/api/motosales/tl-stock-transfers', getMotoSalesTlTransfersHandler);
/** POST /api/motosales/tl-stock-transfers - thin route -> controller */
router.post('/api/motosales/tl-stock-transfers', postMotoSalesTlTransfersHandler);

export default router;
