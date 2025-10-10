import { Router } from 'express';
import { listCredentials } from '../controllers/internalCredentialController';

const router = Router();

router.get('/credentials', listCredentials);

export default router;
