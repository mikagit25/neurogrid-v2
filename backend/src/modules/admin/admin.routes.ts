import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../auth/auth.middleware';
import { db } from '../../db';

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// ---- Dashboard stats ----

adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [users, runs, revenue, tickets, invoices] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30d FROM users WHERE NOT is_admin`),
      db.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='error')::int AS errors, COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30d FROM scenario_runs`),
      db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total, COALESCE(SUM(amount) FILTER (WHERE created_at > now() - interval '30 days'),0)::numeric AS last_30d FROM transactions WHERE type='topup'`),
      db.query(`SELECT COUNT(*) FILTER (WHERE status='open')::int AS open_count, COUNT(*)::int AS total FROM support_tickets`),
      db.query(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending_count FROM bank_invoices`),
    ]);
    res.json({
      users: users.rows[0],
      runs: runs.rows[0],
      revenue: revenue.rows[0],
      tickets: tickets.rows[0],
      invoices: invoices.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Users ----

adminRouter.get('/users', async (req: Request, res: Response) => {
  const search = (req.query.search as string | undefined)?.trim();
  const params: any[] = [200];
  const where = search ? `WHERE u.email ILIKE $2` : '';
  if (search) params.push(`%${search}%`);

  const { rows } = await db.query(
    `SELECT id, email, balance, is_admin, is_active, created_at FROM users u ${where} ORDER BY created_at DESC LIMIT $1`,
    params,
  );
  res.json({ users: rows });
});

const userPatchSchema = z.object({
  is_active: z.boolean().optional(),
  is_admin:  z.boolean().optional(),
});

adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { is_active, is_admin } = parsed.data;
  if (is_active === undefined && is_admin === undefined) {
    res.status(400).json({ error: 'No fields to update' }); return;
  }
  const sets: string[] = [];
  const vals: any[] = [];
  if (is_active !== undefined) { sets.push(`is_active = $${vals.length + 1}`); vals.push(is_active); }
  if (is_admin !== undefined)  { sets.push(`is_admin = $${vals.length + 1}`); vals.push(is_admin); }
  vals.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id, email, is_active, is_admin`,
    vals,
  );
  if (!rows.length) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ok: true, user: rows[0] });
});

// ---- Runs ----

adminRouter.get('/runs', async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  const { rows } = await db.query(
    `SELECT sr.id, sr.status, sr.error_message, sr.cost,
            sr.created_at, sr.finished_at,
            u.email AS user_email,
            s.title AS scenario_title
     FROM scenario_runs sr
     JOIN users u ON u.id = sr.user_id
     JOIN scenarios s ON s.id = sr.scenario_id
     ${status ? 'WHERE sr.status = $2' : ''}
     ORDER BY sr.created_at DESC
     LIMIT $1`,
    status ? [limit, status] : [limit],
  );
  res.json({ runs: rows });
});

adminRouter.post('/runs/:id/retry', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT sr.id, sr.user_id, sr.connection_id, sr.input_data, s.slug AS scenario_slug
     FROM scenario_runs sr JOIN scenarios s ON s.id = sr.scenario_id
     WHERE sr.id = $1 AND sr.status = 'error'`,
    [req.params.id],
  );
  if (!rows.length) { res.status(404).json({ error: 'Failed run not found' }); return; }

  const run = rows[0];
  const { scenarioQueue } = await import('../../queue/queue');
  await db.query(
    `UPDATE scenario_runs SET status = 'queued', error_message = null WHERE id = $1`,
    [run.id],
  );
  await scenarioQueue.add('run', {
    runId: run.id,
    userId: run.user_id,
    scenarioSlug: run.scenario_slug,
    connectionId: run.connection_id,
    inputData: run.input_data,
  });
  res.json({ ok: true, runId: run.id });
});

// ---- Balance ----

const balanceAdjustSchema = z.object({
  amount: z.number().refine(n => n !== 0, 'amount must be non-zero'),
  note: z.string().max(200).optional().default('manual adjustment'),
});

