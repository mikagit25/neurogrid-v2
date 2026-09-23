import { db } from '../../db';
import { PLAN_PRICES } from '../subscriptions/subscriptions.service';
import { renderInvoiceHtml, type InvoiceData } from './invoice.template';

function formatDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function nextInvoiceNumber(client: any): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM bank_invoices WHERE invoice_number LIKE $1`,
    [`СЧ-${year}-%`],
  );
  const seq = String((rows[0].cnt ?? 0) + 1).padStart(6, '0');
  return `СЧ-${year}-${seq}`;
}

export async function requestInvoice(
  userId: string,
  plan: 'start' | 'business',
  months: number,
  payerName?: string,
) {
  const amount = PLAN_PRICES[plan] * months;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const invoiceNumber = await nextInvoiceNumber(client);
    const { rows } = await client.query(
      `INSERT INTO bank_invoices (user_id, invoice_number, plan, months, amount, payer_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, invoiceNumber, plan, months, amount, payerName || null],
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getInvoices(userId: string) {
  const { rows } = await db.query(
    `SELECT id, invoice_number, plan, months, amount, status, created_at, paid_at
     FROM bank_invoices WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getInvoiceForUser(invoiceId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT bi.*, u.email AS user_email
     FROM bank_invoices bi JOIN users u ON u.id = bi.user_id
     WHERE bi.id = $1 AND bi.user_id = $2`,
    [invoiceId, userId],
  );
  return rows[0] ?? null;
}

export async function getInvoiceById(invoiceId: string) {
  const { rows } = await db.query(
    `SELECT bi.*, u.email AS user_email
     FROM bank_invoices bi JOIN users u ON u.id = bi.user_id
     WHERE bi.id = $1`,
    [invoiceId],
  );
  return rows[0] ?? null;
}

export async function generateInvoiceHtml(invoice: any): Promise<string> {
  const data: InvoiceData = {
    invoiceNumber: invoice.invoice_number,
    date: formatDate(new Date(invoice.created_at)),
    payerEmail: invoice.user_email,
    payerName: invoice.payer_name || undefined,
    planName: invoice.plan,
    months: invoice.months,
    amount: parseFloat(invoice.amount),
  };
  return renderInvoiceHtml(data);
}

// ---- Admin functions ----

export async function listAllInvoices(status?: string) {
  const where = status ? 'WHERE bi.status = $1' : '';
  const params = status ? [status] : [];
  const { rows } = await db.query(
    `SELECT bi.*, u.email AS user_email
     FROM bank_invoices bi JOIN users u ON u.id = bi.user_id
     ${where}
     ORDER BY bi.created_at DESC LIMIT 200`,
    params,
  );
  return rows;
}

export async function markInvoicePaid(
  invoiceId: string,
  adminUserId: string,
  notes?: string,
) {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
  if (invoice.status === 'paid') throw Object.assign(new Error('Invoice already paid'), { status: 409 });

  const { upgradePlan } = await import('../subscriptions/subscriptions.service');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE bank_invoices
       SET status = 'paid', paid_at = now(), paid_by = $1, notes = COALESCE($2, notes)
       WHERE id = $3`,
      [adminUserId, notes || null, invoiceId],
    );

    // Record the top-up in transactions table for balance history
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, provider_id)
       VALUES ($1, 'topup', $2, $3)`,
      [invoice.user_id, invoice.amount, `invoice:${invoice.invoice_number}`],
    );

    await client.query('COMMIT');

    // Activate subscription (outside the transaction — non-critical if this fails, can retry)
    await upgradePlan(invoice.user_id, invoice.plan, invoice.months);

    return invoice;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelInvoice(invoiceId: string, userId: string) {
  const { rows } = await db.query(
    `UPDATE bank_invoices SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`,
    [invoiceId, userId],
  );
  if (!rows.length) throw Object.assign(new Error('Invoice not found or cannot be cancelled'), { status: 404 });
}
