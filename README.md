# Integración de login externo + pagos idempotentes (NestJS)

Este proyecto simula un servicio que:

1. Recibe un JWT emitido por un sistema externo, lo valida a fondo, y a cambio entrega un token de integración de un solo uso.
2. Permite canjear ese token una única vez.
3. Procesa pagos contra un "core" simulado, garantizando que nunca se genere un pago duplicado aunque lleguen dos peticiones iguales al mismo tiempo.

Todo el código está en inglés siguiendo las convenciones de NestJS. Este README y las respuestas teóricas van en español, para que quede documentado el razonamiento detrás de cada decisión.

## Instalación y arranque

```bash
npm install
cp .env.example .env
npm run start:dev
```

Variables de entorno (ver `.env.example`):

| Variable | Para qué sirve |
|---|---|
| `PORT` | Puerto en el que levanta la app (por defecto 3000) |
| `EXTERNAL_JWT_SECRET` | Clave HS256 con la que el sistema externo firma el JWT que llega a `/auth/login-integration` |
| `EXTERNAL_JWT_ISSUER` | Issuer (`iss`) esperado en ese JWT |
| `EXTERNAL_JWT_AUDIENCE` | Audience (`aud`) esperado en ese JWT |
| `CORE_DELAY_MS` | Cuánto tarda el core simulado en resolver un pago |

## Cómo correr los tests

```bash
npm test        # unitarios (Jest, con mocks, no llaman nada real)
npm run test:e2e   # end-to-end con supertest, levantan la app completa
```

Los unitarios viven junto al código que prueban (`*.spec.ts`), por ejemplo `src/auth/auth.service.spec.ts`. Los e2e viven en `test/` y usan supertest contra una instancia real de Nest levantada en memoria.

## Cómo usar el script de generación de tokens

Para probar `/auth/login-integration` a mano con curl o Postman se necesita un JWT firmado con la misma clave configurada en `EXTERNAL_JWT_SECRET`. Para eso está `scripts/generate-token.ts`:

```bash
npm run generate:token
```

El script lee `.env` (si existe) e imprime tres tokens: uno válido, uno vencido y uno con firma incorrecta, además de un ejemplo de `curl` ya armado con el token válido. Así se puede probar tanto el camino feliz como los casos de error sin depender de que el sistema externo real esté disponible.

## Resumen de los endpoints

### `POST /auth/login-integration`

Valida el JWT externo (firma HS256, algoritmo, expiración, issuer, audience) y devuelve un token de integración de un solo uso, válido por 60 minutos.

```bash
curl -X POST http://localhost:3000/auth/login-integration \
  -H "Content-Type: application/json" \
  -d '{"externalToken":"<el JWT que te dio generate-token>"}'
```

Respuesta (200):
```json
{ "integrationToken": "1d27116f8bfc...", "expiresInSeconds": 3600 }
```

### `POST /auth/redeem`

Canjea el token de integración. Solo funciona una vez.

```bash
curl -X POST http://localhost:3000/auth/redeem \
  -H "Content-Type: application/json" \
  -d '{"integrationToken":"1d27116f8bfc..."}'
```

Respuesta (200): `{ "redeemed": true }`. Si se vuelve a llamar con el mismo token, responde 401 con el error `INTEGRATION_TOKEN_INVALID`.

### `POST /payments`

Requiere el header `Idempotency-Key`. Si falta, responde 400. Si se repite la misma key (incluso con la petición anterior todavía en curso), nunca se genera un segundo pago.

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: un-id-unico-por-intento-logico" \
  -d '{"amount":100,"currency":"USD"}'
