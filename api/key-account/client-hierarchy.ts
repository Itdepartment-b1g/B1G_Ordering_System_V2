import { Router } from '../../src/server/http/routeHandler';
import {
  createKAClientHierarchy,
  getKAClientHierarchy,
  updateKAClientHierarchy,
} from '../../src/server/controllers/key-accounts/client-hierarchy';

const router = Router();

/** GET /api/key-account/client-hierarchy - thin route -> controller */
router.get('/api/key-account/client-hierarchy', getKAClientHierarchy);
/** POST /api/key-account/client-hierarchy - thin route -> controller */
router.post('/api/key-account/client-hierarchy', createKAClientHierarchy);
/** PATCH /api/key-account/client-hierarchy - thin route -> controller */
router.patch('/api/key-account/client-hierarchy', updateKAClientHierarchy);

export default router;
