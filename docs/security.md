# Security notes

Design decisions that keep Ludra users safe, and the rules contributors need to follow so they stay that way. To
report a vulnerability, see [`SECURITY.md`](../SECURITY.md).

## Session token storage (desktop)

Signing in gives the app a session token that is valid for 90 days and renews every time it is used. Anyone holding it
can use the account without the password or two-factor code, so the desktop app keeps it out of reach of anything that
copies files from the user's profile.

**Where it lives.** In Windows Credential Manager, as a generic credential named `app.ludra.desktop/session`. Windows
encrypts it with DPAPI for the signed-in user and keeps it on this machine only (`CRED_PERSIST_LOCAL_MACHINE`, so it
never roams with the profile). In 0.5.0 and earlier it was in the webview's localStorage, which is a plain file inside
the WebView2 profile.

**Code:**

- `apps/desktop/src-tauri/src/session/credential.rs`: reads, writes and deletes the credential.
- `apps/desktop/src-tauri/src/session/mod.rs`: the `session_token_read`, `session_token_save` and
  `session_token_clear` commands. They only answer the `main` window (the toast and tray windows never see the token)
  and only accept tokens in the server's format (base64url, at most 512 characters).
- `apps/desktop/src/services/session-token.ts`: the frontend side. Reads, saves and clears run one at a time and in call
  order, so a logout can't be overtaken by an earlier save.

**Migration.** The first read after the update finds the token an older version left in localStorage, saves it to
Credential Manager and removes it from localStorage. Nobody gets signed out. localStorage is only cleared after
Credential Manager has saved the token: if Credential Manager can't be read or written, the app keeps the token in
localStorage, as older versions did, and moves it on a later start. Failures are not reported anywhere.

**Uninstalling.** The token isn't in the app's data folder, so deleting that folder doesn't remove it. When the user
chooses to delete the app's data, the uninstaller's NSIS hook must also run
`cmdkey /delete:app.ludra.desktop/session`. Otherwise the user stays signed in after reinstalling, and the token stays
on the PC.

**Ludra Dev panel.** Each test account runs with its own `WEBVIEW2_USER_DATA_FOLDER`. When that variable is set, the
credential name gets the folder appended (`app.ludra.dev/session@<folder>`), so test accounts keep separate sessions,
as they did with localStorage. Leftover dev credentials show up under "Windows Credentials" in Credential Manager and
can be deleted there.

**Plain browser.** When the UI runs outside Tauri (Vite in a browser during development), it falls back to
localStorage.

**What this doesn't cover.** It stops the common token stealers, which copy browser and app data folders, and it makes
a copied disk or backup useless on its own. It does not stop malware that already runs as the same Windows user: that
code can ask Credential Manager for the token just like Ludra does. Next steps that would help:

- a list of active sessions in Settings, with "sign out everywhere";
- a shorter token lifetime, or tokens tied to the device;
- warning the user by email when a new device signs in.

## Release signing

Installed apps update themselves and only trust installers signed with the updater key. The release workflow keeps that
key away from third-party code: the job that runs npm and cargo gets no secrets, and the job that signs installs nothing
but the pinned Tauri CLI. Details, required repository settings and how to verify a release: [`releasing.md`](releasing.md).

## Dependencies and CI

- CI installs npm packages with `npm ci --ignore-scripts`, in every workflow. No dependency needs an install script
  today. If you add one that does, it won't work in CI; look for an alternative, or discuss it in the pull request.
- Third-party actions in the release and cache workflows are pinned to a commit SHA. Keep it that way when updating
  them, and check the new commit before pinning it.
- Keep dependencies few. Every package and crate runs with the developer's and CI's permissions.
