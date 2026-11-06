# Deploy Vahini Weddings — YouTube Edition (client-owned account)

This is a real Workers + D1 + R2 website. **Not published yet.** The client's email address alone is not an authorization token and is not enough to publish or upload on their behalf.

## Required information

- Client creates/signs into a Cloudflare account with their own email and activates R2 billing; R2 Standard has a 10 GB-month free tier, not unlimited free storage.
- Their desired domain (optional; Worker receives a temporary `workers.dev` subdomain).
- A strong admin password of at least 16 random characters, **never placed inside website source code**. Login ID is fixed at `9027`.
- Approved wedding photos for gallery and YouTube Public/Unlisted links for films; enable embedding. Upload videos at least at 1080p and wait for YouTube HD processing.
- Confirm address: Vahini Studio, Mekkah Tower, Court Road, Manjeri, Malappuram 676121; phone 9895066015. Verify map pin https://maps.app.goo.gl/6cdW9ZWCkGwZEn8e9 with client.

## Install and deploy

Node.js 22+ is recommended. Extract this folder, then in terminal:

```sh
npm install
npx wrangler login
npx wrangler r2 bucket create vahini-media
npx wrangler d1 create vahini-db
```

Copy the newly generated database ID to `wrangler.toml` under `[[d1_databases]]`. Then:

```sh
npm run db:apply
npm run deploy
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
```

Enter the real password and a **different**, cryptographically random 32+ byte secret when prompted. Generate the second privately with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The client owns all resources and billing. Do not paste Cloudflare or YouTube passwords in chats or repos. No YouTube API key or Cloudinary account is needed. R2 Worker bindings, not R2 access-key pairs, provide image storage access.

To update an *already deployed* previous edition: reuse its existing bucket and D1 database ID, apply the new source using `npm run deploy`, and refresh the PWA. **Do not recreate the existing R2 bucket or D1 database** or media could be lost. No database schema changes are required by this edition. The two hero image selections are stored in the existing R2 bucket. Existing R2 videos, if any, remain readable, but the new admin only adds films through YouTube links.

## First visit and publish verification

1. Go to your assigned `https://<client-subdomain>.workers.dev/admin.html`; log in as `9027` + private password.
2. Upload a real JPEG/WebP photo and verify on an incognito browser or separate phone that the photo appears and can open full-size.
3. Open YouTube Studio in the studio's own YouTube account. Upload a video as Public or Unlisted, leave embedding enabled, and wait until HD (1080p or higher) is processed.
4. Add the YouTube URL in **Add a YouTube film** along with a descriptive title. Choose Film, All or Indoor Photography. Confirm it appears in the public gallery and in the film filter as expected. Open it on phone and desktop. If YouTube blocks embedding, use the visible 'Watch on YouTube' fallback and correct YouTube visibility/embedding policy.
5. Optionally use **Change thumbnail** in the admin gallery item to attach a custom cover image for a film; image is saved to R2 and displayed in the gallery before play.
6. In the admin media cards, choose **Set Home hero** and **Set Gallery hero** on two existing uploaded photographs; verify that each page shows its chosen photo without cropping on desktop/tablet/phone. Verify category edits, change thumbnail, move to top, delete and media pagination. Confirm the mobile hamburger only on mobile; desktop/tablet links remain visible.
7. Test Get directions and Maps link, WhatsApp and phone links; PWA installation on supported browsers; basic accessibility and device theme.
8. Monitor R2 usage/billing. Cloudflare R2 Standard free tier is 10 GB-month and requests up to allowances; photos above that cost money.
9. Connect custom domain via Workers & Pages → Worker → Settings → Domains & Routes → Add Custom Domain. This requires owner-controlled DNS. The exact interface may vary.

## YouTube quality limitation

YouTube's iframe API **does not support forcing a minimum 720p, 780p or 1080p**. The service chooses bitrate/resolution on its own, considering device and connection. There is no '780p' standard YouTube quality. Upload source at 1080p or 4K, wait for HD processing, and allow the user to select quality in player controls. For guaranteed minimum bitrates you would have to host/transcode the media yourself instead of using YouTube.

## Troubleshooting

- If /admin.html signs in but no gallery loads, verify Worker env bindings (`DB`, `MEDIA`) and D1 schema.
- If upload fails, check R2 account setup, user permissions, and Cloudflare logs.
- If a YouTube film appears but won't play, open the video in YouTube and check permission, copyright, embedding policies and whether the HD version has processed.
- If an updated page still looks old, reload the page and verify service worker cache updated (cache version is `vahini-hero-photo-layout-4`).
- If the studio needs more than 10 GB original photos, budget for R2 storage; using YouTube does not eliminate photo storage costs.
