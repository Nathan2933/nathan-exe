// Vercel serverless function: emails contact-form messages to the inbox via Resend.
// Env vars (Vercel project settings): RESEND_API_KEY (required), CONTACT_TO (optional, default below)
const TO = process.env.CONTACT_TO || 'nathanjerald293@gmail.com';
const FROM = process.env.CONTACT_FROM || 'Portfolio Contact <onboarding@resend.dev>';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let b = {};
  try { b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { return res.status(400).json({ error: 'Invalid input' }); }
  if (b['bot-field']) return res.status(200).json({ ok: true });          // honeypot: pretend success
  const name = String(b.name || '').trim().slice(0, 100);
  const email = String(b.email || '').trim().slice(0, 200);
  const message = String(b.message || '').trim().slice(0, 3000);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid input' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Mail not configured' });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: email,
      subject: `Portfolio message from ${name.replace(/[\r\n]/g, ' ')}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt;</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'Send failed' });
  return res.status(200).json({ ok: true });
}
