import { Router } from '../../src/server/http/routeHandler';
import { getKADashboardHandler } from '../../src/server/controllers/key-accounts/dashboard';

const router = Router();

/** GET /api/key-account/dashboard - thin route -> controller */
router.get('/api/key-account/dashboard', getKADashboardHandler);

export default router;
