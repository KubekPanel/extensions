# Contributing

**English** · [Русский](CONTRIBUTING.ru.md)

## Adding an extension

1. Keep the extension in **your own public GitHub repo** with a license. All sources must be in the repo.
   Start from [extension-template](https://github.com/KubekPanel/extension-template).
2. Open a PR here with:
   - a file `community/<id>.json`:
     ```json
     {
       "id": "com.yourname.discord-alerts",
       "repo": "yourname/kubek-discord-alerts",
       "commit": "4f1c2a9e0b7d3c5e8f6a1b2c3d4e5f6a7b8c9d0e"
     }
     ```
     `commit` is the full sha of the commit to publish. If the manifest is not in the repo root, add
     `"path": "folder/inside/repo"`.
   - a line in the **Community** list of `README.md` and **От сообщества** in `README.ru.md`, sorted by
     name. English description is fine in both:
     ```md
     - [Discord alerts](https://github.com/yourname/kubek-discord-alerts) - Server crashes and joins in a Discord channel
     ```
3. CI builds the package from that commit and checks it. The code of the commit is checked manually.

To check before the PR: `bun install && bun run validate --remote community/<id>.json`.

**Updates** go through a PR that changes `commit`. Tag a new version in your repo and a bot opens the PR
within 6 hours, or open it yourself. Each new commit is reviewed before merge, so updates take a bit
longer, but what gets installed is exactly the reviewed code. Releases are optional, the bot follows your
latest release or, without releases, your newest tag.

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
