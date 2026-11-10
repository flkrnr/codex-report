# Raycast extension development

`codex-report/` is the Raycast extension and the only folder that goes to the
[Raycast Store](https://github.com/raycast/extensions/tree/main/extensions/codex-report).
This folder holds the tooling around it: syncing the bundled CLI and the checks.

## Bundled CLI

The CLI in `codex-report/assets` is a copy of the published
[`codex-report`](https://www.npmjs.com/package/codex-report) npm package, pinned
as a devDependency in `package.json` here. To ship a new CLI release:

```sh
npm install --save-dev --save-exact codex-report@<version>
npm run sync-cli
```

`npm run sync-cli-dev` copies unreleased changes from the surrounding repository
for local testing; `npm test` fails until the assets match the pinned release
again.

## Run and validate

```sh
cd codex-report
npm install
npm run dev
```

Validate the extension with:

```sh
cd codex-report
npm run build
npm run lint
npm run typecheck
```

Run the checks from this folder. They reuse the extension's type definitions, so
run `npm install` in `codex-report` first:

```sh
npm install
npm test
```
