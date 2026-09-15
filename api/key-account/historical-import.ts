import { Router } from '../../src/server/http/routeHandler';
import { postKAHistoricalImportHandler } from '../../src/server/controllers/key-accounts/historical-import';

const router = Router();

/** POST /api/key-account/historical-import - thin route -> controller */
router.post('/api/key-account/historical-import', postKAHistoricalImportHandler);

export default router;
