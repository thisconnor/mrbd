# HUD instrument style

The visual language used by **Drive HUD** — a stripped-back, high-contrast
"instrument cluster" look meant to be read at a glance on the in-lens display.
Reuse it for any app where live data is the whole point (speed, time, distance,
counts, status).

> Note: this is **not** the same as `shared/mrbd.css`. That stylesheet is the
> cyan-on-navy *playground hub* theme (cards, accents, gradients) used by the
> landing page and the scaffold template. The instrument style below is
> self-contained per app — pure black/white, no shared CSS, no chrome.

## Principles

- **One hero, everything else supports it.** A single huge readout owns the
  center; secondary data lives in the corners and along the bottom edge.
- **Black canvas.** On a transparent display, `#000` reads as "off" — only the
  lit pixels (white text, thin strokes) appear. Keep the field mostly empty.
- **Glanceable.** Big type, few elements, generous spacing inside the safe area.
- **Color is meaning, not decoration.** White is the entire palette; red
  (`#ff4444`) appears *only* for an alert (e.g. over the limit).
- **Quiet when idle.** Components with no data yet sit dimmed, not hidden, so the
  layout never jumps.

## Canvas

- Fixed **600 × 600** stage on `#000` (the MRBD display target).
- Keep content off the edges (~28–44px) — the FOV vignettes at the rim.
- `overflow:hidden`, `user-select:none`; viewport locked to `width=600`.

## Color

| Token            | Value                      | Use                                  |
| ---------------- | -------------------------- | ------------------------------------ |
| Background       | `#000`                     | The whole field                      |
| Foreground       | `#fff`                     | All text and strokes                 |
| Alert            | `#ff4444`                  | Over-limit / warning state only      |
| Alert glow       | `rgba(255,68,68,0.45)`     | `box-shadow` on the alerting element |
| Error text       | `#ff8a8a`                  | Gate error copy                      |
| Focus glow       | `rgba(255,255,255,0.25)`   | Focused/hovered button               |
| Faint fill       | `rgba(255,255,255,0.08)`   | Button hover/focus background        |

**Opacity tiers** carry hierarchy and state on the single white ink:
`0.95 / 0.85` primary labels · `0.65` secondary label · `0.55` dimmed component ·
`0.35` no-data value · `0.25 / 0.18` no-data border.

## Type

System stack, very light weights, tight tracking on big numerals and wide
tracking on small caps labels:

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro",
             "Helvetica Neue", system-ui, sans-serif;
```

| Role               | Size  | Weight | Tracking  |
| ------------------ | ----- | ------ | --------- |
| Hero readout       | 280px | 100    | -0.06em   |
| Gate title         | 56px  | 100    | -0.03em   |
| Framed-sign value  | 76px  | 300    | —         |
| Secondary readout  | 36px  | 300    | -0.01em   |
| Heading / value    | 30px  | 300    | 0.02em    |
| Unit / button      | 26px  | 400    | 0.35em    |
| Icon               | 22px  | —      | —         |
| Micro caps label   | 13–14px | 500–600 | 0.18–0.22em (UPPERCASE) |

- **`font-variant-numeric: tabular-nums` on every number that changes** so the
  width doesn't jitter as digits update.
- Big numbers go lighter and tighter; small labels go heavier and wider.

## Layout

Absolute zones over a relative `.stage`:

- **Top bar** — split left/right (e.g. compass | framed sign), `align-items:flex-start`.
- **Center** — the hero, absolutely centered with `translate(-50%, -50%)`.
- **Bottom** — a single centered pill for "what's next" / status.

## Component vocabulary

- **Hero readout** — the giant number + a small wide-tracked unit beneath it.
- **Framed sign** — bordered rounded-rect (2.5px stroke, 18px radius) for a
  posted value; mimics real signage.
- **Pill** — hairline `border-radius:100px` capsule for a compact status row.
- **Gauge** — circular `border-radius:50%` rose with an absolutely-positioned
  needle; rotate the rose, keep the frame fixed.
- **Permission gate** — full-bleed centered title + one-line explainer + a single
  large pill button; doubles as the error screen (`.error` modifier).

## State model

Every data component moves through three states via class toggles:

- `dim` — no data yet: low opacity, faint border. (default on load)
- *active* — has data: full opacity, solid 1.5px stroke.
- `over` / alert — `#ff4444` stroke + value, plus the alert glow.

Transition `border-color`, `color`, `box-shadow`, `opacity` over **150–200ms**.

## Interaction

- Single **Start** gate gathers permissions on the first pinch/click; the live
  view is hidden (`.hidden`) until then.
- `Enter` / click starts; the start button is the only focusable target so a
  D-pad lands on it. If you pull in `shared/mrbd.js`, you also get
  `pinch / swipe-* / back` with desktop + touch fallbacks.

## Rendering & data patterns

These keep a live HUD smooth on a constrained device:

- **rAF-batched, value-gated render.** A single `render()` runs on
  `requestAnimationFrame`; a `pending` flag coalesces bursts, and a `last{}`
  cache skips every DOM write whose value is unchanged — no layout thrash.
- **Smooth noisy sensors.** Light EMA on jittery inputs, e.g.
  `speed = speed*0.55 + raw*0.45`.
- **Fuse sources.** Prefer the reliable source when valid (GPS heading while
  moving), fall back to the other when not (device-orientation compass while
  stationary).
- **Throttle external calls.** Gate network/API fetches by both time *and*
  distance moved; wrap them in an `AbortController` with a timeout and a silent
  `catch` that leaves the component dimmed rather than erroring out.

## Minimal skeleton

```html
<div class="stage">
  <div class="gate" id="gate">…title · explainer · Start button…</div>
  <div class="hud hidden" id="hud">
    <div class="top">…corners…</div>
    <div class="speed-wrap"><div class="speed">0</div><div class="speed-unit">UNIT</div></div>
    <div class="next dim">…status pill…</div>
  </div>
</div>
```

Start from `apps/drive-hud/index.html` — it is the reference implementation of
everything above.
