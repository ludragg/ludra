# Releasing

How a Ludra release is built, signed and published, and the repository settings it depends on.

## Why the release is split in two jobs

Installed apps update themselves from `latest.json`, and they only accept an installer signed by the updater key whose
public half is in `apps/desktop/src-tauri/tauri.conf.json`. Anyone holding that private key can ship code to every
Ludra install, so the key must never share a process with code we don't control.

A Tauri build runs a lot of third-party code: every npm package that Vite loads, every crate build script, the CLI
itself. That's why [`.github/workflows/release.yml`](../.github/workflows/release.yml) has two jobs:

| Job       | Runs on          | Gets                                                       | Runs third-party code                                               |
| --------- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `build`   | `windows-latest` | a read-only token, the `LUDRA_SERVER` variable, no secrets | npm packages (with `--ignore-scripts`), crates, Vite                |
| `publish` | `ubuntu-latest`  | the `release` environment: signing key, write token        | only `@tauri-apps/cli`, pinned by the hashes in `package-lock.json` |

### `build`

1. Checks that the tag matches the app version and that `LUDRA_SERVER` is set.
2. Installs npm packages with `npm ci --ignore-scripts`. No package in the lockfile needs an install script today.
3. Writes `tauri.release.conf.json` with `scripts/release-config.mjs`: the production CSP, the update endpoint and
   `createUpdaterArtifacts: false`, so the build never asks for the key.
4. Runs `tauri build` and uploads the NSIS installer as `ludra-installer.exe`, plus its SHA-256 as a job output.

### `publish`

1. Downloads the installer and checks its SHA-256 against the one `build` reported. This only catches an artifact that
   changed between the two jobs. A compromised `build` job can still produce an installer with a backdoor, and
   `publish` will sign it. What the split protects is the key itself: no code running in `build` can read it, so it
   can't be stolen and reused outside a release.
2. Installs the signer: `scripts/signer-lock.mjs` writes a `package.json` and `package-lock.json` holding only
   `@tauri-apps/cli` and its native packages, copied from the app's lockfile, and `npm ci --ignore-scripts` installs them.
   npm refuses a tampered CLI package (`EINTEGRITY`). A tampered native package is optional, so npm skips it instead, and
   the `tauri --version` check right after fails the job. Both cases stop before the key is used.
3. Writes the release notes from `src/changelog.json` with `scripts/release-notes.mjs`.
4. Signs the installer with `tauri signer sign`. This is the only step that sees `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. It fails if no `.sig` file comes out (a wrong password, for example).
5. Writes `latest.json` with `scripts/updater-manifest.mjs`. It has the same shape tauri-action wrote: `version`,
   `notes`, `pub_date` and the `windows-x86_64-nsis` and `windows-x86_64` platforms pointing at the installer.
6. Creates the **draft** release with `gh`, with `ludra-installer.exe` and `latest.json`.

The asset names haven't changed, so the server's update feed (`server/internal/updates`) and installed apps keep
working. A draft is invisible to the feed; installed apps only see the release once a maintainer publishes it.

## Repository settings

Some of the protection lives in GitHub settings, not in the workflow. Check these once, and again if the repository
moves.

### `release` environment (Settings › Environments › release)

- **Required reviewers:** at least one maintainer. The signing job then waits for a human to approve every release.
- **Prevent self-review:** on, if more than one maintainer can approve.
- **Deployment branches and tags:** only tags matching `v*`.
- **Environment secrets:**
  - `TAURI_SIGNING_PRIVATE_KEY`: the updater private key (the contents of the `.key` file).
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password. If this secret is missing, the password is empty, which is what
    the release used before. Set it once the key has a password (see below).

Keep the signing secrets in the environment only, never as repository secrets, so only jobs that run in the `release`
environment can use them.

### Repository variable (Settings › Secrets and variables › Actions › Variables)

- `LUDRA_SERVER`, for example `wss://api.example.com/ws`. It has to be a **repository** variable, not an environment
  variable, because `build` doesn't run in the `release` environment.

### Tag ruleset (Settings › Rules › Rulesets)

Add a tag ruleset targeting `v*` that restricts creation, update and deletion to maintainers. A pushed `v*` tag is what
starts a release.

## Cutting a release

1. Bump the version in `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json` and
   `apps/desktop/src-tauri/Cargo.toml` (plus `package-lock.json` and `Cargo.lock`), and add the notes to
   `apps/desktop/src/changelog.json` in Portuguese and English. The release notes and the in-app "What's new" come
   from that entry, and `publish` fails if the tag's version has none.
2. Merge to `main`, then tag that commit: `git tag v0.5.1 && git push origin v0.5.1`.
3. Wait for `build`. With required reviewers on, approve the `publish` job when it asks.
4. Check the draft release: it has `ludra-installer.exe` and `latest.json`, and no `.sig` file.
5. Publish the draft **as a pre-release**: tick "Set as a pre-release" before publishing. While Ludra is in early
   development, every release is a pre-release. The update feed still serves pre-releases, so installed apps update
   as usual.

## Authenticode signing (planned)

Code signing for Windows (for example through SignPath) has to sign `ludra.exe` **before** NSIS packages it, and then
sign the installer. With the current split, `build` packages the installer, so that will need one of:

- signing `ludra.exe` in the middle of `build`, through the signing service, without a key on the runner;
- or moving the NSIS packaging into a job that runs after the signing.

Pick one when adding Authenticode. The updater signature in `publish` stays as it is.

## Verifying a release by hand

The `.sig` signature is a base64-encoded [minisign](https://jedisct1.github.io/minisign/) signature, and the
`pubkey` in `tauri.conf.json` is a base64-encoded minisign public key. With `minisign` installed:

```sh
curl -LO https://github.com/ludragg/ludra/releases/download/v0.5.1/ludra-installer.exe
curl -LO https://github.com/ludragg/ludra/releases/download/v0.5.1/latest.json

node -e "process.stdout.write(Buffer.from(require('./latest.json').platforms['windows-x86_64'].signature, 'base64'))" > ludra-installer.exe.minisig
node -e "process.stdout.write(Buffer.from(require('./apps/desktop/src-tauri/tauri.conf.json').plugins.updater.pubkey, 'base64'))" > ludra.pub

minisign -V -p ludra.pub -m ludra-installer.exe
```

## Putting a password on the signing key

The current key was generated without a password. A password means a leaked secret alone isn't enough to sign.

**Don't generate a new key for this.** Installed apps only trust the public key they shipped with. A new key pair would
cut every existing install off from updates. Re-encrypt the **same** key with a password instead, which keeps the
public key:

1. On a trusted machine, decode the secret: `base64 -d ludra.key > ludra.minisign.key`.
2. Change its password with minisign: `minisign -C -s ludra.minisign.key` (current password: empty).
3. Check that it still matches the public key: sign a test file
   (`minisign -S -s ludra.minisign.key -m test.txt`) and verify it with `minisign -V -p ludra.pub -m test.txt`, where
   `ludra.pub` is decoded from `tauri.conf.json` as shown above.
4. Encode it again (`base64 -w0 ludra.minisign.key`) and save the result as `TAURI_SIGNING_PRIVATE_KEY`, and the new
   password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
5. Securely delete the decoded files and keep an offline backup of the encrypted key and its password.

Step 3 is the check that matters, whatever tool you use: only replace the secret once a signature from the
re-encrypted key verifies against the public key the apps already ship.

If the key ever leaks, rotate it: generate a new pair with `tauri signer generate`, ship a release that contains the
new public key **signed with the old key**, and switch the secret only after that release is out.
