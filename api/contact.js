/**
 * Vercel setup:
 * - Keep this file at project-root/api/contact.js.
 * - Add these Environment Variables in Vercel Project Settings:
 *   RESEND_API_KEY
 *   CONTACT_TO_EMAIL=info@lyv.co.in
 *   CONTACT_FROM_EMAIL=no-reply@your-verified-domain.com
 *
 * CONTACT_FROM_EMAIL must be verified in Resend. The visitor email is used as
 * Reply-To, never as From.
 */

const DEFAULT_TO_EMAIL = "info@lyv.co.in";
const SITE_NAME = "Lyv Eventia & Co.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;

async function createResendClient(apiKey) {
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalize(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function validatePayload(payload) {
  const data = {
    name: normalize(payload.name, 120),
    email: normalize(payload.email, 160),
    phone: normalize(payload.phone, 40),
    company: normalize(payload.company, 160),
    service: normalize(payload.service || payload.requirement, 160),
    message: normalize(payload.message, 3000),
    website: normalize(payload.website, 200)
  };
  const errors = {};

  if (data.website) {
    return { data, errors, spam: true };
  }

  if (data.name.length < 2) errors.name = "Please enter your full name.";
  if (!EMAIL_PATTERN.test(data.email)) errors.email = "Please enter a valid email address.";
  if (data.phone && !PHONE_PATTERN.test(data.phone)) errors.phone = "Please enter a valid phone number.";
  if (!data.service) errors.service = "Please select a service.";
  if (!data.message) errors.message = "Please add a short message.";

  return { data, errors, spam: false };
}

function buildEmailContent(data, toEmail) {
  const subjectCompany = data.company || "Website";
  const subject = `${SITE_NAME}: ${subjectCompany} - ${data.service}`;
  const rows = [
    ["Name", data.name],
    ["Email", data.email],
    ["Phone", data.phone || "-"],
    ["Company", data.company || "-"],
    ["Service", data.service],
    ["Recipient", toEmail]
  ];
  const text = [
    `New enquiry from ${SITE_NAME}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Message:",
    data.message
  ].join("\n");
  const htmlRows = rows
    .map(([label, value]) => `<tr><th align="left">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#17252f">
      <h2 style="margin:0 0 14px">New enquiry from ${escapeHtml(SITE_NAME)}</h2>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse">${htmlRows}</table>
      <h3 style="margin:18px 0 8px">Message</h3>
      <p style="white-space:pre-line;margin:0">${escapeHtml(data.message)}</p>
    </div>
  `;

  return { subject, text, html };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "Method not allowed." });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: "Invalid JSON request body." });
  }

  const { data, errors, spam } = validatePayload(payload || {});
  if (spam) {
    return sendJson(res, 200, { ok: true });
  }
  if (Object.keys(errors).length) {
    return sendJson(res, 400, {
      ok: false,
      error: "Please correct the highlighted fields before sending.",
      fields: errors
    });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!resendApiKey || !toEmail || !fromEmail) {
    console.error("Missing contact form environment variables.");
    return sendJson(res, 500, {
      ok: false,
      error: "Contact form is not configured yet. Please try again later."
    });
  }

  const { subject, text, html } = buildEmailContent(data, toEmail);
  try {
    const resend = await createResendClient(resendApiKey);
    const result = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      replyTo: data.email,
      subject,
      text,
      html
    });

    if (result.error) {
      console.error("Resend send failed:", result.error);
      return sendJson(res, 502, {
        ok: false,
        error: "We could not send your enquiry right now. Please try again."
      });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Contact send failed:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "Something went wrong while sending. Please try again."
    });
  }
};
