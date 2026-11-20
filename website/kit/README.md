# SiteKit 1.0.2

A lightbox, modals and the few helpers they share, written for this project's websites with no
third-party code: plain scripts and one stylesheet, no build step, no CDN. The master copy is this
folder; misterdownloadmanager.com uses it as it is, and the other sites carry a synced copy.

| File | What it is |
|---|---|
| `core.js` | `window.SiteKit`: its words, motion tokens, direction, the scroll lock, the Back button, pointer tracking, focus |
| `modal.js` | `SiteKit.modal`: modals on the native `<dialog>` |
| `lightbox.js` | `SiteKit.lightbox`: pictures and videos over the page |
| `kit.css` | the look, every colour, size and timing from custom properties |
| `kit.json` | the version and each file's SHA-256, for the copies' check |
| `check-kit.mjs` | checks a copy against its `kit.json` (node, no dependencies) |

Size, minified and gzipped: the three scripts 9.7 KB together (core 1.7, modal 1.3, lightbox
7.5), the stylesheet 2.1 KB, about 11.9 KB in all; served as written, with no build step, about
17 KB gzipped.

## Use

```html
<link rel="stylesheet" href="/kit/kit.css">          <!-- before the site's own stylesheet -->
<script src="/kit/core.js" defer></script>
<script src="/kit/modal.js" defer></script>            <!-- either or both -->
<script src="/kit/lightbox.js" defer></script>
<script src="/site.js" defer></script>                 <!-- calls init, after the kit -->
```

```js
SiteKit.setStrings({                // the page's language; English when left out
  viewer: "Image viewer", close: "Close", prev: "Previous image", next: "Next image",
  zoomIn: "Zoom in", zoomOut: "Zoom out", counter: "{n} of {total}",
  hint: ""                          // optional line beside the caption, mouse screens only
});
SiteKit.lightbox.init({
  selector: "[data-lightbox]",      // pictures, links or containers that open
  auto: ".prose",                   // containers whose pictures open by themselves, one group each
  skip: "[data-lightbox-skip]",     // never these
  minWidth: 0,                      // smaller pictures (natural or width attribute) stay out
  loop: true,                       // the last one goes on to the first
  wheel: "zoom",                    // "zoom", "nav" or false (Ctrl + wheel and trackpad pinch always zoom)
  clickZoom: true,                  // a click on the picture zooms (else a double click)
  history: true,                    // Back closes it
  caption: null,                    // fn(img) -> text, before figcaption and alt
  size: null,                       // fn(img) -> [width, height] in CSS px at 100%, or null
  onOpen: null, onChange: null, onClose: null   // fn(img, index)
});
```

`SiteKit.lightbox.open(img)`, `.close()`, `.isOpen()`, `.index()`, `.scan()` (marks pictures added
later; clicks are caught on the document, so they open anyway).

### Lightbox markup

- `<a href="big.webp" data-lightbox="trip"><img src="small.webp" alt="…"></a>`: a link to the
  picture works with no script; every element with the same `data-lightbox` name is one group.
- `<figure data-lightbox>…<img>…<img>…</figure>`: a container's pictures are a group.
- `<img data-lightbox>`: a picture alone. Pictures that aren't links become buttons (focusable,
  Enter and Space open them).
- Pictures in an `auto` container join by themselves; a picture that links to a page stays a link.
- Only the pictures laid out count (a hidden day or night version is left out).
- `data-full` (a bigger file), `data-width` and `data-height` (its size, so it opens at the right
  size before it loads), `data-caption`, `data-lightbox-skip`. `srcset` and `sizes` are followed:
  the viewer picks the candidate for its own size and a bigger one when zoomed.
- Video: a link to an `.mp4`, `.webm`, `.ogv`, `.mov` or `.m4v` (or `data-type="video"`), its
  `<img>` the poster. It plays when shown and pauses when left.
