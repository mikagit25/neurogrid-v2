import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../auth/auth.middleware';
import { db } from '../../db';
import { sendMail } from '../../utils/mailer';
import { config } from '../../config';

export const supportAdminRouter = Router();
supportAdminRouter.use(authenticate, requireAdmin);

const TOPIC_LABELS: Record<string, string> = {
  tech:      'Техническая проблема',
  billing:   'Вопрос по оплате / тарифу',
  feature:   'Предложение по улучшению',
  complaint: 'Жалоба',
  other:     'Другое',
};

const replySchema = z.object({
  message:    z.string().min(1).max(5000),
  new_status: z.enum(['open', 'replied', 'closed']).optional().default('replied'),
});

// GET /api/admin/support?status=&limit=
supportAdminRouter.get('/', async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit  = Math.min(Number(req.query.limit ?? 100), 500);

  const where  = status ? 'WHERE st.status = $2' : '';
  const params = status ? [limit, status] : [limit];

  const { rows } = await db.query(
    `SELECT st.id, st.topic, st.subject, st.status, st.created_at, st.updated_at,
            u.email    AS user_email,
            st.guest_email,
            COUNT(sr.id)::int AS reply_count
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     LEFT JOIN support_replies sr ON sr.ticket_id = st.id
     ${where}
     GROUP BY st.id, u.email
     ORDER BY st.updated_at DESC
     LIMIT $1`,
    params,
  );
  res.json({ tickets: rows });
});

// GET /api/admin/support/:id
supportAdminRouter.get('/:id', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT st.*, u.email AS user_email
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     WHERE st.id = $1`,
    [req.params.id],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }

  const { rows: replies } = await db.query(
    `SELECT sr.id, sr.is_admin, sr.message, sr.created_at,
            u.email AS author_email
     FROM support_replies sr
     LEFT JOIN users u ON u.id = sr.author_id
     WHERE sr.ticket_id = $1
     ORDER BY sr.created_at ASC`,
    [req.params.id],
  );
  res.json({ ticket: rows[0], replies });
});

// POST /api/admin/support/:id/reply
supportAdminRouter.post('/:id/reply', async (req: Request, res: Response) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0].message }); return; }

  const { rows } = await db.query(
    `SELECT st.*, u.email AS user_email
     FROM support_tickets st
     LEFT JOIN users u ON u.id = st.user_id
     WHERE st.id = $1`,
    [req.params.id],
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }

  const ticket = rows[0];
  const { message, new_status } = parsed.data;

  await db.query(
    `INSERT INTO support_replies (ticket_id, author_id, is_admin, message) VALUES ($1, $2, true, $3)`,
    [req.params.id, req.user!.userId, message],
  );
  await db.query(
    `UPDATE support_tickets SET status = $1, updated_at = now() WHERE id = $2`,
    [new_status, req.params.id],
  );

  // Email notification to user
  const recipientEmail = ticket.user_email || ticket.guest_email;
  if (recipientEmail) {
    const topicLabel = TOPIC_LABELS[ticket.topic] ?? ticket.topic;
    try {
      await sendMail({
        to: recipientEmail,
        subject: `Ответ по обращению: ${ticket.subject}`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:24px 28px;border-radius:12px 12px 0 0">
              <div style="font-size:18px;font-weight:800;color:#fff">NeuroGrid</div>
              <div style="font-size:12px;color:#c4b5fd;margin-top:4px">Служба поддержки</div>
            </div>
            <div style="background:#fff;padding:24px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
              <p style="color:#374151;margin:0 0 8px">Здравствуйте!</p>
              <p style="color:#374151;margin:0 0 16px">Мы ответили на ваше обращение <b>«${ticket.subject}»</b> (тема: ${topicLabel}).</p>
              <div style="background:#f8fafc;border-left:4px solid #7c3aed;padding:14px 16px;border-radius:4px;margin-bottom:20px">
                <div style="font-size:12px;color:#7c3aed;font-weight:600;margin-bottom:6px">Ответ службы поддержки</div>
                <div style="color:#1e293b;font-size:14px;white-space:pre-line">${message}</div>
              </div>
              <a href="${config.frontendUrl}/support"
                 style="display:inline-block;padding:11px 22px;background:#7c3aed;color:#fff;
                        text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
                Открыть обращение →
              </a>
              <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
                По всем вопросам: <a href="mailto:${config.smtp.from}" style="color:#7c3aed">${config.smtp.from}</a>
              </p>
            </div>
          </div>`,
      });
    } catch (err) {
      console.error('[support] email notification failed:', err);
    }
  }

  res.json({ ok: true });
});

// PATCH /api/admin/support/:id — change status
supportAdminRouter.patch('/:id', async (req: Request, res: Response) => {
  const status = req.body?.status;
  if (!['open', 'replied', 'closed'].includes(status)) {
    res.status(400).json({ error: 'status must be open | replied | closed' });
    return;
  }
  await db.query(
    `UPDATE support_tickets SET status = $1, updated_at = now() WHERE id = $2`,
    [status, req.params.id],
  );
  res.json({ ok: true });
});
