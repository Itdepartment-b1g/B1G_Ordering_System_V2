import { Router } from '../../src/server/http/routeHandler';
import {
  createKAPaymentSettingsHandler,
  getKAPaymentSettingsHandler,
  updateKAPaymentSettingsHandler,
} from '../../src/server/controllers/key-accounts/payment-settings';

const router = Router();

/** GET /api/key-account/payment-settings - thin route -> controller */
router.get('/api/key-account/payment-settings', getKAPaymentSettingsHandler);
/** POST /api/key-account/payment-settings - thin route -> controller */
router.post('/api/key-account/payment-settings', createKAPaymentSettingsHandler);
/** PATCH /api/key-account/payment-settings - thin route -> controller */
router.patch('/api/key-account/payment-settings', updateKAPaymentSettingsHandler);

export default router;
