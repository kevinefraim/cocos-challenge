# Cocos backend challenge — technical specification

The functional behaviour is defined in [functional-spec.md](functional-spec.md).
This document defines how that behaviour is implemented and operated.

## Stack

- Node.js 24 + TypeScript targeting ES2024 + Express.
- PostgreSQL + TypeORM.
- Zod for HTTP request validation.
- Vitest for unit and real HTTP end-to-end tests.
- ESLint + Prettier for static analysis and formatting.

## Project structure

```text
src/
  app.ts
  server.ts
  config/env.ts
  database/
    data-source.ts
    entities/{User,Instrument,Order,MarketData}.ts
    repositories/{typeorm-order.repository,typeorm-portfolio.repository,typeorm-instrument.repository,mappers}.ts
  domain/models.ts
  modules/
    portfolio/{portfolio.routes,portfolio.controller,portfolio.service,portfolio.repository}.ts
    instruments/{instruments.routes,instruments.controller,instruments.service,instruments.repository}.ts
    orders/{order.routes,order.controller,order.service,order.repository,order-state-machine,order.schemas}.ts
  shared/{errors,middleware,types}/
tests/
```

## Separación de capas y persistencia

Controllers traducen HTTP y services aplican reglas de negocio usando únicamente
interfaces de repository y tipos de dominio. Las entidades decoradas de TypeORM
permanecen en `database/entities`; los adapters de `database/repositories` convierten
explícitamente esas entidades a objetos de dominio, sin filtrar relaciones del ORM.
`app.ts` es el punto de composición que inyecta las implementaciones en las rutas.
ESLint impide importar persistencia desde los módulos de negocio o el dominio.

`OrderRepository.withTransaction` entrega un repository transaccional al callback.
El service agrupa las operaciones atómicas, pero no recibe `DataSource` ni
`EntityManager`. El adapter abre la transacción y administra commit, rollback y
locks. El callback no debe conservar su repository fuera de esa transacción.
Cambiar a Prisma requiere reemplazar los adapters y el armado de dependencias,
conservando atomicidad, locks y ordenamiento definidos por los contratos; no basta
con cambiar consultas si el nuevo motor no ofrece garantías equivalentes.
No se agregan repositories genéricos ni capas extra.

## Data access and consistency

- TypeORM maps the supplied schema with `synchronize: false`. Entity column
  names explicitly map PostgreSQL's folded identifiers from the supplied SQL
  (for example `instrumentid`, `userid`, and `previousclose`). `marketdata`
  uses `date`, while `orders` uses `datetime`.
- Automatic migrations do not run against the supplied database. Any future
  schema change requires an explicit reviewed migration.
- Access uses TypeORM repositories and typed operators (`ILike`, `Not`, `In`).
  Transactional `findOne` with `pessimistic_write` preserves `FOR UPDATE` locks.
  The sole QueryBuilder query uses `distinctOn` to select the latest quote per
  instrument in one query, avoiding N+1 queries or loading historical quotes.
  There are no handwritten SQL queries.
- The supplied challenge schema is intentionally not modified. Portfolio
  reconstruction is therefore linear in a user's filled-order history and is
  proportionate for this exercise. A production migration would add indexes on
  `orders (userid, status, datetime)`, `marketdata (instrumentid, date DESC)`,
  and a trigram/search index for instrument lookup; sustained high-volume reads
  would use a position projection or snapshot rather than replaying all orders.
- The order service runs validation and insertion in one transaction. It locks
  the parent `users` row (`SELECT ... FOR UPDATE`) before calculating available
  cash/holdings, serializing writes for that user even when no prior orders
  exist. This prevents concurrent accepted market orders from overspending a
  balance.
- Order cancellation runs in its own transaction and locks the target `orders`
  row before verifying `NEW -> CANCELLED`. This prevents concurrent requests
  from applying conflicting state changes to the same order.
- Locks are used only on write paths. Portfolio and instrument searches remain
  ordinary non-blocking reads. PostgreSQL releases every lock on transaction
  commit or rollback.
- PostgreSQL `NUMERIC` values stay decimal strings at the API boundary; JavaScript
  floating-point numbers are not used for persisted money calculations.
- A dedicated Decimal clone uses 60 significant digits, retaining cents when
  summing maximum supported order notionals. Precision remains bounded: each
  quantity is int32 and input budgets have at most 20 characters. Cash movements
  use size alone, including historical records whose irrelevant price is NULL.
- For the supplied TIMESTAMP WITHOUT TIME ZONE columns, pg serializes Date
  inputs in UTC and parses results as UTC regardless of host timezone. Existing
  wall-clock values have no recoverable offset and are assumed UTC, not migrated.
  Other writers must follow this convention. E2E round trips verify this across
  separate UTC and Buenos Aires processes using the actual PostgreSQL driver.

