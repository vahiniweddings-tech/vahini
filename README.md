# VAHINI WEDDINGS — Production YouTube + Direct Photo Upload Edition

Public website and real authenticated admin backend. Not a demo or GitHub-Pages-only site.

## Features

- Real original photos uploaded through the website to client-owned **Cloudflare R2 Standard**; stored and served as `/media/images/...` under the site domain. No Cloudinary, ImageKit, Flickr or separate image host. Responsive thumbnails are generated locally by admin browser and stored in R2 to reduce image transfer; originals remain available in the viewer.
- Films: admin enters a YouTube share link and title. YouTube video bytes **are not copied to the site's storage**. Supports regular, youtu.be, live, Shorts and embed links. Gallery renders video thumbnails, lazy-loads `youtube-nocookie.com` player only on click, and includes an open-on-YouTube backup link.
- Gallery categories: All, Film, Indoor photography. All includes media from every category. Admin selects a category for each photo or YouTube film, edits titles/categories, changes cover/thumbnail, reorders or deletes.
- High quality playback: upload films to YouTube in 1080p/4K and wait for HD processing. YouTube automatically decides quality based on viewer network, device and original quality. **A minimum of 780p/720p/1080p cannot be forced through YouTube's embed API**. There is no 780p YouTube quality setting.
- Clean static styling. No skeleton cards, SVG loading placeholders, automatic video fetch on browse, animated image zoom, or page-loading spinners. Photos reserve their aspect ratio, load lazily and degrade gracefully when offline/missing. A short 'Adding film…' button status appears only during the API operation.
- Native phone menu dropdown, desktop/tablet visible links, theme follows OS preference, installable PWA controls, contact links and exact Vahini Studio address/map.
- Admin ID **9027** and separate strong **server-side** password, secure signed session, rate limit. Nothing secret in browser JS or ZIP.

## Monthly cost

- Cloudflare Workers and D1 free tiers cover modest traffic/metadata; usage beyond tier costs extra.
- Cloudflare R2 Standard includes **10 GB-month free storage**, plus free monthly request quotas. Beyond storage free tier it costs **$0.015 / GB-month** plus potential excess operations and taxes (current schedule: https://developers.cloudflare.com/r2/pricing/). Enabling R2 generally requires billing setup even if monthly usage stays free.
- The site stores **photos only**, so YouTube videos do not count against R2 storage. YouTube embeds do not require a YouTube Data API key.
- This is not a free unlimited 1 TB photo vault. Original full-size photos count toward Cloudflare storage. The 200 MiB single-photo limit is enforced by site uploader.

## Deploy

See `DEPLOY.md`. Owner must create Cloudflare R2 bucket, D1 database, secrets and authorize deployment under **their own account**. Admin `/admin.html` works only after deployment with these services. Test YouTube embed permissions and actual uploads before client launch.

## Restrictions / real-world behavior

YouTube may block embeds for private, age-restricted, copyright-restricted or embedding-disabled videos, and slow networks may stream in SD. YouTube's controls/branding cannot be fully removed. Use Public or Unlisted owner-approved content and enable embedding in YouTube Studio. The gallery has a direct YouTube fallback link, but cannot suppress Google's error inside a third-party iframe when the source is unavailable.

The original site files can be stored on GitHub for version control; a static GitHub Pages site alone cannot provide direct authenticated uploads. Do not store credentials in source or publish unnecessary wedding client/private images. Back up originals separately.
