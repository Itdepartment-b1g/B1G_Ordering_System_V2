import { Router } from '../../src/server/http/routeHandler';
import { getKAUsers } from '../../src/server/controllers/key-accounts/user-management';

const router = Router();

/** GET /api/key-account/user-management - thin route -> controller */
router.get('/api/key-account/user-management', getKAUsers);

export default router;
