# Cocos backend challenge — technical specification

The functional behaviour is defined in [functional-spec.md](functional-spec.md).
This document defines how that behaviour is implemented and operated.

## Stack

- Node.js + TypeScript + Express.
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
  modules/
    portfolio/{portfolio.routes,portfolio.controller,portfolio.service,portfolio.repository}.ts
    instruments/{instruments.routes,instruments.controller,instruments.service,instruments.repository}.ts
    orders/{order.routes,order.controller,order.service,order.repository,order-state-machine,order.schemas}.ts
  shared/{errors,middleware,types}/
tests/
```

Routes expose HTTP only; controllers translate request/response; services own
business rules and transactions; repositories isolate TypeORM/query-builder
access. No generic repositories, event bus, CQRS, or microservices are used.

## Data access and consistency

- TypeORM maps the supplied schema with `synchronize: false`. Entity column
  names explicitly map PostgreSQL's folded identifiers from the supplied SQL
  (for example `instrumentid`, `userid`, and `previousclose`). `marketdata`
  uses `date`, while `orders` uses `datetime`.
- Automatic migrations do not run against the supplied database. Any future
  schema change requires an explicit reviewed migration.
- Portfolio queries may use QueryBuilder or parameterized SQL where aggregate
  calculations are clearer than entity loading.
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

## State machine

`order-state-machine.ts` is a pure, dependency-free module. It centralizes
allowed transitions and is unit tested. Creation status is determined by order
type and validation; the only later transition is `NEW -> CANCELLED`.

## HTTP and runtime behaviour

- JSON responses include a generated or propagated `requestId`.
- `GET /health` checks process liveness; `GET /ready` also verifies PostgreSQL
  connectivity and returns `503` when unavailable.
- Error middleware serializes the functional error contract and prevents stack
  traces or secrets from reaching clients.
- OpenAPI documentation is exposed at `/docs`.

## Configuration and deployment

Runtime configuration is `PORT`, `DATABASE_URL`, and `LOG_LEVEL`. The same
provided PostgreSQL database is used for local execution and the deployed API.
Secrets are never committed; `.env.example` lists names only.

JSON logs include `requestId`, method, path, status, duration, and safe order
identifiers. They never include the database URL or credentials.

Delivery includes a Dockerfile and CI that runs formatting, linting,
type-checking, build, unit tests, and end-to-end coverage. Deployment is a
separate final delivery milestone. The deployed API uses the same provided
PostgreSQL database as local execution. Its connection URL remains deployment
secret configuration and is never exposed through the API or logs.

## Test plan

- Unit: state transitions and amount-to-quantity calculation.
- End-to-end: a real Express HTTP listener and the supplied PostgreSQL database
  exercise successful market order, persisted `REJECTED` order caused by
  insufficient cash/holdings, and cancellation of a `NEW` limit order.
- The required functional test for placing an order is included in this suite.
- E2E tests remove their temporary orders in `afterEach`, run serially, and are
  never pointed to an unrelated production database.
- `npm run test:coverage` enforces at least 80% lines, functions, branches, and
  statements across `src/` (excluding the process bootstrap in `server.ts`).

## Explicit non-goals

No authentication, frontend, order matching worker, cache, queue, Redis, or
schema expansion is needed for the challenge. These omissions are intentional
to keep the implementation proportionate while preserving a clear path to
production extensions.
