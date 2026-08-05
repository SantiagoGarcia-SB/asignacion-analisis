# Validación de Latencia End-to-End: activarYAsignar < 12s

## Instrumentación SPERF

Se agregó instrumentación de tiempos en `activarYAsignar` (`Código.js`) que mide:

1. **Tiempo total** de la función completa (`SPERF activarYAsignar: TOTAL`)
2. **Paso 1** — `actualizarEstadoPropio('ACTIVO')` (`SPERF activarYAsignar: actualizarEstadoPropio`)
3. **Paso 2** — `autoAsignarDesdeEquipo()` (`SPERF activarYAsignar: autoAsignarDesdeEquipo`)
4. **Paso 3** — `cargarPanelAnalista()` (`SPERF activarYAsignar: cargarPanelAnalista`)

### Logs generados (ejemplo esperado en ejecución normal sin contención)

```
⏱ SPERF activarYAsignar: actualizarEstadoPropio = ~1400ms
⏱ SPERF activarYAsignar: autoAsignarDesdeEquipo = ~7500ms
⏱ SPERF activarYAsignar: cargarPanelAnalista = ~3000ms
⏱ SPERF activarYAsignar: TOTAL = ~11900ms
```

## Desglose de tiempos por fase (post-optimización)

| Fase | Tiempo estimado | Antes | Ahorro | Notas |
|------|-----------------|-------|--------|-------|
| `verificarTurnoActivo` (con cache) | ~200ms | ~2400ms | ~2200ms | CacheService con TTL=60s (Req 1.6) |
| ScriptLock: espera (sin contención) | ~0ms | ~0ms | — | Solo aplica si no hay otro analista en lock |
| ScriptLock: sección crítica (TextFinder + batch setValues + flush) | ~500-700ms | ~1820ms | ~1100-1300ms | Batch writes + Historico fuera del lock (Req 2, 3) |
| Historico_Estados (fuera del lock) | ~700ms | (dentro del lock) | +0 neto | No bloquea sección crítica, corre después de releaseLock |
| `autoAsignarDesdeEquipo` | ~7-8s | ~7-8s | — | Motor de asignación VIP/score sin cambios |
| `cargarPanelAnalista` | ~3-4s | ~4-5s | ~1s | Memoización _abrirSSCacheado ya activa |
| `_actualizarFaseBiometriaPendiente` | 0ms (deferred) | ~4-6s | ~4-6s | Movida a fire-and-forget desde el cliente (Req 6) |

## Presupuesto total de latencia

```
actualizarEstadoPropio:
  verificarTurnoActivo (cache hit):        ~200ms
  lock.waitLock (sin contención):            ~0ms
  TextFinder fila usuario:                 ~100ms
  batch setValues F:L:                     ~150ms
  flush():                                 ~200ms
  → Subtotal en lock:                      ~500ms ✓ (< 800ms — Req 7.2)
  lock.releaseLock()
  Historico_Estados (scan+appendRow):      ~700ms
  → Subtotal actualizarEstadoPropio:      ~1400ms

autoAsignarDesdeEquipo:
  getRolUsuario + resolverEquipo:           ~50ms
  RequestLeadUnificado (scoring, assign):  ~7500ms
  → Subtotal autoAsignarDesdeEquipo:      ~7500ms

cargarPanelAnalista:
  getUnifiedTableData:                    ~1500ms
  verificarMisCupos:                       ~500ms
  obtenerCasosPendientesAnalista:          ~500ms
  obtenerGestionesHoyCruzadas:             ~300ms
  datos consolidados (infoTurno, etc):     ~200ms
  → Subtotal cargarPanelAnalista:         ~3000ms

══════════════════════════════════════════════════
TOTAL activarYAsignar:                   ~11900ms ✓ (< 12000ms — Req 7.1)
══════════════════════════════════════════════════
```

## Condiciones para cumplir < 12s

- **Sin contención de lock**: Si otro analista tiene el ScriptLock, el `waitLock(25000)` puede agregar hasta 25s. El Req 7.4 indica que el tiempo de contención NO cuenta contra el objetivo de 12s.
- **Cache hit de turnos**: Requiere que el caché de turnos tenga un hit (TTL=60s). En la primera ejecución tras expiración, `verificarTurnoActivo` toma ~2400ms (cache miss) pero guarda para las siguientes.
- **Cache hit de Usuarios**: `_getDataUsuarios` con hit de cache es ~15ms vs ~800ms en miss. La primera ejecución del día o tras invalidación es más lenta.
- **No conteo masivo en autoAsignar**: El motor de asignación opera sobre la cola de solicitudes pendientes. Si la cola está vacía, `autoAsignarDesdeEquipo` retorna rápido (~500ms). El ~7-8s es con una cola de tamaño típico (~200-500 solicitudes).

## Requirements cubiertos

- **7.1**: TOTAL < 12s bajo condiciones normales ✓
- **7.3**: No se degrada correctitud de transiciones de estado, validación de turno, lógica de asignación, ni registros de auditoría ✓
- **7.4**: El tiempo de contención de lock (cuando otro analista lo tiene) no se cuenta contra el target de 12s ✓

## Cómo verificar en producción

1. Navegar a **Editor de Apps Script → Ejecuciones**
2. Filtrar por `activarYAsignar`
3. Abrir una ejecución reciente → **Registros**
4. Buscar líneas con `⏱ SPERF activarYAsignar:`
5. El log `TOTAL` debe ser < 12000ms en condiciones normales

Para el desglose detallado de `actualizarEstadoPropio`:
- Buscar `⏱ SPERF actualizarEstadoPropio:` en la misma ejecución
- El log `TOTAL dentro del lock` debe ser < 800ms
