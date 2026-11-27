# Contributing

Thanks for helping with Ludra. This page covers how we work so your pull request gets merged without surprises.

## Getting started

Follow [Running locally](README.md#running-locally) to get the database, server and app running.

### Ludra Dev panel (Windows)

Double-click `ludradev.bat` in the repository root. The first time, it builds the panel window (about a minute). It opens a panel that:

- starts and stops the database (Docker), the server and the interface (Vite), and builds the app;
- saves test accounts from your local server and opens the app already signed in to each one, several at once, so you can test calls between accounts on one PC;
- shows the server, interface, app and check logs, plus the email codes when SMTP is off;
- runs the same checks as the CI and fixes formatting.

The app it opens is `ludradev.exe`, with its own identifier (`app.ludra.dev`) and one WebView2 profile per account under `%LOCALAPPDATA%\app.ludra.dev`, so it never touches an installed Ludra. Saved accounts and their passwords stay in `%LOCALAPPDATA%\app.ludra.dev\devkit.json`; use throwaway accounts from your local server only. Closing the panel stops everything it started except the database.

You need Node.js, Go, Rust and Docker Desktop, the same as for running it by hand. The script finds the repository from its own location, so keep it in the repository root; to start it from elsewhere, use a shortcut to it instead of a copy.

## Workflow

1. Create a branch from `main`, for example `feat/voice-calls` or `fix/avatar-colors`.
2. Make your changes and open a pull request.
3. The CI runs on every pull request and has to pass.
4. Someone from the team reviews it. After one approval, it gets squashed into `main`.

Keep pull requests small and focused on one thing. They are easier to review and to revert.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org):

- `feat`: new feature
- `fix`: bug fix
- `refactor`: code change that doesn't change behavior
- `docs`: documentation only
- `style`: formatting only
- `perf`: performance
- `test`: tests
- `ci`: GitHub Actions
- `chore`: dependencies, config and other maintenance

Add the area when it helps: `feat(server): ...`, `fix(desktop): ...`.

## Code

- Code, commit messages and docs are in English. The app UI is in Portuguese and English, so add new strings to both `apps/desktop/src/i18n/pt.ts` and `en.ts`.
- No comments in the code. If something needs explaining, make the code clearer instead.
- Keep it light. Think twice before adding a dependency. CI installs npm packages with `--ignore-scripts`, so a package
  that needs an install script won't work there. See [`docs/security.md`](docs/security.md).
- Components live in `apps/desktop/src/components/<name>/<name>.svelte` and use BEM class names.
- UI changes start in the design mockup. Ask a maintainer for access before changing a screen.

Before opening a pull request:

```sh
cd apps/desktop
npm run format
npm run check
```

For the server, `gofmt -l .` and `go vet ./...` inside `server`.

If you change a `.proto` file, run `buf generate` inside `protocol`. If you change a SQL query or migration, regenerate the queries as described in the [README](README.md#project-layout). Commit the generated files too.

## Security

Please don't report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).
