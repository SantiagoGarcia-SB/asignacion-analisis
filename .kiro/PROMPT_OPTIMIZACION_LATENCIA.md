# Prompt para Kiro — Continuar diagnóstico y optimización de latencia (VistaUnificada / asignación de casos)

Copia todo este documento como prompt inicial para Kiro. Está escrito para que tenga contexto completo sin necesitar la conversación previa.

---

## Rol y contexto del proyecto

Sos Kiro trabajando sobre este repositorio: una app de Google Apps Script (GAS) que gestiona la asignación de solicitudes a analistas en El Libertador (5 equipos: Digital, Cánones Altos, Reestudios, UAR, Desaplazamiento). Antes de tocar nada, leé `CLAUDE.md` en la raíz del proyecto — documenta la arquitectura completa (motor de asignación, spreadsheets, convenciones de concurrencia con `ScriptLock`, etc.) y tus cambios deben respetar esas convenciones, en particular:

- Nunca llamar una API externa (SAI) mientras se sostiene el `ScriptLock`.
- El `ScriptLock` es global a todo el script, no por hoja/fila.
- Los 3 endpoints de "guardar gestión" (`guardarCambiosInternos`, `guardarGestionBiometria`, ruta `HISTORICO` de `guardarGestionReestudio`) están **deliberadamente exentos** de `ScriptLock` desde 2026-07-22 — no reintroducirlo ahí sin entender por qué se quitó.
- Preferir `range.createTextFinder(...).matchEntireCell(true)` sobre leer una hoja completa y recorrerla, especialmente en `Historico_Gestiones` (crece sin límite, nunca se archiva).

## El problema que se está resolviendo

El usuario reportó que la app es lenta: desde que un analista entra a la página, se activa, recibe un caso automáticamente, lo gestiona, guarda, y recibe el siguiente caso — cada paso tiene latencia alta y variable (varios segundos, a veces >20s).

## Metodología que ya está en marcha (no la reinventes, continuala)

Se instaló un sistema de instrumentación en dos capas, y **ya está desplegado en producción** (el usuario hace `clasp push` y prueba manualmente):

### 1. Cliente (`main.js.html`)
Un objeto `_PERF` (arriba del archivo, ~línea 16) usa `performance.now()` para marcar cada paso del ciclo completo del analista — carga de página, activación manual, asignación automática, apertura del modal (inicio de "gestión"), clic en Guardar, respuesta del guardado, disparo de la siguiente asignación. **Ya NO se resetea entre fases** (antes sí, y eso rompía la continuidad de la medición — fue el primer bug que se corrigió). Imprime un `console.table` vía `_PERF.resumen()`. El usuario copia esa tabla del DevTools del navegador.

### 2. Servidor (Código.js, MotorAsignacion.js, Biometria.js)
Líneas con el prefijo `⏱ SPERF` (buscá ese string) usan `Date.now()` + `Logger.log()` para medir tiempos internos de las funciones más pesadas. El usuario las lee desde el editor de Apps Script → ícono de reloj **Ejecuciones** → abrir la ejecución más lenta → **Registros**, y pega ese log.

**Tu primer trabajo es revisar el `git diff` completo de esta sesión de optimización** (probablemente aún sin commitear — correr `git status`/`git diff` para verlo) para entender exactamente qué se instrumentó y qué se corrigió, antes de seguir.

## Hallazgos confirmados y ya corregidos (no los repitas)

