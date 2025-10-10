import { Router } from 'express';
import { issueCredential } from '../controllers/credentialController';

const router = Router();

router.post('/issue', issueCredential);

export default router;
