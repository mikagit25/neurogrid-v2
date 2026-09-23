import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import { db } from '../../db';
import { createAdapter } from '../../integrations/marketplace/factory';

export const billingProfileRouter = Router();
billingProfileRouter.use(authenticate);

const billingSchema = z.object({
  company_name:   z.string().max(300).optional(),
  unp:            z.string().max(50).optional(),
  legal_address:  z.string().max(500).optional(),
  iban:           z.string().max(50).optional(),
  bank_name:      z.string().max(200).optional(),
  bic:            z.string().max(20).optional(),
  contact_person: z.string().max(200).optional(),
  phone:          z.string().max(50).optional(),
  billing_email:  z.string().email().max(200).optional().or(z.literal('')),
});

// GET /api/profile/billing
billingProfileRouter.get('/', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    'SELECT * FROM user_billing_profiles WHERE user_id = $1',
    [req.user!.userId],
  );
  res.json({ profile: rows[0] ?? null });
});

// PUT /api/profile/billing
billingProfileRouter.put('/', async (req: Request, res: Response) => {
  const parsed = billingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const d = parsed.data;
  const { rows } = await db.query(
    `INSERT INTO user_billing_profiles
       (user_id, company_name, unp, legal_address, iban, bank_name, bic,
        contact_person, phone, billing_email, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (user_id) DO UPDATE SET
       company_name   = EXCLUDED.company_name,
       unp            = EXCLUDED.unp,
       legal_address  = EXCLUDED.legal_address,
       iban           = EXCLUDED.iban,
       bank_name      = EXCLUDED.bank_name,
       bic            = EXCLUDED.bic,
       contact_person = EXCLUDED.contact_person,
       phone          = EXCLUDED.phone,
       billing_email  = EXCLUDED.billing_email,
       updated_at     = now()
     RETURNING *`,
    [req.user!.userId, d.company_name, d.unp, d.legal_address, d.iban,
     d.bank_name, d.bic, d.contact_person, d.phone, d.billing_email],
  );
  res.json({ profile: rows[0] });
});

// GET /api/profile/billing/autofill/:platform — pull seller info from marketplace
billingProfileRouter.get('/autofill/:platform', async (req: Request, res: Response) => {
  const platform = req.params.platform as 'wb' | 'ozon';
  if (platform !== 'wb' && platform !== 'ozon') {
    res.status(400).json({ error: 'Unsupported platform' });
    return;
  }

  const { rows } = await db.query(
    `SELECT id, credentials_enc FROM marketplace_connections
     WHERE user_id = $1 AND platform = $2 AND status = 'active'
     LIMIT 1`,
    [req.user!.userId, platform],
  );
  if (!rows.length) {
    res.status(404).json({ error: `No active ${platform.toUpperCase()} connection found` });
    return;
  }

  try {
    const adapter = createAdapter(platform, rows[0].credentials_enc);
    const info = await (adapter as any).getSellerInfo?.() ?? {};
    res.json({ profile: info });
  } catch (err: any) {
    res.status(502).json({ error: `Failed to fetch seller info: ${err.message}` });
  }
});
