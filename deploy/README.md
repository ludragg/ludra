# Deploy

Runs the Ludra server, PostgreSQL and Caddy (automatic HTTPS) on a single Linux VPS with Docker.

## Requirements

- Ubuntu or Debian VPS with a public IPv4 address
- A DNS `A` record pointing your server domain (for example `api.example.com`) to the VPS
- An SMTP account for verification emails (for Gmail, an App Password)

## First install

```bash
git clone https://github.com/ludragg/ludra.git /opt/ludra
cd /opt/ludra/deploy
bash setup.sh
```

`setup.sh` installs Docker, opens the firewall ports below and creates `.env` with a random database password, a random TURN secret and the VPS public IP.

Edit `.env` and fill in the domain, the SMTP settings and, for the GIF picker, `LUDRA_KLIPY_KEY` (a free key from
[KLIPY](https://klipy.com/developers)):

```bash
nano .env
```

Start everything:

```bash
docker compose up -d --build
```

Check that it is up:

```bash
curl https://api.example.com/health
```

## Behind an existing reverse proxy

If the VPS already runs a reverse proxy on ports 80 and 443, skip the bundled Caddy and point the existing proxy at the server:

1. In `.env`, remove `COMPOSE_PROFILES=standalone`.
2. Set `LUDRA_ADDR` to an address the proxy can reach, such as the Docker bridge gateway (`172.18.0.1:8080`).
3. Set `LUDRA_TRUSTED_PROXIES` to the proxy's network (`172.18.0.0/16`).
4. Allow that network to reach the port: `ufw allow from 172.18.0.0/16 to any port 8080 proto tcp`.
5. If another PostgreSQL already uses 5432, set `POSTGRES_PORT=5433`.
6. Add a site to the proxy, for Caddy:

```
api.example.com {
	encode zstd gzip
	reverse_proxy 172.18.0.1:8080
}
```

## Update

```bash
cd /opt/ludra
git pull
cd deploy
docker compose up -d --build
```

Database migrations run automatically when the server starts.

## Ports

| Port | Protocol | Used by |
| --- | --- | --- |
| 80, 443 | TCP | Caddy (HTTPS, certificates) |
| 443 | UDP | Caddy (HTTP/3) |
| 3478 | UDP | TURN relay |
| 49160–49999 | UDP | Call audio and video relay |

## Logs

```bash
docker compose logs -f server
```

## Backup

```bash
docker compose exec -T postgres pg_dump -U ludra ludra | gzip > ludra-$(date +%F).sql.gz
```
