# VAHINI WEDDINGS — Production Photo + Video Upload Edition

Public website and real authenticated admin backend. Not a demo or GitHub-Pages-only site.

## Featured homepage and gallery photographs

Both hero sections have a plain background and a responsive, uncropped image. On desktop/tablet the text is on the left and the photograph is on the right. On phones the full image appears above the text, with no photo cropping.

To change either photograph: open `/admin.html`, sign in, scroll to an uploaded PHOTO in the Media library, then select **Set Home hero** or **Set Gallery hero**. These can be different images. You cannot choose a YouTube film as a hero photo. Changes are live for site visitors after refreshing. If no hero photo has been chosen, the website displays a published photograph automatically.

The two selections are stored as a small settings object in the **existing R2 bucket**, without new database tables or D1 migrations. No gallery images are changed or deleted when a hero is selected.

## Features

- Real original photos uploaded through the website to client-owned **Cloudflare R2 Standard**; stored and served as `/media/images/...` under the site domain. No Cloudinary, ImageKit, Flickr or separate image host. Responsive thumbnails are generated locally by admin browser and stored in R2 to reduce image transfer; originals remain available in the viewer.
- Films: admin uploads MP4, WebM or MOV directly to R2, or enters a YouTube share link and title. YouTube video bytes **are not copied to the site's storage**. Supports regular, youtu.be, live, Shorts and embed links. Gallery renders video thumbnails, lazy-loads `youtube-nocookie.com` player only on click, and includes an open-on-YouTube backup link.
- Gallery categories: All, Film, Indoor photography. All includes media from every category. Admin selects a category for each photo, uploaded film or YouTube film, edits titles/categories, changes cover/thumbnail, reorders or deletes.
- High quality playback: upload films to YouTube in 1080p/4K and wait for HD processing. YouTube automatically decides quality based on viewer network, device and original quality. **A minimum of 780p/720p/1080p cannot be forced through YouTube's embed API**. There is no 780p YouTube quality setting.
- Clean static styling. No skeleton cards, SVG loading placeholders, automatic video fetch on browse, animated image zoom, or page-loading spinners. Photos reserve their aspect ratio, load lazily and degrade gracefully when offline/missing. A short 'Adding film…' button status appears only during the API operation.
- Native phone menu dropdown, desktop/tablet visible links, theme follows OS preference, installable PWA controls, contact links and exact Vahini Studio address/map.
- Admin ID **9027** and separate strong **server-side** password, secure signed session, rate limit. Nothing secret in browser JS or ZIP.

## Monthly cost

- Cloudflare Workers and D1 free tiers cover modest traffic/metadata; usage beyond tier costs extra.
- Cloudflare R2 Standard includes **10 GB-month free storage**, plus free monthly request quotas. Beyond storage free tier it costs **$0.015 / GB-month** plus potential excess operations and taxes (current schedule: https://developers.cloudflare.com/r2/pricing/). Enabling R2 generally requires billing setup even if monthly usage stays free.
- The site stores **photographs and directly uploaded films** in R2. YouTube-linked videos do not count against R2 storage. YouTube embeds do not require a YouTube Data API key.
- This is not a free unlimited media vault. Original photos and directly uploaded videos count toward Cloudflare storage. The uploader enforces 200 MiB/photo and 5 GiB/video.

## Deploy

See `DEPLOY.md`. Owner must create Cloudflare R2 bucket, D1 database, secrets and authorize deployment under **their own account**. Admin `/admin.html` works only after deployment with these services. Test YouTube embed permissions and actual uploads before client launch.

## Restrictions / real-world behavior

YouTube may block embeds for private, age-restricted, copyright-restricted or embedding-disabled videos, and slow networks may stream in SD. YouTube's controls/branding cannot be fully removed. Use Public or Unlisted owner-approved content and enable embedding in YouTube Studio. The gallery has a direct YouTube fallback link, but cannot suppress Google's error inside a third-party iframe when the source is unavailable.

The original site files can be stored on GitHub for version control; a static GitHub Pages site alone cannot provide direct authenticated uploads. Do not store credentials in source or publish unnecessary wedding client/private images. Back up originals separately.


## Direct video uploads (new)

Open `admin.html`, sign in, choose **Upload wedding videos**, select a gallery category and upload an MP4, WebM or MOV file. Each video is stored in the existing Cloudflare R2 bucket and indexed using the existing D1 `media` table (no database migration required). The public gallery plays uploaded videos using the browser's native player, supports byte-range seeking, and does not download the movie until opened. A frame-based thumbnail is generated when the browser supports decoding the source file; otherwise, set a cover manually using **Change thumbnail**.

**Recommended:** MP4 encoded with H.264 video and AAC audio, ideally web-optimized (`faststart`). WebM is supported on most modern browsers, while MOV may not play everywhere. File size cap: 5 GiB per video (200 MiB for photos). Multipart uploads proceed in 16 MiB segments and a failed upload can be retried by reselecting the file; in-progress chunks do not survive a browser reload. Uploaded files consume R2 storage and can incur billing beyond the free tier. YouTube links remain available as an alternative.
