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
delete them in `afterEach`; run them serially and do not point `DATABASE_URL`
at an unrelated production database.

## CI

GitHub Actions runs formatting, linting, type checking, build, and unit tests
on every pull request and push to `master`. It then runs the E2E suite and the
80% coverage gate using the repository secret `DATABASE_URL_E2E`. Configure it
with the same challenge PostgreSQL URL used locally; never commit that URL.

## Docker

```bash
docker build -t cocos-backend-challenge .
docker run --rm --env-file .env -p 3000:3000 cocos-backend-challenge
```

The application uses the supplied schema as-is: TypeORM has
`synchronize: false` and does not apply automatic migrations.