1. **`_PERF` del cliente se reseteaba entre fases** (`main.js.html`) — corregido, ahora es un timeline continuo por sesión de pestaña.
2. **Lecturas duplicadas**: `getTableData()` y `verificarMisCupos()` (Código.js) leían las hojas `solicitud` y `ORIGEN` completas **dos veces** dentro de una misma llamada a `cargarPanelAnalista()`. Se corrigió pasando los datos ya leídos (`_rawSolicitud`/`_rawOrigen`) como `datosPrefetch` a `verificarMisCupos(equipo, datosPrefetch)`.
3. **Aperturas repetidas de spreadsheet**: `SpreadsheetApp.openById()` se llamaba hasta 6-7 veces con el mismo ID dentro de una sola ejecución de `cargarPanelAnalista()`. Se agregó `_abrirSSCacheado(id)` (memoización de ejecución, variable de módulo `_ssAbiertosCache`) y se aplicó en el camino caliente.
4. **BUG REAL CONFIRMADO — caché de "score" roto**: `_getScoreMapCacheado()` intentaba guardar en `CacheService` un JSON de ~2286 pólizas que **superaba el límite de 100KB por valor**. `cache.put()` fallaba siempre (`"Argumento demasiado grande: value"`), silenciado por el `try/catch`. Efecto: cada carga de panel releía y reprocesaba la hoja "score" completa (~1.4s). **Corregido**: se particionó el JSON en múltiples keys de ≤90KB vía `cache.putAll()`/`getAll()` (prefijo `SCORE_MAP_V2_`).
5. **Mismo bug potencial en `_getDataUsuarios()`**: aplicado preventivamente el mismo particionado (prefijo `USUARIOS_DATA_V2_`) — la columna de historial de estados por analista (JSON con cada cambio del día) puede hacer que "Usuarios" completa supere 100KB con ~40+ analistas.
6. **CacheService es best-effort, no confiar en él dos veces en la misma ejecución**: se confirmó con logs que `_getDataUsuarios()` pegó caché la primera vez (100ms) y **falló 2 segundos después, en la misma ejecución de `cargarPanelAnalista()`** (pagando 1608ms de relectura innecesaria). Se agregó memoización de ejecución (`_datosUsuariosMemo`, `_scoreMapMemo`) además del caché de `CacheService`, para que dentro de una sola ejecución el dato se calcule una sola vez sin importar cuántas funciones lo pidan.
7. **`RequestLeadUnificado()` (MotorAsignacion.js)**: se reordenaron las validaciones (usuario activo, turno, permiso, equipo) para que corran **antes** de tomar el `ScriptLock` global — antes, una solicitud que iba a fallar igual tomaba el lock y hacía esperar a todos los demás analistas.
8. **`actualizarEstadoPropio()`**: se cambió la búsqueda de fila del analista de un escaneo completo de "Usuarios" a `createTextFinder` acotado a la columna de correo.

## Lo que falta — instrumentación ya colocada, esperando el próximo log

En la traza de cliente más reciente que se le pidió al usuario, después de aplicar los fixes de caché, los números que dominan el tiempo total ya **no son** `cargarPanelAnalista()` (que bajó notablemente) sino estos tres, que quedaron instrumentados con `⏱ SPERF` pero **todavía sin el log de una corrida real para analizar**:

| Función | Archivo | Última medición del cliente (antes de esta ronda de instrumentación) | Qué se instrumentó |
|---|---|---|---|
| `RequestLeadUnificado()` | MotorAsignacion.js | 25.7s en una llamada, 5.3s en otra (variación enorme) | Tiempo de **espera del lock** (separado del trabajo dentro del lock) — `_contarDesdeHojaPrincipal`, `_contarDesdeHojaReestudios`, recolección de pendientes, `_ordenarYSeleccionarCandidatos` (VIP/score), escritura de asignación, `SpreadsheetApp.flush()` |
| `actualizarEstadoPropio()` | Código.js | 13.6s combinados (A1→A2) | Tiempo de espera del lock, `TextFinder` de fila, `verificarTurnoActivo()`, bloque `Historico_Estados` (scan de 200 filas + `appendRow`), escrituras en `Usuarios`, flush |
| `guardarGestionBiometria()` | Biometria.js | 11.2s (G2→G3) | `TextFinder` del ID, las 7 escrituras de campos, `calcularTiemposCaso()` (motor de SLA — lee hojas de turnos) por separado, flush, `_cerrarConteoConLockCorto()` |

