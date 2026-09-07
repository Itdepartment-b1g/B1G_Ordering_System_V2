import { Router } from '../../src/server/http/routeHandler';
import {
  deleteKASalesTargetHandler,
  getKASalesTargetsHandler,
  upsertKASalesTargetHandler,
} from '../../src/server/controllers/key-accounts/sales-targets';

const router = Router();

/** GET /api/key-account/sales-targets - thin route -> controller */
router.get('/api/key-account/sales-targets', getKASalesTargetsHandler);
/** POST /api/key-account/sales-targets - thin route -> controller */
router.post('/api/key-account/sales-targets', upsertKASalesTargetHandler);
/** DELETE /api/key-account/sales-targets - thin route -> controller */
router.delete('/api/key-account/sales-targets', deleteKASalesTargetHandler);

export default router;
