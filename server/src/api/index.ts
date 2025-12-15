import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiLimiter } from './middleware/index.js';
import { userRoutes, adminRoutes, internalRoutes } from './routes/index.js';
import { apiLogger } from '../utils/logger.js';

export function createApp() {
  const app = express();
  
  // Security middleware
  app.use(helmet());
  
  // CORS для Mini App
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));
  
  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      apiLogger.debug({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
      }, 'Request completed');
    });
    next();
  });
  
  // Rate limiting для публичных API
  app.use('/api/user', apiLimiter);
  app.use('/api/admin', apiLimiter);
  
  // Routes
  app.use('/api/user', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/internal', internalRoutes);
  
  // Health check (публичный)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  
  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    apiLogger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });
  
  return app;
}

export default createApp;