## State machine

`order-state-machine.ts` is a pure, dependency-free module. It centralizes
allowed transitions and is unit tested. Creation status is determined by order
type and validation; the only later transition is `NEW -> CANCELLED`.

## HTTP and runtime behaviour

- JSON responses include a generated or propagated `requestId`.
- `x-request-id`, JSON body limit, HTTP statuses, and reusable error definitions
  are centralized as shared transport-contract constants. Business-specific
  diagnostic context stays in the owning service.
- `GET /health` checks process liveness; `GET /ready` also verifies PostgreSQL
  connectivity and returns `503` when unavailable.
- Error middleware serializes the functional error contract and prevents stack
  traces or secrets from reaching clients.
- OpenAPI documentation is exposed at `/docs`.
- Resource IDs are limited to positive PostgreSQL int32 values before querying.
  Unsupported charset/encoding returns 415, malformed or aborted bodies 400,
  oversized bodies 413. Known database/network connection failures return 503;
  data and programming errors remain 500.
- `createApp` receives its datasource and logger, without importing global
  environment validation. Unit tests need neither DATABASE_URL nor .env.

## Configuration and deployment

Runtime configuration is `PORT`, `DATABASE_URL`, and `LOG_LEVEL`. The same
provided PostgreSQL database is used for local execution and the deployed API.
Secrets are never committed; `.env.example` lists names only.

HTTP logs allowlist requestId, method, path without query, status and duration;
headers and bodies are omitted. Error logs contain stable application error
codes rather than raw driver messages or connection strings. Domain logs record
order ID, user ID, status and rejection reason after the transaction commits.
Tests verify omission using fake secrets. Clients must use opaque request IDs
and avoid putting secrets in correlation IDs or URL paths. A process crash
between commit and logging can still lose the event; transactional log delivery
would require an outbox in a future production design.

Delivery includes a non-root Docker image with a health check, Compose for
local execution, and CI that runs formatting, linting, type-checking, build,
runtime-import smoke testing, Docker image build, unit tests, and end-to-end
coverage. Each CI job has a 10-minute limit. Workflow concurrency is grouped by
PR or branch, with cancel-in-progress disabled so running E2E can finish their
database cleanup before another run for that group starts. A hard timeout or
runner failure can still interrupt cleanup, as with any forced termination.
Compose fixes internal PORT to 3000 and publishes the .env PORT on the
host. Render's Docker Blueprint deploys `master` after CI checks pass. The
live service and automatic deployment were verified through PR #2; `/health`
reports the exact deployed Git commit. See the deployment runbook for evidence
and setup instructions. The deployed API uses the same provided PostgreSQL database as local execution. Its
connection URL remains deployment-secret configuration and is never exposed
through the API or logs.

## Test plan

- Unit: state transitions and amount-to-quantity calculation.
- End-to-end: a real Express HTTP listener and the supplied PostgreSQL database
  exercise successful market order, persisted `REJECTED` order caused by
  insufficient cash/holdings, and cancellation of a `NEW` limit order.
- The required functional test for placing an order is included in this suite.
- E2E tests create UUID-marked users, dedicated instruments and deterministic
  quotes. They verify persisted rejection states, exact balance reconciliation,
  successful sales, concurrent buys/sales/cancellation, ownership, boundaries,
  latest-quote tie-breaking, search and pagination. Shared prices are not used.
- Cleanup deletes only tracked fixture IDs. A finally block runs cleanup even
  if HTTP shutdown fails, with transactional final deletion and datasource
  destruction in its own finally block. A forcibly killed process may leave
  UUID-marked fixtures. No broad scans delete unrelated data. Run only against
  the supplied challenge database, not an unrelated production database.
- Ajv (development only) validates actual E2E responses against OpenAPI schemas.
  Request contract tests compare order variants and numeric limits against Zod.
- `npm run test:coverage` enforces at least 80% lines, functions, branches, and
  statements across `src/` (excluding the process bootstrap in `server.ts`).

## Explicit non-goals

No authentication, frontend, order matching worker, cache, queue, Redis, or
schema expansion is needed for the challenge. These omissions are intentional
to keep the implementation proportionate while preserving a clear path to
production extensions.

## Interview tradeoffs and production limits

Locks serialize cooperating writers per account; external writers must honor
that protocol. NEW does not reserve balances, so cancellation does not affect
cash. A retry after a lost response can create a duplicate: requestId is not an
idempotency key. Portfolio uses one order-history read and a later quote read,
not a global valuation snapshot. Throughput has not been benchmarked and no
capacity figure is claimed. Idempotency, reservations, indexes, snapshots and
position projections require further requirements and measurement. External
metrics remain deliberately deferred.
