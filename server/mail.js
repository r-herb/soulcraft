// Outgoing email through Resend (https://resend.com). The API key lives in
// the Pages secret RESEND_API_KEY; the sender domain is set up by
// scripts/resend-domain.mjs during deploy.
const FROM = 'Soulcraft <noreply@soulcraft.8nomads.com>';

const TEXT = {
  en: {
    subject: 'Reset your Soulcraft password',
    hi: (n) => `Hi ${n},`,
    body: 'Someone (hopefully you) asked to reset the password of your Soulcraft account. Tap the button to choose a new one. The link works for one hour.',
    button: 'Choose a new password',
    ignore: 'If you did not ask for this, ignore this email; your password stays the same.',
  },
  ru: {
    subject: 'Сброс пароля Soulcraft',
    hi: (n) => `Привет, ${n}!`,
    body: 'Кто-то (надеемся, вы) попросил сбросить пароль вашего аккаунта Soulcraft. Нажмите кнопку, чтобы выбрать новый. Ссылка действует один час.',
    button: 'Выбрать новый пароль',
    ignore: 'Если вы этого не просили, просто проигнорируйте письмо: пароль не изменится.',
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function resetEmail({ name, link, lang }) {
  const t = TEXT[lang] || TEXT.en;
  const html = `<!doctype html><html><body style="margin:0;background:#0e0c2b;font-family:Arial,sans-serif;color:#e8ecff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" style="max-width:480px;background:#171445;border:2px solid #4a3fa0;border-radius:8px"><tr><td style="padding:24px">
      <h1 style="margin:0 0 16px;font-size:22px;color:#7ff3ff">Soulcraft</h1>
      <p style="margin:0 0 12px">${esc(t.hi(name))}</p>
      <p style="margin:0 0 20px;line-height:1.5">${esc(t.body)}</p>
      <p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#44d6e8;color:#05040f;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:4px">${esc(t.button)}</a></p>
      <p style="margin:0;font-size:13px;color:#a9b3d6;line-height:1.5">${esc(t.ignore)}</p>
    </td></tr></table>
  </td></tr></table></body></html>`;
  const text = `${t.hi(name)}\n\n${t.body}\n\n${link}\n\n${t.ignore}`;
  return { subject: t.subject, html, text };
}

export async function sendEmail(env, { to, subject, html, text }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) console.error('resend failed', res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error('resend error', e);
    return false;
  }
}
