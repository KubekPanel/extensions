# Contributing

**English** · [Русский](CONTRIBUTING.ru.md)

## Adding an extension

1. Keep the extension in **your own public GitHub repo** with a license. All sources must be in the repo,
   not only in the release. Start from [extension-template](https://github.com/KubekPanel/extension-template).
2. Publish a **GitHub release** (not a pre-release) with one `.kubekext` asset. The tag matches the manifest
   version: `1.2.0` or `v1.2.0` for `"version": "1.2.0"`.
3. Open a PR here with:
   - a file `community/<id>.json`:
     ```json
     {
       "id": "com.yourname.discord-alerts",
       "repo": "yourname/kubek-discord-alerts"
     }
     ```
     If a release has several `.kubekext` files, add `"asset": "discord-alerts.kubekext"`.
   - a line in the **Community** list of `README.md` and **От сообщества** in `README.ru.md`, sorted by
     name. English description is fine in both:
     ```md
     - [Discord alerts](https://github.com/yourname/kubek-discord-alerts) - Server crashes and joins in a Discord channel
     ```
4. CI downloads your latest release and checks it. Source code is checked manually.

To check before the PR: `bun install && bun run validate --remote community/<id>.json`.

**Updates** don't need a PR, just publish a new release with the tag matching the manifest version. The
index picks it up within 6 hours. If the release fails the checks, the previous version stays and the
warning shows up in the Publish index workflow.

## Rules

- `id` is reverse-domain and lowercase (`com.yourname.name`), the same in the manifest and the file name.
  `com.kubek.` is reserved for official extensions.
- The manifest has `manifestVersion: 1`, a semver `version`, `name`, `description`, `author.name` and
  `engines.kubek`. If the icon is a file, it's a `.png` inside the package.
- Ask only for the capabilities you use. The README explains why each one is needed, especially
  `servers:control`, `http:routes` and `http:outbound`.
- The code is readable: no obfuscated or minified-only backend, and the package has the frontend sources.
- Data leaves the panel only where the user configured it (a webhook URL, an API key). No telemetry, no
  sending users, logs or settings anywhere else.
- Tokens and passwords go into `settingsSchema` fields with `"secret": true`.
- Don't bundle React or the SDK, they come from the panel.
- The README says what the extension does, what it adds to the panel and its known limits.

Entries that break the rules, stay broken for long or lose their repo are removed. Harmful ones also go
to `blocklist.json` with the reason, so panels that installed them can warn their users. Found a problem?
[Open an issue](../../issues/new/choose).

## Official extensions

`official/<name>/` holds the sources and the built `.kubekext`. Bump `version` and rebuild the `.kubekext` on
every change, `bun run validate` fails if the package and the sources have different versions.