adminRouter.post('/users/:id/balance', async (req: Request, res: Response) => {
  const parsed = balanceAdjustSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const { amount, note } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [amount, req.params.id],
    );
    if (!rows.length) { await client.query('ROLLBACK'); res.status(404).json({ error: 'User not found' }); return; }
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, provider_id) VALUES ($1, 'topup', $2, $3)`,
      [req.params.id, Math.abs(amount), `admin:${note}`],
    );
    await client.query('COMMIT');
    res.json({ ok: true, newBalance: rows[0].balance });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ---- Scenarios ----

adminRouter.patch('/scenarios/:id', async (req: Request, res: Response) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') { res.status(400).json({ error: 'is_active must be boolean' }); return; }
  await db.query('UPDATE scenarios SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
  res.json({ ok: true });
});

const scenarioEditSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  price:       z.number().min(0).optional(),
});

adminRouter.put('/scenarios/:id', async (req: Request, res: Response) => {
  const parsed = scenarioEditSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  const d = parsed.data;
  if (!d.title && d.description === undefined && d.price === undefined) {
    res.status(400).json({ error: 'No fields to update' }); return;
  }
  const sets: string[] = [];
  const vals: any[] = [];
  if (d.title !== undefined)       { sets.push(`title = $${vals.length + 1}`); vals.push(d.title); }
  if (d.description !== undefined) { sets.push(`description = $${vals.length + 1}`); vals.push(d.description); }
  if (d.price !== undefined)       { sets.push(`price = $${vals.length + 1}`); vals.push(d.price); }
  vals.push(req.params.id);
  const { rows } = await db.query(
    `UPDATE scenarios SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true, scenario: rows[0] });
});

// ---- Invoices ----

const markPaidSchema = z.object({ notes: z.string().max(500).optional() });

adminRouter.get('/invoices', async (req: Request, res: Response) => {
  try {
    const { listAllInvoices } = await import('../invoices/invoices.service');
    const status = req.query.status as string | undefined;
    const invoices = await listAllInvoices(status);
    res.json({ invoices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/invoices/:id/html', async (req: Request, res: Response) => {
  try {
    const { getInvoiceById, generateInvoiceHtml } = await import('../invoices/invoices.service');
    const invoice = await getInvoiceById(req.params.id);
    if (!invoice) { res.status(404).json({ error: 'Not found' }); return; }
    const html = await generateInvoiceHtml(invoice);
    const num = invoice.invoice_number.replace(/[^A-Za-z0-9_\-]/g, '-');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="invoice-${num}.html"`);
    res.send(html);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/invoices/:id/mark-paid', async (req: Request, res: Response) => {
  const parsed = markPaidSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  try {
    const { markInvoicePaid } = await import('../invoices/invoices.service');
    const invoice = await markInvoicePaid(req.params.id, req.user!.userId, parsed.data.notes);
    res.json({ ok: true, invoice });
  } catch (err: any) {
    res.status((err as any).status ?? 500).json({ error: err.message });
  }
});

adminRouter.post('/invoices/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `UPDATE bank_invoices SET status = 'cancelled' WHERE id = $1 AND status = 'pending' RETURNING id`,
      [req.params.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Invoice not found or already processed' }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Acts ----

adminRouter.get('/acts', async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT sa.id, sa.act_number, sa.period_from, sa.period_to, sa.amount, sa.created_at,
              u.email AS user_email
       FROM service_acts sa
       JOIN users u ON u.id = sa.user_id
       ORDER BY sa.created_at DESC
       LIMIT 200`,
    );
    res.json({ acts: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/acts/:id/html', async (req: Request, res: Response) => {
  try {
    const { rows } = await db.query(
      `SELECT sa.*, u.email AS user_email FROM service_acts sa JOIN users u ON u.id = sa.user_id WHERE sa.id = $1`,
      [req.params.id],
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const { generateActHtml } = await import('../acts/acts.service');
    const html = await generateActHtml(rows[0]);
    const num = rows[0].act_number.replace(/[^A-Za-z0-9_\-]/g, '-');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="act-${num}.html"`);
    res.send(html);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/acts/generate', async (req: Request, res: Response) => {
  const schema = z.object({
    user_id: z.string().uuid(),
    year:    z.number().int().min(2024).max(2030),
    month:   z.number().int().min(1).max(12),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }
  try {
    const { adminGenerateAct } = await import('../acts/acts.service');
    const act = await adminGenerateAct(parsed.data.user_id, parsed.data.year, parsed.data.month);
    if (!act) { res.status(404).json({ error: 'No billable activity for this period' }); return; }
    res.json({ ok: true, act });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
