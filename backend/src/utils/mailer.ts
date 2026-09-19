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
