import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiLimiter } from './middleware/index.js';
import { userRoutes, adminRoutes, internalRoutes } from './routes/index.js';
import { apiLogger } from '../utils/logger.js';
import { cryptoPayService } from '../services/cryptopay.js';
import { activateSubscription } from '../services/user.js';
import prisma from '../services/database.js';

export function createApp() {
  const app = express();
  
  // Trust proxy (Nginx) - указываем количество прокси между клиентом и сервером
  // Для Cloudflare + Nginx = 2 прокси
  app.set('trust proxy', 2);
  
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
  
  // CryptoPay webhook (публичный, без rate limiting)
  app.post('/api/webhook/cryptopay', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['crypto-pay-api-signature'] as string;
      const bodyString = req.body.toString();
      
      apiLogger.info({ 
        hasSignature: !!signature,
        bodyLength: bodyString.length,
      }, 'CryptoPay webhook received');
      
      // Verify signature
      const isValid = cryptoPayService.verifyWebhookSignature(bodyString, signature);
      if (!isValid) {
        apiLogger.warn({ signature }, 'Invalid CryptoPay webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      apiLogger.info('CryptoPay webhook signature verified');
      
      const update = cryptoPayService.parseWebhookPayload(bodyString);
      
      if (update.update_type === 'invoice_paid') {
        const invoice = update.payload;
        
        apiLogger.info({
          invoiceId: invoice.invoice_id,
          amount: invoice.amount,
          paidAsset: invoice.paid_asset,
          payload: invoice.payload,
        }, 'CryptoPay invoice paid');
        
        // Parse payload to get user info
        if (invoice.payload) {
          try {
            const payloadData = JSON.parse(invoice.payload);
            
            if (payloadData.type === 'subscription' && payloadData.userId && payloadData.tier) {
              // Find user and activate subscription
              const user = await prisma.user.findUnique({
                where: { id: payloadData.userId },
              });
              
              if (user) {
                await activateSubscription(user.id, payloadData.tier);
                
                apiLogger.info({
                  userId: user.id,
                  tier: payloadData.tier,
                  invoiceId: invoice.invoice_id,
                }, 'Crypto subscription activated');
              }
            }
          } catch (parseError) {
            apiLogger.error({ error: parseError }, 'Failed to parse invoice payload');
          }
        }
      }
      
      res.json({ ok: true });
    } catch (error) {
      apiLogger.error({ error }, 'CryptoPay webhook error');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
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
