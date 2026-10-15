# Cocos backend challenge

REST API for a simplified ARS investment account, implemented with Node.js,
TypeScript, Express, TypeORM, and PostgreSQL.

The product and implementation decisions are documented in
[`docs/functional-spec.md`](docs/functional-spec.md) and
[`docs/technical-spec.md`](docs/technical-spec.md).

## Run locally

1. Create `.env` from `.env.example` and set `DATABASE_URL` to the supplied
   PostgreSQL connection URL.
2. Install and start the service:

   ```bash
   npm install
   npm run dev
   ```

The service is available at `http://localhost:3000`.

`npm run dev` is the development entry point: it watches TypeScript sources and
restarts the API after a change. It was verified with Node.js 24. Use
`npm run build && npm start` only to exercise the production artifact.

| URL             | Purpose                     |
| --------------- | --------------------------- |
| `/health`       | Process liveness check.     |
| `/ready`        | PostgreSQL readiness check. |
| `/docs`         | Swagger UI.                 |
| `/openapi.json` | OpenAPI document.           |

## API

| Method  | Endpoint                                | Purpose                                            |
| ------- | --------------------------------------- | -------------------------------------------------- |
| `GET`   | `/users/:userId/portfolio`              | Available ARS, total account value, and positions. |
| `GET`   | `/instruments?q=...&page=1&pageSize=20` | Search tradable instruments by ticker or name.     |
| `POST`  | `/users/:userId/orders`                 | Create `MARKET` or `LIMIT` buy/sell order.         |
| `PATCH` | `/users/:userId/orders/:orderId/cancel` | Cancel a pending limit order.                      |

`MARKET` orders are immediately `FILLED`; valid `LIMIT` orders are `NEW`.
Insufficient cash or holdings produces a persisted `REJECTED` order. Every
trade sends either `quantity` or an ARS `amount`, never both.

The ready-to-import [Postman collection](postman/cocos-backend-challenge.postman_collection.json)
uses `baseUrl`, `userId`, and `orderId` variables. The limit-order example saves
its order ID and the next request cancels it, so it does not leave a pending
order behind.

## Concurrency

Order creation executes in a PostgreSQL transaction and locks the user's row
with `SELECT ... FOR UPDATE` before calculating cash or holdings. This
serializes concurrent writes for the same user and prevents double spending or
overselling. Cancellation locks the target order row before applying
`NEW -> CANCELLED`.

## Tests

```bash
npm test                 # unit tests; no database writes
npm run test:e2e         # real HTTP + supplied PostgreSQL database
npm run test:coverage    # E2E + unit tests; enforces 80% coverage
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Integration tests use the supplied database. They create temporary orders and
temporary users, clean them after each run, and do not point `DATABASE_URL` at
an unrelated production database.

## CI

GitHub Actions runs formatting, linting, type checking, build, and unit tests
and builds the Docker image on every pull request and push to `master`. It then
runs the E2E suite and the 80% coverage gate using the repository secret
`DATABASE_URL_E2E`. Configure it with the same challenge PostgreSQL URL used
locally; never commit that URL.

## Docker

```bash
docker build -t cocos-backend-challenge .
docker run --rm --env-file .env -p 3000:3000 cocos-backend-challenge
```

For the normal local workflow, Docker Compose is simpler:

```bash
docker compose up --build
```

It uses the same `.env` and external PostgreSQL database as local Node.js.
`PORT` selects the published host port; the container always listens on 3000.
The driver reads and writes timezone-less timestamps as UTC across local and
deployed processes.
Stop it with `docker compose down`. The image runs as a non-root user and has a
container health check against `/health`.

## Deployment

[`render.yaml`](render.yaml) is the CD configuration for Render's free Docker
web-service tier. Connect this repository as a Render Blueprint, set
`DATABASE_URL` as a secret, and keep `autoDeployTrigger: checksPass` so Render
builds the Dockerfile and deploys only after GitHub Actions succeeds. Free
services spin down after inactivity, so this is appropriate for the challenge
demo rather than a production SLA. See [docs/deployment.md](docs/deployment.md)
for the one-time setup.

The application uses the supplied schema as-is: TypeORM has
`synchronize: false` and does not apply automatic migrations.
