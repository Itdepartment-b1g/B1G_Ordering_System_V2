import { Router } from '../../src/server/http/routeHandler';
import { postKASalesRecordImportHandler } from '../../src/server/controllers/key-accounts/sales-record-import';

const router = Router();

/** POST /api/key-account/sales-record-import - thin route -> controller */
router.post('/api/key-account/sales-record-import', postKASalesRecordImportHandler);

export default router;
