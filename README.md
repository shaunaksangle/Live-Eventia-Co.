# Lyv Eventia Static Site

This is a plain static HTML/CSS/JS website deployed on Vercel. The contact form
uses the root-level Vercel serverless function at `api/contact.js`.

## Local Testing

1. Copy `.env.example` to `.env.local`.
2. Fill in real values:
   - `RESEND_API_KEY`
   - `CONTACT_TO_EMAIL=info@lyv.co.in`
   - `CONTACT_FROM_EMAIL` using a Resend-verified sender, such as `no-reply@your-verified-domain.com`.
3. Run `npm install`.
4. Run `npx vercel dev` or `npm run dev` if the Vercel CLI is available.
5. Open the localhost URL printed by Vercel.

Do not put Resend API keys or SMTP passwords in frontend files. The browser only
submits to `/api/contact`; the secret key is used only by the serverless function.
