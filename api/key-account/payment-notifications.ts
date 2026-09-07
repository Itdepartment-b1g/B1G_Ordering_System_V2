import { Router } from '../../src/server/http/routeHandler';
import { getKAPaymentNotificationsHandler } from '../../src/server/controllers/key-accounts/payment-notifications';

const router = Router();

/** GET /api/key-account/payment-notifications - thin route -> controller */
router.get('/api/key-account/payment-notifications', getKAPaymentNotificationsHandler);

export default router;
