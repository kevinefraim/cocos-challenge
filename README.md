# Challenge backend de Cocos

API REST para una cuenta de inversiones simplificada en pesos argentinos,
implementada con Node.js, TypeScript, Express, TypeORM y PostgreSQL.

- API desplegada: https://cocos-backend-challenge.onrender.com
- Documentación interactiva: https://cocos-backend-challenge.onrender.com/docs/
- Consigna original: [backend-challenge.md](backend-challenge.md).
- CI: [GitHub Actions](https://github.com/kevinefraim/cocos-challenge/actions).


Las decisiones funcionales y técnicas están documentadas en
[`docs/functional-spec.md`](docs/functional-spec.md) y
[`docs/technical-spec.md`](docs/technical-spec.md).

## Ejecución local

1. Crear `.env` a partir de `.env.example` y configurar `DATABASE_URL` con la
   conexión PostgreSQL provista.
2. Instalar las dependencias e iniciar el servicio con Node.js 24:

   ```bash
   npm ci
   npm run dev
   ```

El servicio queda disponible en `http://localhost:3000`.

`npm run dev` es el comando de desarrollo: observa los archivos TypeScript y
reinicia la API cuando cambian. No requiere compilar previamente. Para probar
la versión compilada de producción, usar `npm run build && npm start`.

| URL             | Propósito                                 |
| --------------- | ----------------------------------------- |
| `/health`       | Estado del proceso y commit desplegado.   |
| `/ready`        | Comprobación de la conexión a PostgreSQL. |
| `/docs`         | Documentación interactiva de Swagger.     |
| `/openapi.json` | Contrato OpenAPI.                         |

## API

| Método  | Endpoint                                | Propósito                                                 |
| ------- | --------------------------------------- | --------------------------------------------------------- |
| `GET`   | `/users/:userId/portfolio`              | Pesos disponibles, valor total de la cuenta y posiciones. |
| `GET`   | `/instruments?q=...&page=1&pageSize=20` | Búsqueda de instrumentos por ticker o nombre.             |
| `POST`  | `/users/:userId/orders`                 | Crear una compra o venta `MARKET` o `LIMIT`.              |
| `PATCH` | `/users/:userId/orders/:orderId/cancel` | Cancelar una orden límite pendiente.                      |

Las órdenes `MARKET` se ejecutan inmediatamente y quedan en estado `FILLED`;
las `LIMIT` válidas quedan pendientes en `NEW`. Si no hay fondos o tenencias
suficientes, se guarda una orden `REJECTED`. Cada operación envía `quantity`
o un `amount` en pesos, nunca ambos.

Importar la [colección de Postman](postman/cocos-backend-challenge.postman_collection.json)
y los dos entornos:

- [Cocos - Local](postman/local.postman_environment.json): `http://localhost:3000`.
- [Cocos - Render](postman/render.postman_environment.json): la API desplegada.

Seleccionar el entorno en Postman para elegir dónde probar. `userId` vale 1 por
defecto y puede modificarse. Los ejemplos incluyen compras por cantidad o monto,
venta, orden límite, cancelación y rechazo. Crear la orden límite antes de
cancelarla: su `orderId` se guarda en el entorno seleccionado para evitar
reutilizar el ID de otro entorno. Ejecutar ambas peticiones para no dejar una
orden pendiente. Las operaciones requieren fondos o tenencias suficientes;
un rechazo de negocio devuelve HTTP 201 con estado `REJECTED` porque la orden
quedó persistida.

## Concurrencia

La creación de órdenes se ejecuta en una transacción PostgreSQL. TypeORM
bloquea la fila del usuario con `SELECT ... FOR UPDATE` antes de calcular sus
fondos y tenencias. Esto serializa las escrituras del mismo usuario y evita
gastar dos veces los mismos fondos o vender más acciones de las disponibles.
La cancelación bloquea la fila de la orden antes de aplicar `NEW -> CANCELLED`.

## Pruebas

```bash
npm test                 # pruebas unitarias; sin escrituras en la base
npm run test:e2e         # HTTP real y PostgreSQL provisto
npm run test:coverage    # E2E y unitarias; exige un 80% de cobertura
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Las pruebas de integración usan la base provista. Crean usuarios, instrumentos,
cotizaciones y órdenes temporales, y limpian únicamente los registros que
generaron. No configurar `DATABASE_URL` con otra base de producción.

## Integración continua (CI)

En cada PR y cambio en `master`, GitHub Actions verifica formato, lint y tipos,
compila la aplicación, ejecuta las pruebas unitarias y construye la imagen
Docker. Después ejecuta los E2E y exige un 80% de cobertura usando el secreto
del repositorio `DATABASE_URL_E2E`.

## Docker

```bash
docker build -t cocos-backend-challenge .
docker run --rm --env-file .env -p 3000:3000 cocos-backend-challenge
```

Para levantar el servicio localmente con Docker Compose:

```bash
docker compose up --build
```

Usa el mismo `.env` y la misma base PostgreSQL externa que la ejecución local
con Node.js. `PORT` define el puerto publicado en la máquina; el contenedor
siempre escucha en el 3000.

Para detenerlo, usar `docker compose down`. La imagen se ejecuta con un usuario
sin privilegios de root y comprueba su estado mediante `/health`.

## Despliegue continuo (CD)

[`render.yaml`](render.yaml) configura el despliegue Docker en el plan gratuito
de Render. La API está desplegada y el flujo automático PR → merge → CI →
Render.
`GET /health` informa el commit desplegado para comprobar qué versión está
atendiendo, sin depender de los logs del build. Render construye el Dockerfile
con `autoDeployTrigger: checksPass`.

El servicio gratuito se suspende tras un período de inactividad. La
[guía de despliegue](docs/deployment.md) detalla la configuración y su verificación.


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

### Métricas

Medir latencia por endpoint (p95/p99), tasa de errores, duración de consultas,
espera de locks y uso del pool de conexiones. Complementar los logs actuales
con alertas ante degradaciones del servicio.

### Pruebas de carga

Evaluar lecturas y órdenes concurrentes con historiales de distintos tamaños,
midiendo latencia y capacidad sin perder consistencia de saldos y tenencias.
Usar un entorno y datos de prueba aislados para estas mediciones.

### Idempotencia de órdenes

Aceptar una `Idempotency-Key` nueva por cada operación intencional y reutilizarla
en sus reintentos. Guardarla junto con la orden en una transacción, con una
restricción única por usuario y clave: repetir la clave y los datos devolvería
la orden original; usarla con datos distintos devolvería un conflicto. Dos
compras intencionales iguales llevarían claves diferentes y serían válidas.
