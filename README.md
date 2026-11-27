# Dharashiv Today — independent newsroom

Website: https://www.dharashivtoday.com/
Admin: https://www.dharashivtoday.com/admin/

Enable GitHub Pages using GitHub Actions in Settings > Pages. The build generates story pages, metadata and sitemap. For publishing use a fine-grained token with Contents read/write on this repository only. Never commit credentials. A separate Cloudflare publisher is optional and not configured. The build uses the canonical production domain to generate root-relative paths, story metadata, and sitemap, regardless of stale GitHub Pages base URL metadata.
