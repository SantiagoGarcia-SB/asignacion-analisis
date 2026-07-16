# Google Apps Script — Buenas Prácticas de Performance

Este proyecto corre 100% sobre Google Apps Script (GAS). Toda modificación al código **debe** respetar las siguientes reglas para mantener tiempos de ejecución aceptables.

## Principio central

> Cada llamada a un servicio de Google (Sheets, Drive, Properties, Cache, Lock) es un **roundtrip de red** (~100–1500ms). Minimizar estas llamadas es la palanca #1 de performance.

## Reglas obligatorias

### 1. No intercalar reads y writes

Agrupar todas las lecturas primero, operar en memoria, y escribir al final. Intercalar `getValues()` entre `setValues()` fuerza un flush implícito que destruye el batching interno de GAS.

```javascript
// ❌ Malo — read entre writes
sheet.getRange(...).setValues(data);
var result = sheet.getRange(...).getValues(); // flush implícito
sheet.getRange(...).setValues(moreData);

// ✅ Bueno — reads juntos, writes juntos
var result = sheet.getRange(...).getValues();
// operar en memoria...
sheet.getRange(...).setValues(data);
sheet.getRange(...).setValues(moreData);
```

### 2. Un solo `openById` por spreadsheet por ejecución

Nunca abrir el mismo spreadsheet más de una vez. Pasar el objeto `ss` como parámetro entre funciones.

### 3. `getProperties()` batch en vez de múltiples `getProperty()`

Si se necesitan más de 2 properties, usar `getProperties()` una sola vez y trabajar con el objeto en memoria.

```javascript
// ❌ Malo — 5 roundtrips
var a = props.getProperty('A');
var b = props.getProperty('B');
var c = props.getProperty('C');

// ✅ Bueno — 1 roundtrip
var all = props.getProperties();
var a = all['A'], b = all['B'], c = all['C'];
```

### 4. `setValues` en vez de `appendRow`

`appendRow` busca la última fila internamente (scan). Usar `getLastRow() + 1` con `setValues` es un write directo.

### 5. Cachear datos semi-estáticos con `CacheService`

Hojas que cambian raramente (turnos, equipos, usuarios) → cachear con TTL de 30–120s. Siempre:
- Envolver `put()` en try/catch (límite 100KB por key).
- Manejar la deserialización de Dates (JSON convierte Date → string ISO, number se mantiene).
- Invalidar el caché desde las funciones admin que modifican esos datos.

### 6. Resolver referencias de hojas una sola vez

No llamar `getSheetByName()` dentro de un loop. Resolver la referencia antes del loop y pasarla como parámetro.

### 7. No mutar arrays leídos del sheet si se usan después

Usar `.slice()` para crear copias antes de modificar datos en memoria que podrían compartir referencia con otros consumidores.

### 8. Un solo `flush()` al final del lote

Nunca llamar `flush()` dentro de loops. Acumularlo todo y confirmar una sola vez al terminar.

### 9. Minimizar tiempo dentro del `LockService`

> **Nota:** Esta regla es una convención interna del proyecto, derivada del principio general de concurrencia (sección crítica mínima) y del principio oficial de GAS "agrupa reads primero, writes después". Google no documenta patrones avanzados de lock — su ejemplo usa `waitLock(30000)` sin guía adicional.

`ScriptLock` es un mutex global: mientras una ejecución lo retiene, **todas las demás** (otros usuarios, triggers de tiempo, polling automático) quedan bloqueadas esperando. El lock debe proteger solo la sección crítica de escritura, no las lecturas previas.

**Patrón obligatorio: Leer afuera → Escribir adentro.**

```javascript
// ❌ Malo — todo dentro del lock (15-40s retenido)
var lock = LockService.getScriptLock();
lock.waitLock(25000);
try {
  var ss = SpreadsheetApp.openById(ID);        // ~500ms
  var data = hoja.getDataRange().getValues();   // ~2-5s
  var resultado = procesarEnMemoria(data);      // ~100ms
  hoja.getRange(...).setValues(resultado);      // ~500ms
  SpreadsheetApp.flush();                       // ~500ms
} finally {
  lock.releaseLock();
}

// ✅ Bueno — lecturas afuera, solo escritura con lock (~1-2s retenido)
var ss = SpreadsheetApp.openById(ID);
var data = hoja.getDataRange().getValues();
var resultado = procesarEnMemoria(data);

var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
  // Opcional: verificar que los datos siguen vigentes (optimistic locking)
  hoja.getRange(...).setValues(resultado);
  SpreadsheetApp.flush();
} finally {
  lock.releaseLock();
}
```

**Reglas derivadas:**
- `waitLock` para funciones interactivas (usuario esperando): máximo **10 segundos**.
- `waitLock` para triggers/background (pueden reintentar en el próximo ciclo): máximo **5 segundos**. Si no lo obtienen, **skip graceful** — nunca bloquear la asignación.
- Si se lee data antes del lock y se escribe después, validar dentro del lock que la fila sigue disponible (patrón *optimistic locking*: re-leer solo la celda clave, no toda la hoja).
- Nunca llamar a APIs externas (`UrlFetchApp`, `Utilities.sleep`) dentro del lock.

### 10. Prioridad del lock: interacciones de usuario > triggers de mantenimiento

> **Nota:** Convención interna. Los valores de timeout (5s/10s) son decisiones de diseño de este proyecto basadas en la experiencia operativa — no vienen de documentación de Google.

Si una función de background (limpieza, archivado, escalación) no puede obtener el lock en 5 segundos, debe **ceder** y reintentar en su próximo ciclo programado. Un analista esperando un caso tiene prioridad sobre un trigger que puede correr 5 minutos después sin consecuencias.

## Referencia

- [Best Practices — Google Apps Script](https://developers.google.com/apps-script/guides/support/best-practices)
- Principio clave: *"Minimize calls to other services. Anything within Apps Script is faster than network roundtrips."*
- [LockService Reference — Google](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Tips on Reliable & Scalable GAS — Sourabh Choraria (Google Developer Expert)](https://medium.com/google-developer-experts/tips-on-building-a-reliable-secure-scalable-architecture-using-google-apps-script-615afd4d4066)
- Reglas 9–10: Convenciones internas del equipo, basadas en principios estándar de concurrencia (sección crítica mínima) y experiencia operativa con 20+ analistas concurrentes.
