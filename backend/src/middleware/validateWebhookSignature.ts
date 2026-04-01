import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export const validateSignature = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!signature) {
    return res.status(401).json({ error: 'No signature found on request' });
  }

  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error: Webhook secret missing' });
  }

  // To validate GitHub webhooks correctly, the raw body buffer must be used.
  // express.json() converts the body to an object, destroying the original formatting.
  // We assume a previous middleware attached the raw unparsed body to req.rawBody.
  const payload = (req as any).rawBody;

  if (!payload) {
    return res.status(400).json({ error: 'Raw body required for signature validation' });
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  try {
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Error validating signature format' });
  }

  next();
};
