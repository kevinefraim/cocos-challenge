# Cocos backend challenge

REST API for a simplified ARS investment account, implemented with Node.js,
TypeScript, Express, TypeORM, and PostgreSQL.

- Live API: https://cocos-backend-challenge.onrender.com
- Interactive documentation: https://cocos-backend-challenge.onrender.com/docs/
- Original assignment: [backend-challenge.md](backend-challenge.md).
- CI: [GitHub Actions](https://github.com/kevinefraim/cocos-challenge/actions).

The demo may take time to wake up after inactivity. Local and deployed requests
use the same supplied database, so submitted trades persist in both environments.

The product and implementation decisions are documented in
[`docs/functional-spec.md`](docs/functional-spec.md) and
[`docs/technical-spec.md`](docs/technical-spec.md).

## Run locally

1. Create `.env` from `.env.example` and set `DATABASE_URL` to the supplied
   PostgreSQL connection URL.
2. Install and start the service:

   ```bash
   npm ci
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

Import the [Postman collection](postman/cocos-backend-challenge.postman_collection.json)
and both environments:

- [Cocos - Local](postman/local.postman_environment.json): `http://localhost:3000`.
- [Cocos - Render](postman/render.postman_environment.json): the deployed API.

Select the environment in Postman to switch targets. `userId` defaults to 1 and
can be changed. The examples cover market buys by quantity or ARS budget, a sale,
a limit order, cancellation and rejection. Run the limit creation before its
cancellation: it saves `orderId` in the selected environment so switching targets
does not reuse a different environment's saved ID. Execute both requests to
avoid leaving a pending order. Valid trades require available cash or holdings;
rejections return 201 with status REJECTED, not an HTTP failure.

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

Integration tests use the supplied database. They create temporary users,
instruments, quotes and orders, then clean only their tracked fixtures. Do not
point `DATABASE_URL` at an unrelated production database.

## CI

GitHub Actions runs formatting, linting, type checking, build, and unit tests
and builds the Docker image on every pull request and push to `master`. It then
runs the E2E suite and the 80% coverage gate using the repository secret
`DATABASE_URL_E2E`. Configure it with the same challenge PostgreSQL URL used
locally; never commit that URL.

Each job has a 10-minute limit. Runs for the same PR or branch are serialized;
an active E2E run is allowed to finish its database cleanup before the next run.

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
web-service tier. The deployment is live and the automatic PR → merge → CI →
Render flow was verified with [PR #2](https://github.com/kevinefraim/cocos-challenge/pull/2).
`GET /health` reports the deployed Git commit, making it possible to verify the
running revision independently of build logs. Render builds the Dockerfile
with `autoDeployTrigger: checksPass`. Free
services spin down after inactivity, so this is appropriate for the challenge
demo rather than a production SLA. See [docs/deployment.md](docs/deployment.md)
for setup and deployment verification.

The application uses the supplied schema as-is: TypeORM has
`synchronize: false` and does not apply automatic migrations.

## Plan de evolución

### Índices

- `orders (userid, status, datetime, id)`: obtener las órdenes ejecutadas de un
  usuario en orden cronológico para calcular su portfolio y saldos.
- `marketdata (instrumentid, date DESC, id DESC)`: obtener la última cotización
  de cada instrumento, usando el ID para desempatar fechas iguales.

### Caché de instrumentos

Cachear los datos y la paginación de `GET /instruments` para reducir consultas
repetidas sobre un catálogo que cambia poco. La clave incluiría el texto de
búsqueda normalizado, `page` y `pageSize`, con un vencimiento inicial de cinco
minutos e invalidación cuando cambie el catálogo. Si la caché falla, consultar
PostgreSQL. El `requestId` se generaría por petición, sin guardarlo en caché.
