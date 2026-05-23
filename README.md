# MRBD - Meta Ray-Ban Display App Playground

A place to build small web apps for the **Meta Ray-Ban Display**, keep many of
them in one repo, and deploy them all to GitHub Pages.

Each app is a self-contained static page under `apps/`. The root page
(`index.html`) is a hub that lists every app. A shared theme and input model in
`shared/` make the apps look and behave like glasses HUDs.

## Quick start

```bash
npm run dev                  # serve the playground at http://localhost:8000
npm run new -- "My App"      # scaffold a new app and register it
```

No dependencies to install - `dev` and `new` use only Node's standard library.

## Structure

```
index.html             Hub page - lists all apps (reads apps.json)
apps.json              Registry of apps shown on the hub
apps/<id>/index.html   One app per folder
shared/mrbd.css        HUD theme tuned for the ~600x600 monocular display
shared/mrbd.js         Input model: pinch / swipe / back (with desktop fallbacks)
scripts/               new-app + dev server (zero-dependency Node)
.github/workflows/     GitHub Pages deploy
```

## Adding an app

```bash
npm run new -- "Compass"
```

Creates `apps/compass/index.html` from the template and adds it to `apps.json`.
Edit the HTML, then refresh the hub.

## The input model

Apps are built against the glasses' interaction set, with desktop/touch
fallbacks so you can develop on a laptop:

| Gesture        | Desktop               | Touch  |
| -------------- | --------------------- | ------ |
| `pinch`        | Click / Enter / Space | Tap    |
| `swipe-*`      | Arrow keys            | Swipe  |
| `back`         | Esc / Backspace       | -      |

```js
MRBD.on("pinch", () => { /* select */ });
MRBD.on("swipe-left", () => { /* next */ });
MRBD.on("back", () => { location.href = "../../index.html"; });
```

## Deploying to GitHub Pages

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the site.

**One-time setup:** in the repo, go to
**Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.

Once enabled and merged to `main`, the hub is served at
`https://<user>.github.io/<repo>/` and each app at
`https://<user>.github.io/<repo>/apps/<id>/`.

## Display reference

The Meta Ray-Ban Display is a monocular, full-color in-lens HUD (~600x600,
~20 deg FOV). Design for glanceability: large high-contrast text, few elements,
and keep content inside the safe inset. The `.mrbd-stage` container mirrors
those bounds.
