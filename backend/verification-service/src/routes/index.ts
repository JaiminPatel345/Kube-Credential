import { Router } from 'express';
import { verifyCredential, syncCredential } from '../controllers/verificationController';

const apiRouter = Router();
apiRouter.post('/verify', verifyCredential);

const internalRouter = Router();
internalRouter.post('/sync', syncCredential);

const rootRouter = Router();
rootRouter.use('/api', apiRouter);
rootRouter.use('/internal', internalRouter);

export default rootRouter;