```

Respuesta (200):
```json
{ "paymentId": "437c1468-...", "status": "APPROVED", "amount": 100, "currency": "USD", "processedAt": "2026-09-27T23:16:28.803Z" }
```

### Formato de errores

Todos los errores (de validación, de negocio, o inesperados) devuelven la misma forma, sin exponer detalles internos:

```json
{ "statusCode": 401, "error": "INVALID_EXTERNAL_TOKEN", "message": "...", "timestamp": "2026-09-27T23:16:28.731Z" }
```

## Cómo escalar esto a varias réplicas

Siendo honestos: el `Map` en memoria que se usa tanto para los tokens de integración (`IntegrationTokenStore`) como para las idempotency keys en progreso (`PaymentsService`) **no funciona** si se ejecuta más de una réplica del servicio al mismo tiempo. Cada réplica tiene su propio proceso de Node y por lo tanto su propio Map, así que un token emitido o un pago iniciado en la réplica A es completamente invisible para la réplica B. Un balanceador de carga que reparta las peticiones entre ambas rompería silenciosamente todas las garantías de "una sola vez" que se busca garantizar aquí.

En un caso real, ese estado compartido se movería a un store fuera del proceso, usando comandos que sean atómicos ahí mismo (no en la memoria de cada réplica):

**Con Redis:**
- Para el token de integración: `SET integration:<token> used EX 3600 NX`. El `NX` significa "solo si la clave no existe todavía". Si dos réplicas reciben el redeem del mismo token al mismo tiempo, Redis procesa los comandos uno por uno (es de un solo hilo para la ejecución de comandos), así que sólo una réplica se queda con el `SET` exitoso; la otra recibe `null` y ahí mismo sabe que perdió la carrera.
- Para la idempotency key de pagos: algo similar, pero en dos pasos porque aquí es necesario guardar el resultado final, no solo un flag. Primero un `SET payment:<key> "IN_PROGRESS" NX EX <ttl>` para reservar la key (si falla, alguien más ya está procesando o ya terminó, y hay que ir a leer qué hay guardado). Cuando el core responde, se pisa esa entrada con el resultado real.

**Alternativa con base de datos:** una tabla con una columna `token` (o `idempotency_key`) con un **unique constraint**. El intento de insertar una fila con un valor que ya existe falla con un error de violación de unicidad, y ese error es justamente la señal de "ya existe / ya se usó" que hoy se detecta consultando el Map. La base de datos garantiza la atomicidad de esa comprobación sin que haga falta coordinarla a mano entre réplicas.

Cualquiera de las dos opciones resuelve el mismo problema de fondo: mover la "fuente de verdad" de la memoria de un proceso a un lugar que todas las réplicas puedan ver y que ofrezca una operación atómica de "escribir solo si no existe".

## Resultado de correr los tests

Unitarios: 13 tests, 2 suites (`auth.service.spec.ts`, `payments.service.spec.ts`), todos verdes.
End-to-end: 6 tests, 2 suites (`auth.e2e-spec.ts`, `payments.e2e-spec.ts`), todos verdes, incluyendo el test que dispara dos `POST /payments` en paralelo con la misma `Idempotency-Key` y confirma (con un spy sobre el core real) que se llamó una sola vez, y el test que confirma que redimir dos veces el mismo `integrationToken` falla la segunda vez.

---

# Parte A: preguntas teóricas

### 1. Qué pasa en el event loop de Node.js si ejecutas una operación intensiva en CPU dentro de un endpoint, como generar un PDF. Cómo lo resolverías.

Node ejecuta el código en un solo hilo. Mientras ese hilo está generando el PDF de forma sincrónica, el event loop no puede atender nada más: ni otra petición HTTP, ni un timer, ni un health check. No es que esa petición se vuelva lenta, es que **todo el servicio** se congela para todos los clientes mientras dure, aunque haya mil requests livianas esperando.

La solución no es optimizar el cálculo, es sacarlo del hilo principal: con `worker_threads` (que hacen el trabajo pesado sin bloquear el hilo que atiende HTTP), o mandando la generación a un worker/cola separada, donde el endpoint solo encola el trabajo y responde con un ID para consultar después. Es el mismo patrón que este proyecto usa para el pago: el endpoint no finge una respuesta inmediata, devuelve una promesa que se resuelve cuando el core contesta.

### 2. Diferencia entre middleware, guard, interceptor, pipe y exception filter en NestJS, y en qué orden se ejecutan.

Cada uno resuelve una pregunta distinta en el ciclo de vida de la petición:

- **Middleware**: es la capa más externa, básicamente Express puro. No sabe nada del contexto de Nest (qué controller o handler se va a ejecutar), sirve para cosas genéricas como logging o CORS.
- **Guard**: responde "¿esta petición puede continuar?". Devuelve true/false y es donde normalmente iría la autenticación/autorización.
- **Interceptor**: envuelve la ejecución del handler. Puede actuar antes (transformar la petición) y después (transformar la respuesta, medir tiempos, etc)
- **Pipe**: valida y transforma los argumentos de entrada justo antes de que el método del controller los reciba. usa los DTOs para rechazar bodies mal formados antes de que lleguen a los servicios.
- **Exception filter**: es lo último. Atrapa cualquier excepción lanzada en cualquiera de las capas anteriores (o en el handler mismo) y arma la respuesta HTTP final. En este proyecto es `AllExceptionsFilter`, y es el único lugar donde se decide qué tanto detalle sale hacia afuera.

El orden real cuando entra una petición es: Middleware → Guards → Interceptors (la parte de "antes") → Pipes → el handler del controller → Interceptors (la parte de "después", al volver) → y si en cualquier punto de ese camino algo lanza una excepción, ahí entra el Exception Filter a tomar el control y responder.

### 3. Tu servicio recibe un JWT emitido por otro sistema. Qué verificas antes de confiar en él y qué errores comunes se cometen.

- **Firma correcta**, usando la clave (o llave pública, según el algoritmo) que ambos sistemas acordaron de antemano.
- **Algoritmo esperado**, fijado explícitamente al verificar (por ejemplo restringiendo a HS256 o RS256), en vez de confiar en lo que el propio header del token declare.
- **Expiración** (`exp`), 
- **Issuer** (`iss`) y **audience** (`aud`) esperados, para asegurar que el token no solo es válido en general sino que fue emitido específicamente para el sistema que lo recibe.

Los errores comunes: usar la función de "decodificar" en vez de la de "verificar" (decodificar solo lee el payload sin comprobar nada, y es sorprendentemente fácil de confundir con verificar), no fijar el algoritmo esperado (dejando la puerta abierta a algorithm confusion), no validar `iss`/`aud` (aceptando tokens legítimos pero pensados para otro sistema), y confiar ciegamente en los claims del payload sin haber pasado antes por una verificación real de firma.

### 4. Cómo implementarías un token de un solo uso que funcione con varias réplicas del servicio.

Para que funcione con varias réplicas, ese estado tiene que salir del proceso y vivir en un store compartido con una operación atómica de "escribir solo si no existe" (puede ser en almacenamiento en cache como redis o en una base de datos). la garantía de unicidad la termina dando el motor externo, no la memoria de cada réplica.

### 5. El core procesó un pago, pero tu servicio recibió un timeout y no sabe el resultado. Qué haces.

Un timeout no es un "no", es un "no sé". Tratarlo como fallo y reintentar a ciegas puede duplicar el pago si el core sí llegó a procesarlo; tratarlo como éxito puede dar por cobrado algo que nunca se completó.

Lo correcto es apoyarse en un mecanismo de idempotencia: la operación se identifica con una key única, y mientras el resultado sea desconocido, esa key se queda en un estado "pendiente / desconocido" en vez de liberarse para reintentar sin más. Cualquier reintento con la misma key debería primero confirmar qué pasó con el intento anterior (consultando al core por esa key, o esperando una confirmación asíncrona), y recién actualizar el estado cuando llegue esa confirmación real. Lo único que no hay que hacer es reintentar sin haber descartado antes que el pago original ya se aplicó.

### 6. Cómo generas un enlace público a un comprobante de pago para que no se pueda adivinar ni reutilizar indefinidamente.

Para que no se pueda adivinar, la URL no puede llevar el ID interno del pago tal cual. En cambio, se genera un identificador opaco de alta aleatoriedad para ese enlace específico, sin ninguna relación visible con el ID real del pago.

Para que no dure para siempre, ese identificador se guarda junto con una expiración (por ejemplo 24 a 72 horas), en algún store con soporte de expiración (TTL). Pasado ese tiempo, el enlace deja de resolver aunque alguien lo tenga guardado. Si hiciera falta, también se puede limitar la cantidad de veces que se puede usar (contar accesos y bloquear después de N).

### 7. Envías comprobantes por SMS mediante una cola (RabbitMQ u otra) con entrega "al menos una vez". Cómo evitas que el cliente reciba el mismo SMS dos veces.

La solución es el mismo patrón de idempotencia: cada mensaje trae un identificador único (por ejemplo un `messageId` propio del dominio), y antes de llamar al proveedor de SMS, el consumidor revisa en un store compartido si ya fue procesado. Si ya está, hace ACK sin reenviar. Si no está, lo reserva antes de llamar al proveedor, cubriendo también el caso de que el mismo mensaje llegue en paralelo a dos consumidores. El ACK a la cola se manda recién después de confirmar el envío, así que un crash a mitad de camino genera un reintento legítimo, pero ese reintento se frena en el chequeo de idempotencia antes de mandar un segundo SMS.

### 8. Qué debes considerar al ejecutar un servicio Node.js en OpenShift: usuario, probes, ConfigMaps y Secrets.

- **Usuario**: OpenShift por defecto corre los contenedores con un UID aleatorio no root, a diferencia de Docker plano donde uno suele asumir un usuario fijo. La imagen no puede depender de escribir en rutas que requieran privilegios de root, y conviene dar permisos de grupo a los directorios que la app necesite tocar, en vez de fijar un user específico en el Dockerfile.
- **Probes**: conviene tener una readiness probe (indica si el pod está listo para recibir tráfico, por ejemplo comprobando que las dependencias críticas como Redis o la base de datos respondan) y una liveness probe (indica si el proceso sigue "vivo" y hay que reiniciarlo si deja de responder). Los timeouts y umbrales tienen que ser realistas para no matar el pod durante un arranque lento.
- **ConfigMaps**: para configuración no sensible, como issuers/audiences esperados de un JWT, timeouts, o cualquier parámetro que cambie entre entornos sin ser secreto, montada como variables de entorno.
- **Secrets**: para todo lo sensible, como claves de firma o credenciales de Redis/base de datos, nunca hardcodeadas ni puestas en un ConfigMap plano ni en el código.