**Hipótesis de trabajo (sin confirmar todavía)**: la variación enorme en `RequestLeadUnificado` (25.7s vs 5.3s) apunta a **contención del `ScriptLock` global** — si varios analistas se activan o piden caso casi al mismo tiempo, se serializan uno detrás del otro. Esto se confirma o descarta mirando específicamente la línea de log `⏱ SPERF RequestLeadUnificado: ESPERA del lock = ...` (y su equivalente en `actualizarEstadoPropio`) en el próximo test.

## Tus tareas

1. **Revisar los cambios ya aplicados** (`git diff` de `Código.js`, `MotorAsignacion.js`, `Biometria.js`, `main.js.html`) buscando errores de lógica, riesgos de concurrencia no contemplados, o efectos secundarios — en particular: revisá con cuidado el particionado de caché (`_getScoreMapCacheado`, `_getDataUsuarios`) y la reordenación de validaciones en `RequestLeadUnificado` antes del lock, porque tocan código de asignación de casos (correctitud > velocidad, siempre).
2. **Pedile al usuario que haga `clasp push`, repita el ciclo de prueba (entrar, activarse, gestionar un caso, guardar) y te pase el log de Ejecuciones** de las corridas más lentas de `RequestLeadUnificado`, `actualizarEstadoPropio` y `guardarGestionBiometria` (buscar `⏱ SPERF` en Registros).
3. **Analizá ese log línea por línea** con la misma disciplina que se usó hasta ahora: no asumas la causa, medí primero. Prestá atención especial a la línea de "ESPERA del lock" — si es alta y variable entre corridas, es contención, no un problema de código de una sola función.
4. **Dale al usuario un resumen claro de los hallazgos** (en español, tono directo, con números concretos — no jerga innecesaria) antes de aplicar más cambios: qué se confirmó, qué causa cuánto tiempo, y por qué.
5. **Seguí optimizando** en base a evidencia, no a suposiciones. Si la causa resulta ser contención del lock:
   - **No** quites el `ScriptLock` de `actualizarEstadoPropio()` a la ligera — usa `appendRow()` sobre `Historico_Estados`, que sin lock tiene riesgo real de condición de carrera entre ejecuciones concurrentes (a diferencia de los 3 endpoints ya exentos, que escriben con `setValue` a una fila conocida). Si considerás necesario tocar esto, explicale el trade-off al usuario y pedí confirmación antes de aplicarlo — es una decisión de arquitectura de concurrencia, no un fix de rendimiento trivial.
   - Para `RequestLeadUnificado()`, el lock protege que dos analistas no se lleven el mismo caso — cualquier reducción de su alcance debe preservar esa garantía. Si la lectura pesada dentro del lock (`_contarDesdeHojaPrincipal`/`_contarDesdeHojaReestudios`) resulta ser la causa dominante (no la espera), la solución de fondo es un rediseño hacia un índice/contador incremental de la cola de pendientes (similar al que ya existe para `Historico_Gestiones` vía `_obtenerConteoHoyAnalista`/`_obtenerCargaPendienteAnalista`) — es un cambio de arquitectura, no un ajuste rápido; planteálo como propuesta separada si aplica, no lo implementes de improviso.
6. Mantené el mismo patrón de trabajo: instrumentar → pedir log real → analizar con evidencia → corregir → repetir. No apliques "optimizaciones" especulativas sin medición que las respalde — ya se demostró dos veces en esta sesión que adivinar sin medir no movía la aguja.

## Convención de comunicación con el usuario

El usuario es Santiago, dueño del proyecto, técnico (lee logs de DevTools y de Apps Script sin problema). Comunicate en español, directo, sin rodeos. Cuando reportes hallazgos, ancla siempre en números concretos del log (ms, cantidad de filas) — no generalidades.
