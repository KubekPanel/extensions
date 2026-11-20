# Kubek extensions

**English** · [Русский](README.ru.md)

Extensions for [Kubek](https://github.com/KubekPanel): new panel pages, widgets, notifications, integrations.
Download a `.kubekext` and install it on the **Extensions** page.

Want to add yours? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Index

[`index.json`](https://kubekpanel.github.io/extensions/index.json) has everything from this repo with versions, download links and sha256. It's for
the panel and other tools. It's rebuilt on every push and every 6 hours, community entries come from their
latest release. If a release is broken or GitHub is down, the previous version stays. Ids from
[`blocklist.json`](blocklist.json) are left out and listed in `blocked`, so the panel can warn people who
already have them installed.

```sh
bun install
bun run validate            # local checks
bun run validate --remote   # also download and check community releases
bun run build               # dist/index.json and icons
```

## Official

Made by the Kubek team, files are in [`official/`](official).

_Nothing here yet :(_

## Community

These live in their authors' repos, the `.kubekext` comes from their releases. An extension is checked once
when it's added, its updates are not. It runs inside the panel, so look at what you install and which
permissions it asks for.

_Nothing here yet :(_
