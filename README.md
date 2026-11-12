<div align="center">
  <img src="apps/desktop/src-tauri/icons/icon.png" width="144" alt="Ludra logo" />

  <h1>Ludra</h1>

  <p>
    <strong>
      Ludra is an open-source app for chatting and playing with friends. Right now it does direct messages. Voice
      calls, screen sharing and remote play come next. The server is written in Go and the desktop app in Tauri and
      Svelte.
    </strong>
  </p>

  <a href="https://github.com/ludragg/ludra/actions/workflows/build.yml"><img src="https://github.com/ludragg/ludra/actions/workflows/build.yml/badge.svg" alt="Build status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0" /></a>
  <img src="https://img.shields.io/badge/status-early%20development-orange" alt="Status: early development" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform: Windows" />

  <br />
  <br />

  <img src="docs/screenshot.png" alt="Ludra screenshot" />
</div>

## Features

- [x] Direct messages
- [x] Online status
- [ ] Voice calls
- [ ] Screen and camera sharing
- [ ] Remote play

## Running locally

You need Go, Node.js, Rust and Docker.

Start the database and the server:

```sh
docker compose up -d
cd server
go run ./cmd/ludra
```

Then the app, in another terminal:

```sh
cd apps/desktop
npm install
npm run tauri dev
```

The server runs on `127.0.0.1:8080` and creates the database tables on startup. You can change it with
`LUDRA_ADDR`, `LUDRA_DATABASE_URL` and `LUDRA_ORIGINS`. The app connects to `ws://127.0.0.1:8080/ws`, or to
`VITE_LUDRA_SERVER` if set.

## Project layout

- `apps/desktop`: the desktop app
- `server`: the Go server
- `protocol`: Protobuf messages shared by both

If you change a `.proto` file, run `buf generate` inside `protocol`. If you change a SQL query or migration, run sqlc
inside `server`:

```sh
docker run --rm -v "$PWD:/src" -w /src sqlc/sqlc:1.30.0 generate
```

Run `npm run format` and `npm run check` in `apps/desktop` before opening a pull request.

## Contributors

<a href="https://github.com/ludragg/ludra/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ludragg/ludra" alt="Contributors" />
</a>

## License

Ludra is licensed under the [GNU Affero General Public License v3.0](LICENSE).
