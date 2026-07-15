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

## Referencia

- [Best Practices — Google Apps Script](https://developers.google.com/apps-script/guides/support/best-practices)
- Principio clave: *"Minimize calls to other services. Anything within Apps Script is faster than network roundtrips."*
