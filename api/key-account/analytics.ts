import { Router } from '../../src/server/http/routeHandler';
import { getKAAnalyticsHandler } from '../../src/server/controllers/key-accounts/analytics';

const router = Router();

/** GET /api/key-account/analytics - thin route -> controller */
router.get('/api/key-account/analytics', getKAAnalyticsHandler);

export default router;
