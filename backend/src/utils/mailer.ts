import nodemailer from 'nodemailer';
import { config } from '../config';

function createTransport() {
  if (!config.smtp.host) return null;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

export interface DigestData {
  revenue7d: number;
  netPayout7d: number;
  qty7d: number;
  byPlatform: { platform: string; revenue: number; netPayout: number }[];
  stockAlerts: { title: string; platform: string; qty: number }[];
  unread: number;
  appUrl: string;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const transport = createTransport();
  if (!transport) {
    // Dev fallback: just log the link
    console.log(`[mailer] Password reset link for ${to}: ${resetUrl}`);
    return;
  }

  await transport.sendMail({
    from: `"NeuroGrid" <${config.smtp.from}>`,
    to,
    subject: 'Сброс пароля NeuroGrid',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#7c3aed">NeuroGrid</h2>
        <p>Вы запросили сброс пароля. Нажмите на кнопку ниже — ссылка действует <strong>1 час</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin:20px 0;padding:12px 24px;
                  background:#7c3aed;color:#fff;text-decoration:none;
                  border-radius:8px;font-weight:600">
          Сбросить пароль
        </a>
        <p style="color:#64748b;font-size:13px">
          Если вы не запрашивали сброс — просто проигнорируйте это письмо.<br>
          Ссылка: <a href="${resetUrl}">${resetUrl}</a>
        </p>
      </div>
    `,
  });
}

const PLATFORM_NAMES: Record<string, string> = { wb: 'WildBerries', ozon: 'Ozon', ym: 'Яндекс Маркет', mm: 'Мегамаркет' };
const PLATFORM_COLORS: Record<string, string> = { wb: '#ec4899', ozon: '#3b82f6', ym: '#f59e0b', mm: '#22c55e' };

function fmt(n: number) { return Math.round(n).toLocaleString('ru-RU'); }

export async function sendDailyDigest(to: string, d: DigestData) {
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const platformRows = d.byPlatform.length
    ? d.byPlatform.map((p) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${PLATFORM_COLORS[p.platform] ?? '#94a3b8'};margin-right:6px"></span>
            ${PLATFORM_NAMES[p.platform] ?? p.platform}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmt(p.revenue)} ₽</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#16a34a">${fmt(p.netPayout)} ₽</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;color:#94a3b8;text-align:center">Нет данных за 7 дней</td></tr>`;

  const alertRows = d.stockAlerts.length
    ? d.stockAlerts.slice(0, 8).map((a) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:6px">
          <span style="font-weight:700;color:#d97706;min-width:24px;text-align:center">${a.qty}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.title}</div>
            <div style="font-size:11px;color:#64748b">${PLATFORM_NAMES[a.platform] ?? a.platform}</div>
          </div>
        </div>`).join('')
    : `<p style="color:#16a34a;font-size:13px;margin:0">Все товары в наличии ✓</p>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px">
    <div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px">NeuroGrid</div>
    <div style="font-size:13px;color:#c4b5fd;margin-top:4px">Ежедневный дайджест · ${today}</div>
  </div>

  <!-- KPIs -->
  <div style="padding:24px 32px 0">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td width="33%" style="padding-right:6px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
            <tr><td style="padding:14px;text-align:center">
              <div style="font-size:11px;color:#64748b;margin-bottom:4px">Выручка 7д</div>
              <div style="font-size:18px;font-weight:800;color:#1e293b">${fmt(d.revenue7d)} ₽</div>
            </td></tr>
          </table>
        </td>
        <td width="33%" style="padding-left:3px;padding-right:3px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
            <tr><td style="padding:14px;text-align:center">
              <div style="font-size:11px;color:#16a34a;margin-bottom:4px">Выплата 7д</div>
              <div style="font-size:18px;font-weight:800;color:#15803d">${fmt(d.netPayout7d)} ₽</div>
            </td></tr>
          </table>
        </td>
        <td width="33%" style="padding-left:6px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px">
            <tr><td style="padding:14px;text-align:center">
              <div style="font-size:11px;color:#7c3aed;margin-bottom:4px">Продано шт.</div>
              <div style="font-size:18px;font-weight:800;color:#6d28d9">${d.qty7d}</div>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </div>

  <!-- By platform -->
  <div style="padding:0 32px 24px">
    <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">По площадкам</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Площадка</th>
          <th style="padding:8px 12px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Выручка</th>
          <th style="padding:8px 12px;text-align:right;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0">Выплата</th>
        </tr>
      </thead>
      <tbody>${platformRows}</tbody>
    </table>
  </div>

  <!-- Stock alerts -->
  <div style="padding:0 32px 24px">
    <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">
      Остатки${d.stockAlerts.length > 0 ? ` · <span style="color:#d97706">${d.stockAlerts.length} требуют пополнения</span>` : ''}
    </div>
    ${alertRows}
  </div>

  <!-- CTA -->
  <div style="padding:0 32px 28px;text-align:center">
    ${d.unread > 0 ? `<div style="margin-bottom:16px;font-size:13px;color:#64748b">${d.unread} непрочитанных уведомлений в системе</div>` : ''}
    <a href="${d.appUrl}/dashboard"
       style="display:inline-block;padding:12px 28px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">
      Открыть дашборд →
    </a>
  </div>

  <!-- Footer -->
  <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#94a3b8">
      Вы получаете этот дайджест каждое утро.
      <a href="${d.appUrl}/notifications" style="color:#7c3aed;text-decoration:none">Отключить рассылку</a>
    </p>
  </div>
</div>
</body>
</html>`;

  const transport = createTransport();
  if (!transport) {
    console.log(`[mailer] digest for ${to}: rev=${fmt(d.revenue7d)} qty=${d.qty7d} alerts=${d.stockAlerts.length}`);
    return;
  }
  await transport.sendMail({
    from: `"NeuroGrid" <${config.smtp.from}>`,
    to,
    subject: `NeuroGrid дайджест · ${today}`,
    html,
  });
}
