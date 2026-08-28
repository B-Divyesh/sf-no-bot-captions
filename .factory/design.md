# No-Bot Captions — visual thesis

## Direction: the private signal console

No-Bot Captions uses a **pixel/demoscene language** because its job is to turn an
ephemeral audio signal into legible, user-owned words without adding another
person to the room. The product should feel like a small trusted instrument on
the edge of a meeting: precise, local, and visibly active. It must not resemble
a meeting dashboard, an AI chat product, or a generic SaaS landing page.

The single-mode dark canvas is intentional. Large rolling captions remain the
brightest object, capture state reads at a glance beside a persistent square
status lamp, and recovery controls sit exactly where a dropped fragment
appears. Pixel edges and a sparse scanline texture establish the demoscene
world; readable type, generous leading, and broad touch targets keep the tool
calm during a real call.

## Tokens

### Palette

- `signal-void` `#080d0c` — explicit page background, like an unlit display.
- `panel` `#111a17` and `panel-raised` `#17231f` — grouped controls and overlays.
- `phosphor` `#b9ffdc` — primary text and live signal; 17.0:1 on the void.
- `paper` `#eef8f2` — reading text; 17.4:1 on the void.
- `muted` `#a6bdb2` — secondary copy; 9.4:1 on the void.
- `beam` `#51f6aa` / `beam-ink` `#062016` — primary actions and focus.
- `amber` `#ffcc66` / `amber-ink` `#2b1d00` — uncertain audio and recovery.
- `danger` `#ff8f8f` — capture or device errors.
- `line` `#365247` — dividers and inactive controls (paired with labels, never
  the only state cue).

All text combinations target WCAG AA; the product has one explicit dark
treatment rather than a decorative theme switch because stable contrast is
part of the caption instrument.

### Typography

- Display and numeric labels: **Departure Mono**, self-hosted WOFF2, with a
  system monospace fallback. Its squared counters provide the pixel signal
  voice without sacrificing words at caption sizes.
- Body and controls: **Atkinson Hyperlegible**, self-hosted WOFF2, with system
  UI fallbacks. Its differentiated glyphs serve hard-of-hearing readers and
  long live sessions.
- Scale: 12px telemetry, 15px labels, 17px body, 22px section title, fluid
  30–52px captions, 42–68px product statement. Body is never below 16px.
- Reading measure is 68ch; caption measure is 30ch with 1.25 line height.

### Spacing and shape

An 8px base rhythm with 4px only for tight label relationships. Page gutters
are 16px on phones, 32px on tablets, and 48px on desktops. Controls are at
least 48px high with 12px between adjacent targets. Corners are clipped by
2–4px rather than softly rounded; a one-pixel inner highlight makes controls
feel like physical console keys. Captions use open space instead of card
chrome.

## Interaction grammar

- The sole primary action changes from **Choose meeting audio** to **Stop
  captions** in place. Capture is never hidden: a lamp, text label, elapsed
  time, and source name persist while active.
- A consent gate explains exactly what the browser will share before the
  system picker opens. Nothing starts on page load.
- New caption lines rise by 8px and settle in 180ms. An uncertain line arrives
  with an amber left rail, a literal “Uncertain” label, and **Replay 12 s** plus
  **Try again** actions.
- Replaying reveals a compact waveform/progress strip at the uncertain line’s
  origin. Keyboard shortcuts are shown beside the corresponding controls:
  Space toggles pause, R replays, and T retries when focus is outside a field.
- Status and errors use live regions, plain language, and a next action. Color
  never carries state alone.
- On a 390px phone the explanatory art and secondary telemetry disappear;
  capture, live captions, uncertainty repair, and settings stack in that order.

## Motion policy

UI transitions last 150–220ms and animate only transform and opacity. A
one-time segmented signal sweep may run after capture begins; there are no
continuous loops or flashing indicators. Under `prefers-reduced-motion`, all
movement becomes an instant opacity change, progress remains numerical, and
the scanline texture is static.

## Original asset plan and prompt sheet

The hero/help illustration is a generated pixel-art cutaway of one laptop
capturing an abstract meeting waveform locally. It explains “signal enters
this device and becomes captions here”; it must not imply bot attendance or
cloud intelligence. Interface icons and the waveform motif are hand-authored
SVG/CSS assets, kept geometric and aligned to a 16px grid.

**Shared art direction prompt:** “Wide editorial pixel-art / 1990s demoscene
illustration, a single anonymous laptop on a dark desk receiving abstract mint
audio wave blocks through one cable and turning them into bright caption-like
rectangles on its screen, privacy shield formed from chunky pixels around the
device, near-black green world, phosphor mint and restrained amber highlights,
hard 1-bit dither shadows, crisp orthographic shapes, cinematic pool of light,
no people, no text, no letters, no watermark, no logos, no brands, no cloud,
no microphone surveillance icon, no photorealism, no gradients.”

Target: 1536×1024 source; crop-safe 3:2 composition; responsive AVIF/WebP;
mobile WebP at most 300 KB. Each retained source has a JSON sidecar containing
the exact prompt, generator, generation date, and review notes. Generated
imagery is disclosed in the footer.

**Produced asset:** `assets/src/private-signal-console.png`, generated
2026-08-28 with the factory `factory-image` deployment through
`/opt/fleet/lib/gen-image.sh`. The accepted candidate was reviewed for anatomy,
text artifacts, seams, unintended symbols/brands, palette consistency, and
capability accuracy. It contains no people or text, its crisp shield and cable
read cleanly, and its full prompt and review are recorded in the adjacent JSON
sidecar. Shipped WebP exports are 75 KB at 1200×800 and 36 KB at 720×480.

## Why this fits the product

The demoscene borrowed wonder from strict technical limits. This product does
the same: it deliberately rejects meeting bots, storage, and hidden capture,
then makes a narrow local signal path useful. The console metaphor keeps
privacy state legible, the phosphor caption hierarchy privileges the spoken
word, and amber turns model doubt into a fast repair task instead of false
certainty.
