# Circlo landing page

The standalone landing page is `public/circlo-landing.html`. It uses plain HTML,
embedded CSS, system fonts, and inline SVG. It has no scripts, third-party assets,
analytics, testimonials, invented usage statistics, payment claims, or promises
that encryption has been independently audited.

## Review and preview

After this branch is deployed by the existing app, open:
https://circlo.chat/circlo-landing.html

This URL does not replace the current home page. The existing signup, login,
and app routes are untouched.

For a local preview:
```bash
python3 -m http.server 8080 --directory public
```
Then open http://localhost:8080/circlo-landing.html.

GitHub Actions runs `node scripts/check-landing.mjs` with Chromium at widths
360, 390, 768 and 1280 pixels. It checks horizontal overflow, internal section
targets, account links, FAQ controls, and browser errors, and saves full-page
screenshots in the `circlo-landing-preview` artifact. These checks do not verify
live account creation or inbox delivery.

## Publishing on the current Render service

The Render service called `circlo` currently deploys branch
`codex/audit-remainder-20261009` and has automatic deployment disabled.

1. Review and merge the landing-page pull request into that branch after checks pass.
2. Open Render, select `circlo`, then choose Manual Deploy / Deploy latest commit.
3. Open https://circlo.chat/circlo-landing.html to inspect the actual page.

To make it the default home page, a further integration change is required:
adapt the HTML into the existing Next.js home page or route the root path to the
landing page while preserving app, auth, API and policy routes. Read the installed
Next.js guidance required by AGENTS.md before that framework change. Do not
replace the whole public site with an index.html or alter the existing chat routes.

## Product details

The chat illustration is labelled as sample content. It is not a screenshot
of a user's messages. The loop mark is a simple design placeholder, not an
imported approved logo.

The Windows section offers browser-based installation instructions only.
Browser menus vary. No executable download or Android store listing is offered.
Android is described as planned rather than available.

## Status

Source is ready for review. Passing CI and deployment status must be checked
before calling this live. No email credentials or user data are included.
