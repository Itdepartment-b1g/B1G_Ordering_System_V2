import { Router } from '../../src/server/http/routeHandler';
import {
  createKAPaymentTermHandler,
  deleteKAPaymentTermHandler,
  getKAPaymentTermsHandler,
  updateKAPaymentTermHandler,
} from '../../src/server/controllers/key-accounts/payment-terms';

const router = Router();

/** GET /api/key-account/payment-terms - thin route -> controller */
router.get('/api/key-account/payment-terms', getKAPaymentTermsHandler);
/** POST /api/key-account/payment-terms - thin route -> controller */
router.post('/api/key-account/payment-terms', createKAPaymentTermHandler);
/** PATCH /api/key-account/payment-terms - thin route -> controller */
router.patch('/api/key-account/payment-terms', updateKAPaymentTermHandler);
/** DELETE /api/key-account/payment-terms - thin route -> controller */
router.delete('/api/key-account/payment-terms', deleteKAPaymentTermHandler);

export default router;
