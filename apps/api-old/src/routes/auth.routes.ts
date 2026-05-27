import { auth } from '../auth/better-auth.js';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';

const router = express.Router();

router.all('/*', toNodeHandler(auth));

export default router;