- Caption: `data-caption`, else `caption(img)`, else the `figcaption`, else the `alt`.
- Sources (`href`, `data-full`, a video's address, every `srcset` candidate) are used only over
  http or https (a relative path is the page's own); a `javascript:`, `data:` or `blob:` one is
  ignored and the thumbnail's own picture opens instead.

Versions: 1.0.2, a calm backdrop (nearly opaque, the page blurred behind it); 1.0.1, sources
only over http and https; 1.0.0, the first.

What it does: flies the picture from its thumbnail (cropped `object-fit` thumbnails too) and back;
arrows, swipe, ←/→ (mirrored right to left), Home, End, Escape, + − 0; double-click or double-tap
and pinch zoom with clamped, springy panning; a single tap on a phone hides the controls, a drag
down closes; neighbours are loaded ahead; "3 / 12" on screen and "3 of 12. alt" for screen readers;
the focus goes in and comes back; Back closes it; the page doesn't move when its scroll locks.
Reduced motion: fades only.

### Modals

```html
<button data-modal-open="about">About</button>
<dialog id="about" class="kit-modal" data-size="sm" aria-labelledby="about-title">
  <h2 id="about-title">About</h2> …
  <button data-modal-close>Close</button>
</dialog>
```

`data-size`: `sm` (420px), `md` (560px), `lg` (880px), `sheet` (from the bottom edge on phones);
none: the site's own width. `data-dismiss="backdrop esc"` (the default) or fewer words (`""`: only
its buttons close it). `data-history="off"`: Back doesn't close it. `[autofocus]` or
`[data-modal-focus]` inside takes the focus. A `<form method="dialog">` closes it too, with the
same transition. `SiteKit.modal.open(idOrDialog, opener?)`, `.close(dialog?, value?)`, `.top()`;
the dialog fires `kit:open` and `kit:close`. Modals stack (the top layer), Escape closes the top
one, and the lightbox opens over a modal.

### Helpers (core.js)

`SiteKit.lock()` / `.unlock()` (counted; keeps the scrollbar's room with `scrollbar-gutter` or
padding), `.backEntry(fn)` (one history entry; `.release()` takes it out), `.pointers(el, {down,
move, up})`, `.reduced()`, `.ms("--kit-dur", 320)`, `.ease()`, `.rtl(el)`, `.focus(el)`,
`.animate(el, keyframes, options)`, `.text(key, vars)`.

## Theming

Set these on `:root` (and again for a dark theme) in the site's own stylesheet, after `kit.css`:

| Property | Default |
|---|---|
| `--kit-dur`, `--kit-dur-out`, `--kit-dur-fast` | 320ms, 260ms, 160ms |
| `--kit-ease` | cubic-bezier(.16, 1, .3, 1) |
| `--kit-font`, `--kit-focus` | inherit, #7fb0ff |
| `--kit-lb-scrim`, `--kit-lb-scrim-solid`, `--kit-lb-blur` | near-black at 93% over a 20px blur of the page; at 98.5% where there is no blur (no `backdrop-filter`, reduced transparency or reduced motion) |
| `--kit-lb-fg`, `--kit-lb-fg-2` | near-white, at 70% |
| `--kit-lb-btn`, `--kit-lb-btn-hover`, `--kit-lb-btn-fg`, `--kit-lb-btn-size`, `--kit-lb-btn-radius` | white at 10%, 20%, the foreground, 44px, round |
| `--kit-lb-media-radius`, `--kit-lb-media-shadow`, `--kit-lb-cap-size` | 4px, none, 15px |
| `--kit-modal-bg`, `--kit-modal-fg`, `--kit-modal-radius`, `--kit-modal-shadow`, `--kit-modal-scrim`, `--kit-modal-shift` | Canvas, CanvasText, 12px, a soft drop, black at 50%, 12px |

Class hooks: `.kit-lb`, `.kit-lb-btn`, `.kit-lb-cap`, `.kit-lb-count`, `.kit-lb-zoomable`,
`.kit-modal`, `html.kit-locked`.

## Versions and copies

The files start with the same header line, `SiteKit <version> | synced from
anefzaoui/misterdownloadmanager website/kit/`. Change the kit here only: bump `VERSION` in
`tools/website/kit.py`, run `python tools/website/kit.py stamp`, then in each site's repository
copy it with `python tools/website/kit.py sync <its kit folder> <its check script>`. The site's
build here refuses a kit that doesn't match `kit.json`; each copy's check does the same there.

Tested by `tools/website/kit-test/e2e.mjs` (headless Chromium and Firefox; see its header).

The kit is under the MIT License (Copyright the Mister Download Manager contributors), so every
site may carry it whatever its own licence.
