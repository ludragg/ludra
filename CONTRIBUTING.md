# Contributing

Thanks for helping with Ludra. This page covers how we work so your pull request gets merged without surprises.

## Getting started

Follow [Running locally](README.md#running-locally) to get the database, server and app running.

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
- Keep it light. Think twice before adding a dependency.
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
