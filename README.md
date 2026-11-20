# Kubek extensions

**English** · [Русский](README.ru.md)

Extensions for [Kubek](https://github.com/KubekPanel): new panel pages, widgets, notifications, integrations.
Install them from the **Catalog** tab on the **Extensions** page.

Want to add yours? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Index

[`index.json`](https://kubekpanel.github.io/extensions/index.json) has everything from this repo with versions, download links and sha256. It's for
the panel and other tools. It's rebuilt on every push and every 6 hours, packages are built right here: official ones
from `official/`, community ones from the commit pinned in their entry. If a build fails or GitHub is down, the previous version stays. Ids from
[`blocklist.json`](blocklist.json) are left out and listed in `blocked`, so the panel can warn people who
already have them installed.

```sh
bun install
bun run validate            # local checks
bun run validate --remote   # also build and check community entries
bun run build               # dist/index.json, icons and packages
```

## Official

Made by the Kubek team, files are in [`official/`](official).

_Nothing here yet :(_

## Community

These live in their authors' repos, the `.kubekext` is built here from a reviewed commit. Every new commit is reviewed
before it gets here, but reviews miss things. It runs inside the panel, so look at what you install and
which permissions it asks for.

_Nothing here yet :(_
