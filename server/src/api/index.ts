import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { apiLimiter } from './middleware/index.js';
import { userRoutes, adminRoutes, internalRoutes } from './routes/index.js';
import { apiLogger } from '../utils/logger.js';
import { cryptoPayService } from '../services/cryptopay.js';
import { plategaService } from '../services/platega.js';
import { activateSubscription } from '../services/user.js';
import prisma from '../services/database.js';
import { getBot } from '../bot/index.js';
import { configService } from '../services/config.js';

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
  
  // ============================================
  // CryptoPay webhook (MUST be before express.json()!)
  // Needs raw body for signature verification
  // ============================================
  app.post('/api/webhook/cryptopay', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.headers['crypto-pay-api-signature'] as string;
      const bodyString = req.body.toString();
      
      apiLogger.info({ 
        hasSignature: !!signature,
        bodyLength: bodyString.length,
        bodyPreview: bodyString.substring(0, 200),
      }, 'CryptoPay webhook received');
      
      // Verify signature
      const isValid = await cryptoPayService.verifyWebhookSignature(bodyString, signature);
      if (!isValid) {
        apiLogger.warn({ signature }, 'Invalid CryptoPay webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      apiLogger.info('CryptoPay webhook signature verified');
      
      const update = cryptoPayService.parseWebhookPayload(bodyString);
      
      if (update.update_type === 'invoice_paid') {
        const invoice = update.payload;
        const cryptoInvoiceId = String(invoice.invoice_id);
        
        apiLogger.info({
          invoiceId: invoice.invoice_id,
          amount: invoice.amount,
          paidAsset: invoice.paid_asset,
          payload: invoice.payload,
        }, 'CryptoPay invoice paid');
        
        // Idempotency check: check if transaction already processed
        const existingTx = await prisma.transaction.findFirst({
          where: { invoiceId: cryptoInvoiceId },
        });
        
        if (existingTx) {
          apiLogger.info({ invoiceId: cryptoInvoiceId }, 'CryptoPay payment already processed (idempotency)');
          return res.json({ ok: true });
        }
        
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
                // Create transaction record (idempotency key)
                const transaction = await prisma.transaction.create({
                  data: {
                    userId: user.id,
                    invoiceId: cryptoInvoiceId,
                    transactionType: 'stars_payment', // Using stars_payment for all payments
                    amountStars: 0, // Crypto payment, no stars
                    amountUsd: parseFloat(invoice.amount) || 0,
                    currency: invoice.paid_asset || 'USDT',
                    isSuccessful: true,
                    metadata: { 
                      tier: payloadData.tier, 
                      cryptoPayInvoiceId: invoice.invoice_id,
                      paidAmount: invoice.paid_amount,
                      paidAsset: invoice.paid_asset,
                    },
                  },
                });
                
                await activateSubscription(user.id, payloadData.tier, transaction.id);
                
                // Update user total spend
                await prisma.user.update({
                  where: { id: user.id },
                  data: { 
                    totalSpendUsd: { increment: parseFloat(invoice.amount) || 0 },
                  },
                });
                
                apiLogger.info({
                  userId: user.id,
                  tier: payloadData.tier,
                  invoiceId: invoice.invoice_id,
                  transactionId: transaction.id,
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
  
  // ============================================
  // Platega webhook (card payments)
  // ============================================
  app.post('/api/webhook/platega', express.json(), async (req, res) => {
    try {
      const merchantId = req.headers['x-merchantid'] as string;
      const secret = req.headers['x-secret'] as string;
      
      apiLogger.info({ 
        hasMerchantId: !!merchantId,
        hasSecret: !!secret,
        body: req.body,
      }, 'Platega webhook received');
      
      // Verify credentials
      if (!plategaService.verifyWebhook(merchantId, secret)) {
        apiLogger.warn({ merchantId }, 'Invalid Platega webhook credentials');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      apiLogger.info('Platega webhook credentials verified');
      
      const payload = req.body;
      const { id: transactionId, amount, currency, status, payload: userPayload } = payload;
      
      apiLogger.info({
        transactionId,
        amount,
        currency,
        status,
        userPayload,
      }, 'Platega payment status');
      
      // Only process CONFIRMED payments
      if (status !== 'CONFIRMED') {
        apiLogger.info({ status }, 'Platega payment not confirmed, skipping');
        return res.json({ ok: true });
      }
      
      // Idempotency check
      const existingTx = await prisma.transaction.findFirst({
        where: { invoiceId: `platega_${transactionId}` },
      });
      
      if (existingTx) {
        apiLogger.info({ transactionId }, 'Platega payment already processed (idempotency)');
        return res.json({ ok: true });
      }
      
      // Parse payload to get user info
      if (userPayload) {
        try {
          const payloadData = JSON.parse(userPayload);
          
          if (payloadData.type === 'subscription' && payloadData.userId && payloadData.tier) {
            const user = await prisma.user.findUnique({
              where: { id: payloadData.userId },
            });
            
            if (user) {
              // Convert RUB to USD (approximate)
              const rubToUsd = currency === 'RUB' ? amount / 100 : amount; // 1 USD ~ 100 RUB
              
              // Create transaction record
              const transaction = await prisma.transaction.create({
                data: {
                  userId: user.id,
                  invoiceId: `platega_${transactionId}`,
                  transactionType: 'card_payment',
                  amountStars: 0,
                  amountUsd: rubToUsd,
                  currency: currency,
                  isSuccessful: true,
                  metadata: { 
                    tier: payloadData.tier, 
                    plategaTransactionId: transactionId,
                    amountRub: amount,
                    paymentMethod: payload.paymentMethod,
                  },
                },
              });
              
              // Pass actual USD amount for correct MRR calculation
              await activateSubscription(user.id, payloadData.tier, transaction.id, rubToUsd);
              
              // Update user total spend
              await prisma.user.update({
                where: { id: user.id },
                data: { 
                  totalSpendUsd: { increment: rubToUsd },
                },
              });
              
              // Send notification to user
              try {
                const bot = getBot();
                if (bot) {
                  await bot.api.sendMessage(
                    user.telegramId.toString(),
                    `✅ Оплата прошла успешно!\n\nВаша подписка ${payloadData.tier === 'premium' ? 'Premium' : 'Basic'} активирована. Спасибо за покупку! 💜`
                  );
                }
              } catch (notifyError) {
                apiLogger.warn({ error: notifyError }, 'Failed to send payment notification');
              }
              
              apiLogger.info({
                userId: user.id,
                tier: payloadData.tier,
                transactionId,
                dbTransactionId: transaction.id,
              }, 'Platega subscription activated');
            }
          }
        } catch (parseError) {
          apiLogger.error({ error: parseError }, 'Failed to parse Platega payload');
        }
      }
      
      res.json({ ok: true });
    } catch (error) {
      apiLogger.error({ error }, 'Platega webhook error');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
  
  // Body parsing (AFTER webhook route!)
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
  
  // Health check (публичный) - расширенная версия
  app.get('/health', async (_req, res) => {
    const health: {
      status: 'ok' | 'degraded' | 'down';
      timestamp: string;
      uptime: number;
      database: 'connected' | 'error';
      version: string;
    } = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: 'connected',
      version: process.env.npm_package_version || '1.0.0',
    };
    
    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      health.database = 'error';
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  });
  
  // Public config endpoint (no auth required)
  app.get('/api/config/public', async (_req, res) => {
    try {
      const supportLink = await configService.getString('app.support_link', 'https://t.me/mindful_support');
      const channelLink = await configService.getString('app.channel_link', 'https://t.me/mindful_journal_channel');
      
      res.json({
        supportLink,
        channelLink,
      });
    } catch (error) {
      apiLogger.error({ error }, 'Failed to get public config');
      res.json({
        supportLink: 'https://t.me/mindful_support',
        channelLink: 'https://t.me/mindful_journal_channel',
      });
    }
  });
  
  // Telegram Bot Webhook handler
  app.post('/webhook', async (req, res) => {
    const bot = getBot();
    if (!bot) {
      apiLogger.warn('Webhook received but bot not initialized');
      return res.status(503).json({ error: 'Bot not ready' });
    }
    
    try {
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      const err = error as Error;
      apiLogger.error({ 
        error: err.message, 
        stack: err.stack,
        body: req.body 
      }, 'Webhook error');
      res.sendStatus(500);
    }
  });
  
  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  
  // Sentry error handler (must be before custom error handler)
  Sentry.setupExpressErrorHandler(app);
  
  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    apiLogger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });
  
  return app;
}

export default createApp;
