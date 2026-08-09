# Changelog

## 0.4.4 — 2026-08-09

- New icon: official Composer conductor logo, on a light tile color matching the first-party add-on style (`bgColor` in package.json).
- Removed the `slug` field from package.json: clicking the add-on tile made Local open its marketplace detail page, which crashes ("Cannot read properties of undefined (reading 'toString')") for add-ons not published in the marketplace. Without `slug` the tile is inert, like first-party unlisted add-ons.

## 0.4.3 — 2026-08-08

- **Fix: `openssl.cafile` pointed at `app/public/wp-includes/…`** on
  composer sites. The PHP lightning service computes `{{wpCaBundlePath}}`
  with a hardcoded `app/public` join (it never reads `site.paths.webRoot`),
  so it was doubly wrong for subdir-core layouts. New wrap of
  `ConfigTemplatesService.compileConfigTemplates` — the funnel every
  service's config compile goes through — rewrites `wpCaBundlePath` to
  `<core dir>/wp-includes/certificates/ca-bundle.crt`
  (e.g. `app/public_html/wp/wp-includes/…`), covering every PHP version
  package. Stock sites and non-PHP compiles pass through untouched;
  affected sites self-heal on restart.

## 0.4.2 — 2026-08-08

- **Fix: Add-a-site step layout.** Plain mode: the switch link no longer
  sits in an `AddSiteContent`-classed overlay (whose background covered the
  native "Set up WordPress" title); it is now a bare absolutely-positioned
  link at the window's top-right. Composer mode: the form now mirrors the
  original step's exact markup skeleton — one `.Inner` containing all rows —
  instead of two nested `.Inner`s that each claimed a share of the flex
  column's height (giant gaps, cramped rows). Switching back to "Standard
  WordPress" is done via the Installation-type select itself.

## 0.4.1 — 2026-08-08

- **Fix: DocumentRoot pointed at the core dir** (e.g. `…/public_html/wp`)
  instead of the webroot. Fresh sites' conf templates use a `{{root}}`
  variable fed by `site.paths.webRoot` (http service configVariables), so
  the single core-dir override leaked into the web server config. The patch
  is now split: `Site.paths.webRoot` resolves to the **webroot**
  (`public_html` — DocumentRoot, site shell, wp-config probes), while a new
  wrap of `WpCliService.run` hands wp-cli the **core dir**
  (`public_html/wp`). Bonus: the table-prefix probe now finds
  `<webroot>/wp-config.php` directly instead of falling back to a DB query.
  Affected sites self-heal on restart (configs recompile from the templates
  every start). The Overview row now shows both paths
  ("Webroot: … · Core: …").

## 0.4.0 — 2026-08-08

- **"Add a site" from a composer template**: the wizard's "Set up WordPress"
  step gains an installation-type switch (a "Use a composer template
  instead" link on the standard form). The composer form takes a template
  composer.json URL (or absolute path; last-used value remembered), WP admin
  credentials and an optional multisite choice, then: creates the site via
  Local's AddSiteService with `installWP: false`, writes the template to
  app/composer.json, runs Local's bundled composer with the site's PHP
  (30-min timeout), copies .env from .env.example when needed, points
  DB_HOST at Local's socket and fills DB_NAME/DB_USER/DB_PASSWORD/WP_DOMAIN
  (only keys the template's .env already has), retargets the web server
  DocumentRoot to the composer webroot (boundary-safe rewrite of
  conf/*/site.conf.hbs), restarts, waits for the DB, runs
  `wp core install` / `multisite-install --skip-config`, and for multisite
  flips the template's MULTISITE switch afterwards, flags the site, and
  syncs network domains into hosts/router. Failures leave the provisioned
  site in place with a banner naming the failing step. A bad template URL
  fails inline in the wizard before any site is created.

## 0.3.0 — 2026-08-08

- **.env DB_HOST fixer**: new ".env DB_HOST" row in the Database tab (shown
  only when the project has a .env). One click rewrites DB_HOST to
  WordPress's host:socket syntax pointing at Local's per-site MySQL socket
  (`localhost:/…/run/<siteId>/mysql/mysqld.sock`), double-quoted for
  phpdotenv (socket paths contain spaces). The edit replaces exactly the
  DB_HOST line (appends when missing), is idempotent, and refreshes the
  native Host/Name/User/Password rows afterwards. .env probed next to
  composer.json, in app/, and in the webroot.

## 0.2.0 — 2026-08-08

- **Database tab fix**: composer sites now show real DB_HOST / DB_NAME /
  DB_USER / DB_PASSWORD values. Main process evaluates the site's actual
  wp-config.php chain with `wp config list --format=json` (no WordPress
  load, no DB connection — works on stopped sites); the renderer patches the
  native pane's `getDBInfo` at runtime via a React-fiber walk, with a
  corrected-rows fallback if Local's internals change. Stock sites keep the
  native fast path.

## 0.1.0 — 2026-08-08

Initial scaffold.

- **Composer-aware webroot**: patches `Site.paths.webRoot` to the detected
  WordPress core dir (from `extra["wordpress-install-dir"]` or layout probes),
  fixing WordPress version display, multisite domain sync, domain-rename
  search-replace, one-click admin's wp-config probe and "Open Site Shell" for
  composer-based sites. Conservative auto mode (stock sites untouched),
  per-site auto/default switch in a new "Composer project" Overview row,
  manual `composerCoreDir` site flag as escape hatch.
- **Composer PHP Sync integrated** from the standalone `local-composer-php`
  add-on v1.0.0, unchanged in behavior; the `composerPhpMode` site flag is
  kept so existing per-site settings carry over. IPC channels renamed to the
  `local-composer:*` namespace. composer.json probing extended with
  `app/public_html/` and `app/web/` candidates.
