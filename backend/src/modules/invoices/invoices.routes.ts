import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/auth.middleware';
import {
  requestInvoice, getInvoices, getInvoiceForUser,
  generateInvoiceHtml, cancelInvoice,
} from './invoices.service';

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

const requestSchema = z.object({
  plan: z.enum(['start', 'business']),
  months: z.number().int().min(1).max(12).default(1),
  payer_name: z.string().max(200).optional(),
});

// POST /api/invoices/request — request a new invoice
invoicesRouter.post('/request', async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { plan, months, payer_name } = parsed.data;
  try {
    const invoice = await requestInvoice(req.user!.userId, plan, months, payer_name);
    res.status(201).json({ invoice });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices — list user's invoices
invoicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const invoices = await getInvoices(req.user!.userId);
    res.json({ invoices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/:id/html — download invoice as print-ready HTML
invoicesRouter.get('/:id/html', async (req: Request, res: Response) => {
  try {
    const invoice = await getInvoiceForUser(req.params.id, req.user!.userId);
    if (!invoice) { res.status(404).json({ error: 'Invoice not found' }); return; }
    const html = await generateInvoiceHtml(invoice);
    const num = invoice.invoice_number.replace(/[^A-Za-z0-9_\-]/g, '-');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${num}.html"`);
    res.send(html);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/:id — cancel pending invoice
invoicesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await cancelInvoice(req.params.id, req.user!.userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});
