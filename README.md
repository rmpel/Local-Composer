# Composer Tools for Local

## Notices up front

- This addon includes functions from the `Local-Composer-PHP` addon, so be sure 
  to remove that before installing this one.
- This addon is coded with great assistance of Claude Fable 5; if you don't like
  using AI Generated/Assisted software, don't complain, just don't use it.

## What does this Addon do?

First-class **composer-based WordPress projects** in [Local](https://localwp.com):

1. **Composer-aware webroot / core dir** — sites with a `public_html/` or `web/`
   webroot and WordPress core in a subdirectory (`extra["wordpress-install-dir"]`,
   e.g. `public_html/wp`) get a working **WordPress version** display, working
   **multisite domain sync**, working **domain-rename search-replace**, a working
   **"Open Site Shell"**, and a reliable one-click admin.
2. **Database tab fix** — Local's Database tab regex-parses
   `app/public/wp-config.php` as text, so composer sites (wrong path, and
   often no static `define()`s at all — constants come from a core package /
   env files) show "Unable to find DB_HOST …". This add-on evaluates the real
   config chain via `wp config list --format=json` (no WordPress load, no
   database needed) and feeds the values into the native rows.
3. **.env DB_HOST fixer** — env-driven config chains ship with
   `DB_HOST="localhost"`, which means TCP :3306 while Local's per-site MySQL
   listens on a unix socket. A ".env DB_HOST" row in the Database tab (only
   shown when a .env exists) rewrites it to WordPress's host:socket syntax
   (`localhost:/…/mysqld.sock`) with one click — a minimal, idempotent,
   single-line edit.
4. **Add a site from a composer template** — in the wizard's "Set up
   WordPress" step, switch to "Composer project (from template)", paste the
   URL (or absolute path) of a template composer.json, and the add-on
   creates the site without Local's WP install, runs `composer install`
   (Local's bundled composer + the site's PHP), configures the .env
   (DB_HOST → Local's socket, DB creds, WP_DOMAIN — only keys the template
   ships), points the web server at the composer webroot, and finishes with
   `wp core install` (or `multisite-install`, including the template's
   MULTISITE switch and network-domain sync). Works with any
   `extra["wordpress-install-dir"]` layout — Acato templates and Bedrock
   alike.
5. **Composer PHP Sync** — keep a site's Local PHP version and its
   `composer.json` `config.platform.php` pin in sync, in either direction
   (integrated from the standalone `local-composer-php` add-on; per-site
   settings carry over).

## Why

Local hardcodes a site's webroot to `app/public` (`Site.paths.webRoot`) and runs
every wp-cli command with `--path=<webRoot>`. On a composer layout that path is
wrong twice over: the webroot has a different name, *and* wp-cli needs the
**core** directory (the one containing `wp-includes/`), not the webroot. The
result: "WordPress version: unknown", a multisite Sync button that does nothing,
and a site shell that lands nowhere.

This add-on patches both consumers with the directory each actually needs —
they want *different* ones. The `paths` getter on Local's shared `Site` model
resolves `webRoot` to the **webroot** (`public_html`): that feeds the web
server's DocumentRoot (`{{root}}` in the conf templates), the site shell and
the wp-config probes. A wrap of `WpCliService.run` hands wp-cli the **core
dir** (`public_html/wp`). All broken features read these lazily at call time,
so they come along for free. Verified against Local 9.x: wp-cli finds
`wp-config.php` one level above the core dir on its own, and Local's
`WP_CONFIG_PATH` env pointing at a nonexistent file is harmless.

### Core-dir detection (per site)

1. Manual override: site flag `composerCoreDir` in `sites.json` set to a path
   relative to `app/` (escape hatch, set by hand).
2. `composer.json` (`app/`, `app/public_html/`, `app/web/`, `app/public/`, …) →
   `extra["wordpress-install-dir"]`.
3. Probes: `public_html/wp`, `web/wp`, `public/wp`, `wp`, `public_html`, `web`
   (a dir counts as core when it contains `wp-includes/version.php`).

Auto mode is conservative: when `app/public` **is** a WordPress install (a stock
Local site), nothing is overridden. The Overview tab gets a **"Composer
project"** row showing the detected core dir with an auto/off switch, plus the
**"Composer PHP"** sync row.

### How the Database tab fix works

The pane's component is compiled into Local's webpack bundle, so it can't be
require()d and patched directly. Instead our hook content (rendered inside the
same pane via `SiteInfoDatabase_TableList`) climbs from its own DOM node up the
React fiber tree to the mounted component instance — method names survive
minification — and patches `getDBInfo` on its constructor's prototype, then
re-runs it. Composer sites get wp-cli-derived values; stock sites keep the fast
native file parse. If Local's internals ever change and the fiber walk fails,
corrected read-only rows are appended to the table instead (graceful fallback).

### Not covered

MagicSync (Flywheel/WPE push-pull), the importers/exporters and Live Links
hardcode `app/public` internally without going through `Site.paths` — those
remain stock-Local-only.

## Install

```bash
./scripts/install.sh   # symlinks into Local's addons dir + npm install
```

Restart Local, enable **Composer Tools** under *Add-ons → Installed*, relaunch.
**Disable the old "Composer PHP Sync" (`local-composer-php`) add-on** if you
have it — its functionality is integrated here, and both enabled at once would
register duplicate rows and watchers.

## Develop

```bash
npm install
npm run build      # tsc → lib/
npm run watch
./scripts/build.sh # distributable tgz in dist/
```

## Roadmap

- Seed a fresh .env from scratch (not just .env.example) with sane Local
  defaults.
- Preset list of company template URLs (remote index) instead of a bare URL
  field.
- Auto-run multisite domain sync on site start when domains are missing.
- One-click "set DocumentRoot to composer webroot" for *existing* sites
  (the bootstrap flow already does this for new ones).

## License

GPL-3.0-or-later
