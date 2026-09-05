// EasyEV outbound mail.
//
// Sends the buyer's own confirmation from a Gmail account over SMTP, so the
// booking conversation ends with something in their inbox that carries the
// Decision Passport rather than only a bare calendar invite.
//
// Gmail app passwords are shown to the user in groups of four ("abcd efgh ijkl
// mnop"); the spaces are display-only and SMTP rejects them, so they are
// stripped here rather than relying on the value being pasted perfectly.

import nodemailer from 'nodemailer';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export class Mailer {
  constructor({ user = '', appPassword = '', fromName = 'EasyEV' } = {}) {
    this.user = user.trim();
    this.appPassword = appPassword.replace(/\s+/g, '');
    this.fromName = fromName;
    this.live = Boolean(this.user && this.appPassword);
    this.transport = this.live
      ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: this.user, pass: this.appPassword },
      })
      : null;
    this.sent = [];
  }

  status() {
    return { mail: this.live ? 'gmail' : 'off', from: this.live ? this.user : null };
  }

  /** Verifies the SMTP credentials without sending anything. */
  async verify() {
    if (!this.live) return { ok: false, error: 'Gmail is not configured.' };
    try {
      await this.transport.verify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  bookingHtml({ name, when, demoType, vehicle, shortlist, ownership, specialistNote, hasReport, calendarInviteSeparate }) {
    const rows = [
      ['When', when],
      ['Type', demoType],
      vehicle ? ['Vehicle', vehicle] : null,
    ].filter(Boolean);

    const facts = [];
    if (shortlist && shortlist.length) facts.push(`<li>Shortlist we built together: <strong>${escapeHtml(shortlist.join(', '))}</strong></li>`);
    if (ownership) facts.push(`<li>${escapeHtml(ownership)}</li>`);
    if (specialistNote) facts.push(`<li>From your specialist: <em>${escapeHtml(specialistNote)}</em></li>`);

    return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f7f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#14211b;">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px;">
    <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0b6e4f;font-weight:700;margin-bottom:14px;">EasyEV</div>
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;">Your ${escapeHtml(demoType || 'test drive')} is booked</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#47574f;">
      ${name ? escapeHtml(name) + ', t' : 'T'}hanks for talking to us. Everything below is confirmed &mdash; you do not need to reply.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #d6e0d9;border-radius:8px;overflow:hidden;margin-bottom:22px;">
      ${rows.map(([k, v], i) => `<tr${i ? ' style="border-top:1px solid #eef3ef;"' : ''}>
        <td style="padding:13px 16px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a8a82;width:34%;">${escapeHtml(k)}</td>
        <td style="padding:13px 16px;font-size:15px;font-weight:600;">${escapeHtml(v)}</td>
      </tr>`).join('')}
    </table>

    ${facts.length ? `<h2 style="margin:0 0 8px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7a8a82;">From our conversation</h2>
    <ul style="margin:0 0 22px;padding-left:20px;font-size:14.5px;line-height:1.6;color:#47574f;">${facts.join('')}</ul>` : ''}

    ${hasReport ? `<div style="background:#dcefe5;border:1px solid #b9dccb;border-radius:8px;padding:15px 17px;margin-bottom:20px;">
      <strong style="display:block;font-size:14.5px;margin-bottom:4px;">Your Decision Report is attached</strong>
      <span style="font-size:13.5px;color:#47574f;">Your profile, the vehicles we compared, running-cost numbers and charging notes &mdash; all in one PDF.</span>
    </div>` : ''}

    ${calendarInviteSeparate ? `<p style="margin:0 0 18px;font-size:13px;color:#7a8a82;line-height:1.5;">
      A separate calendar invite is on its way from our booking system &mdash; use that one to add this to your calendar.
    </p>` : ''}

    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #d6e0d9;font-size:12px;color:#7a8a82;line-height:1.6;">
      Prices, range and running-cost figures are indicative and need to be confirmed with an authorised dealer before you buy.
      To change or cancel this booking, just reply to this email.
    </p>
  </div>
</body></html>`;
  }

  async sendBookingConfirmation({ to, name, when, demoType, vehicle, shortlist, ownership, specialistNote, reportPdf, reportFilename, calendarInviteSeparate = true }) {
    if (!this.live) return { sent: false, skipped: true, reason: 'Gmail is not configured.' };
    if (!to) return { sent: false, skipped: true, reason: 'No buyer email address.' };

    const subject = `Your EasyEV ${demoType || 'test drive'} is booked — ${when}`;
    const message = {
      from: `"${this.fromName}" <${this.user}>`,
      to,
      subject,
      html: this.bookingHtml({ name, when, demoType, vehicle, shortlist, ownership, specialistNote, hasReport: Boolean(reportPdf), calendarInviteSeparate }),
      text: [
        `Your ${demoType || 'test drive'} is booked.`,
        '',
        `When: ${when}`,
        vehicle ? `Vehicle: ${vehicle}` : '',
        shortlist && shortlist.length ? `Shortlist: ${shortlist.join(', ')}` : '',
        ownership || '',
        specialistNote ? `From your specialist: ${specialistNote}` : '',
        '',
        reportPdf ? 'Your Decision Report is attached as a PDF.' : '',
        'Prices and range figures are indicative; confirm with an authorised dealer before buying.',
      ].filter(Boolean).join('\n'),
      ...(reportPdf ? {
        attachments: [{
          filename: reportFilename || 'EasyEV-decision-report.pdf',
          content: reportPdf,
          contentType: 'application/pdf',
        }],
      } : {}),
    };

    try {
      const info = await this.transport.sendMail(message);
      const record = { to, subject, messageId: info.messageId, sentAt: new Date().toISOString(), hadAttachment: Boolean(reportPdf) };
      this.sent.push(record);
      if (this.sent.length > 50) this.sent.shift();
      return { sent: true, ...record };
    } catch (error) {
      return { sent: false, error: error.message };
    }
  }
}
