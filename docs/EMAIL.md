# Email: "Email me" button + 8 PM reminder

Two features, one setup. Both send **only to the signed-in user's own address** (the button) or to the address you put in `REMINDER_TO` (the reminder).

| Feature | Where | What it sends |
|---|---|---|
| Email me | Daily Progress Report page, next to Text / PDF | That day's report, to the login email of the person who clicked |
| Reminder | Vercel Cron, every day 20:00 IST (`vercel.json`) | A short "enter today's site data" message with a link. No project data. |

## One-time setup (about 10 minutes)
1. Create a free account at https://resend.com **using the same email as your InfraTrack login**.
   The default sender (`onboarding@resend.dev`) can only deliver to the email the Resend account was created with. To send to other people, verify your own domain in Resend and set `EMAIL_FROM`.
2. In Resend: API Keys -> Create API Key -> copy it.
3. In Vercel: Project -> Settings -> Environment Variables. Add (Production):
   - `RESEND_API_KEY` = the key from step 2
   - `REMINDER_TO` = your login email
   - `CRON_SECRET` = any long random text (at least 16 characters; 32+ is better). Vercel sends it to the cron route automatically.
   - optional `EMAIL_FROM` = `InfraTrack <reports@your-domain>` (only after verifying the domain in Resend)
   - `NEXT_PUBLIC_SITE_URL` = your site URL (used for the link in the reminder)
4. Redeploy (Deployments -> Redeploy).

## Test
- Button: open Daily Progress Report -> Email me. You should get the report within a minute.
- Reminder: Vercel -> Project -> Settings -> Cron Jobs -> `/api/cron/daily-reminder` -> Run.

## Good to know
- Vercel **Hobby** runs a cron once a day and may start it any time inside the scheduled hour (so 8:00-8:59 PM IST, not exactly 8:00). The schedule is in UTC: `30 14 * * *` = 20:00 IST.
- Never put the API key in the code or in chat. Only in Vercel environment variables.
- If the button says "Email is not set up yet", `RESEND_API_KEY` is missing in Vercel or the site was not redeployed.
- Resend free plan has daily/monthly sending limits; one report a day is far below them.
