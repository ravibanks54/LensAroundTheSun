# Lens Around the Sun — Photography Portfolio

A fast, dependency-free photography portfolio. Plain HTML/CSS/JS — no build step,
hosts anywhere, loads instantly. Built to be easy to update without touching code.

---

## Adding, removing & reordering photos

This is the only thing you'll normally do. **Edit one file: [`js/photos.js`](js/photos.js).**

1. Put your image file in the **`photos/`** folder.
2. Open `js/photos.js` and add a line to the list:

   ```js
   { src: "photos/sunset-maui.jpg", title: "Sunset, Maui", category: "Landscape" },
   ```

   - `src` — path to the file (inside `photos/`)
   - `title` — shown in the lightbox (optional)
   - `category` — groups photos and creates the filter buttons (optional)

3. Save. Done — the gallery, filters, and lightbox update automatically.

To **remove** a photo, delete its line. To **reorder**, move lines up/down —
the page order follows the list order.

### Photo tips (for the best-looking site)
- Use **original exports**, not Instagram downloads (IG re-compresses and caps size).
- JPG, long edge **~2000px**, saved around **80% quality** → sharp but fast to load.
- Keep each file under ~500 KB if you can. (See "Optimizing images" below.)
- Any mix of portrait/landscape/square works — the masonry layout adapts.

> The `photos/sample-*.svg` files are placeholders. Delete them once you've added
> real photos (and remove their lines from `js/photos.js`).

---

## Editing the text

Open [`index.html`](index.html) and look for `<!-- EDIT ME -->` comments:
- **About** section — the bio (currently generic; add the real name & story).
- **Contact** — change `hello@example.com` to the real email address.

The Instagram links already point to `instagram.com/lensaroundthesun`.

---

## Viewing it locally

Just open `index.html` in a browser, **or** run a tiny local server (nicer, avoids
any file-path quirks):

```bash
cd LensAroundTheSun
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## Publishing with GitHub Pages (free)

1. Push this repo to GitHub.
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Branch: pick your branch (e.g. `main`), folder: **`/ (root)`**. Save.
5. Wait ~1 minute. Your site goes live at
   `https://<your-username>.github.io/<repo-name>/`.

Every time you push a change, GitHub Pages redeploys automatically.
The `.nojekyll` file is already included so all files are served as-is.

### Custom domain (optional)
In **Settings → Pages → Custom domain**, enter a domain you own (e.g.
`lensaroundthesun.com`) and add the DNS records GitHub shows you. HTTPS is automatic.

---

## Optimizing images (optional but recommended)

If photos are large, shrink them before adding. With [ImageMagick](https://imagemagick.org):

```bash
# resize long edge to 2000px and compress to ~82% quality
magick input.jpg -resize 2000x2000\> -quality 82 photos/output.jpg
```

Or use a free online tool like [Squoosh](https://squoosh.app).

---

## Project structure

```
index.html        # page markup + the About/Contact text to edit
css/style.css     # all styling (dark, image-first theme)
js/photos.js      # ← the photo list you edit
js/main.js        # gallery, category filters, lightbox (no need to edit)
photos/           # image files live here
.nojekyll         # tells GitHub Pages to serve files as-is
```
