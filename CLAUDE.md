# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Apps Script (GAS) web application for managing request assignment workflows at El Libertador (surety/real estate company). Five analyst teams: Digital, Canones Altos, Reestudios, UAR, and Desaplazamiento. Teams are configured dynamically in the `Equipos` sheet. Deployed as a domain-restricted web app on Google Workspace.

## Deployment Commands

This project uses **clasp** (Google Apps Script CLI). There is no build or test step — code deploys directly to GAS.

```bash
clasp login         # Authenticate with Google account
clasp push          # Upload local code to Google Apps Script
clasp pull          # Download current GAS code to local
clasp deploy        # Create a new versioned deployment
```

The script ID is in `.clasp.json`. Runtime is V8, timezone is `America/Bogota`.

## Architecture

### Request Flow

```
Browser → doGet() (Código.js) → Role-based HTML view
                                 ├─ ADMIN  → VistaAdmin.html
                                 └─ ASESOR → VistaUnificada.html (all teams)
```

Authentication is implicit (Google Workspace session). Role is resolved from the "Usuarios" sheet (col 4 = Especialidad, col 23 = ADMIN flag). Team is resolved via `resolverEquipoDesdeEspecialidad()` and injected as `equipoConfig`.

### Backend Modules

| File | Responsibility |
|------|----------------|
| `Código.js` | Entry point (`doGet`), SAI API sync, `obtenerCuposEfectivos`, `guardarCambiosInternos`, shared utilities |
| `MotorAsignacion.js` | **Primary assignment engine** (`RequestLeadUnificado`) — proportional cupo sorting, VIP rotation, canon filtering, external channel priority. Used by all teams. |
| `MotorTiempos.js` | SLA time calculation engine — per-analyst shift-aware working minutes |
| `Admin.js` | Admin dashboard, user CRUD, dynamic cupos (global/individual), teams CRUD, shifts, permissions |
| `Biometria.js` | Follow-up cycle for pending biometries (SAI codes 500/503) and auto-assignment. Since 2026-07-13, the initial capture of new biometría-pendiente cases happens inside `actualizarSolicitudesNuevasAPI()` (`Código.js`), not here — this file's own `_guardarLoteBiometriaPendiente()` just receives and stores what that call finds; this file then handles the WhatsApp/escalation cycle and `autoAsignarBiometria()`. |
| `Reestudios.js` | Saves re-study outcomes, triggers next assignment |
| `Tests.js` | Test suite (53 test functions, 174 assertions) — run `EJECUTAR_TODAS_LAS_PRUEBAS` in GAS editor. Includes `test_X1_SimulacionDiaProduccion`, an in-memory simulation of a full production day (30 analysts, real cupo/headcount config, synthetic case data) that stress-tests cupo fairness and canon filtering at realistic volume without touching any real sheet. |

The legacy `ModeloAsignación.js` (`RequestLead`) and `ModeloReestudios.js` (`RequestLeadReestudios`) engines, once kept for backwards compatibility, have since been removed from the project — `MotorAsignacion.js` is the only assignment engine now.

### Frontend Files

HTML files embed their JavaScript inline. `main.js.html` is included via `<?= HtmlService.createHtmlOutputFromFile('main.js') ?>` and contains shared analyst logic (DataTables, modal handling, state machine).

| File | View |
|------|------|
| `VistaUnificada.html` | Unified analyst dashboard (all teams: Digital, Biometry, Re-studies) |
| `VistaAdmin.html` | Admin KPIs, user management, priority control. Does **not** include `estilos-compartidos.html` or `utilidades-ux.html` — it keeps its own copy of the design tokens and its own error/loading helpers, so changes to the shared files don't automatically reach it. |
| `utilidades-ux.html` | Shared UI utilities (SweetAlert wrappers, loaders) — included only by `VistaUnificada.html` |

### Data Sources (Google Sheets)

**Spreadsheet IDs are hardcoded `const`s at the top of their file, not Script Properties** — despite what earlier versions of this doc claimed. A handful of call sites (~10, mostly around `guardarCambiosInternos`/`_recalcularContadoresInterno`) additionally check a same-named Script Property first and fall back to the hardcoded const if it's unset, but the large majority of call sites (67+ for `TARGET_SOLICITUDES_SS_ID` alone) use the bare hardcoded const directly with no property check at all. Practically: **setting the Script Property alone will not migrate the spreadsheet** — most of the codebase would keep pointing at the old hardcoded ID. Treat the constants below as the actual source of truth:

| Constant | File | Purpose |
|----------|------|---------|
| `TARGET_SOLICITUDES_SS_ID` | `Código.js` | Main spreadsheet (solicitudes, Usuarios, score, Festivos, Historico_Gestiones) |
| `WAREHOUSE_ID` | `Código.js` | Policy warehouse — no Script Property override anywhere |
| `ID_SHEET_GESTION_DIRECTA` | `Código.js` | Holds `pendiente_codeudor` (see `revisarEnEsperaCodeudor`/`sincronizarHistoricoSAI`) |
| `ID_WAREHOUSE_USUARIOS` | `Biometria.js` | Same spreadsheet as `TARGET_SOLICITUDES_SS_ID` (same literal ID), referenced under a different constant name for biometría code |
| `ID_SHEET_BIOMETRIA_PENDIENTE` | `Biometria.js` | Holds `pendiente_biometria` |
| `ID_HOJA_REESTUDIOS` | `Reestudios.js` | Re-studies spreadsheet — one of the few with a working Script Property override (`ID_HOJA_REESTUDIOS`) in ~6 call sites |

`ID_SHEET_ORIGEN`/`ID_SHEET_GESTION` (previously documented here as "Biometry pending queue"/"management log") are **obsolete** — they only exist as commented-out dead constants in `Biometria.js`, already marked `OBSOLETA` in the code. Biometries are sourced from the `solicitud` sheet instead (see `descargarBiometriasAPI`, suspended, below).

Actual Script Properties (genuinely read via `PropertiesService`, no hardcoded fallback):

| Property | Purpose |
|----------|---------|
| `KeyEndPointSaiFullProd` | SAI API key |
| `endPointSaiFullStageProd` | SAI endpoint (by request ID) |
| `endpointSaiNewApi` | SAI endpoint (by consecutive) — used for individual case lookups |
| `endPointSaiNewApiDate` | SAI endpoint (by date range, paginated) — used by `actualizarSolicitudesNuevasAPI`/`sincronizarHistoricoSAI` |
| `GLOBAL_PRIORIDAD` | Assignment priority mode (DIGITAL_PRIMERO, DESAPLAZAMIENTO_PRIMERO, INDUCCION_PRIMERO) |
| `ORDEN_DESAPLAZAMIENTO` | Within the desaplazamiento/biometría queue: `RECIENTE_PRIMERO` (LIFO by fechaResultado, default) or `ANTIGUO_PRIMERO` (FIFO). Admin-configurable via `admin_setOrdenDesaplazamiento()`; read by both `RequestLeadUnificado` and `autoAsignarBiometria`. |
| `PUNTERO_ROTACION` | Category rotation pointer (VIP rotation) |
| `PUNTERO_BACKFILL_SAI_DIAS` | Rotation pointer for `sincronizarHistoricoSAI()`'s backfill chunks (same pattern as `PUNTERO_ROTACION`) |
| `CUPOS_{EQUIPO}_{TIPO}` | Daily cupo limits per team and type |

### Dynamic Type Catalog

Request types are configured dynamically in the `TiposSolicitud` sheet (not hardcoded). The 7 active type IDs are:

`digital`, `induccion`, `reestudio`, `desaplazamiento`, `nuevaUar`, `deudorUar`, `biometriaFallida`

All code must use these exact IDs (singular form). The legacy mapping to Script Property suffixes is handled by `_propKeyCupo()` in Admin.js.

### Assignment Engine Logic (`MotorAsignacion.js`)

`RequestLeadUnificado()` is the primary assignment engine for all teams:

1. Acquires `ScriptLock` (only 1 assignment at a time system-wide)
2. Validates analyst is ACTIVE with available capacity
3. Resolves team from specialist config or override
4. Reads cupos via `obtenerCuposEfectivos()` (individual JSON or global properties)
5. Counts today's assignments per type — from the incremental counters in `PropertiesService` (`_PROP_CONTADORES_CUPO` for daily quota, `_PROP_CARGA_PENDIENTE` for concurrent open cases), not a live scan of `Historico_Gestiones`. These counters are maintained on every assignment/desasignación/reasignación (`_incrementarContadorCupo`/`_decrementarContadorCupo`/`_ajustarCargaPendiente`) and are load-bearing for both speed and correctness — if they drift (e.g. an admin deletes a row directly from the sheet, which bypasses all counter-adjustment code but is a valid, expected action), the recovery path is `admin_recalcularContadores()` / the `trigger_recalcularContadores()` nightly trigger, which rebuild both stores from the real sheet state.
6. Collects pending cases, skipping types with full cupos
7. Applies canon filter (DIGITAL < 8M, CANONES_ALTOS >= 8M)
8. **Sorts by 4 levels:** reasignadas first → lowest cupo ratio type → external channel first → FIFO (oldest). Exception: `desaplazamiento`/biometría orders by `fechaResultado` (last SAI update) instead of `fechaRadicacion`, direction controlled by `ORDEN_DESAPLAZAMIENTO` (`RECIENTE_PRIMERO`/LIFO by default, or `ANTIGUO_PRIMERO`/FIFO) — same property also governs `autoAsignarBiometria()` in `Biometria.js`. Before sorting, non-reasignada `desaplazamiento` candidates are also gated by `_calcularLimiteLiberacionDesaplazamiento()` (`Biometria.js`, added 2026-07-14): mirrors operación's real call-center rule (confirmed directly by operación) — before 12pm only cases with `fechaResultado` from *before today* are offered; from 12pm on, today's 00:00–11:59am window is added too. A case with a this-afternoon `fechaResultado` is never offered until the next business day's morning session. The boundary is always anchored to "today" (never to an explicit "yesterday"), so any number of preceding non-working days (weekend, holiday, or both) collapses into the next business day's morning session automatically, with no holiday-specific code needed. Same gating applied in `autoAsignarBiometria()`'s candidate collection so both assignment paths stay consistent.
9. For DIGITAL/CANONES_ALTOS: applies VIP rotation + score categories
10. Writes assignment, moves row to `Historico_Gestiones`, deletes from source
11. Releases lock

### Teams Configuration (`Equipos` sheet)

5 teams configured dynamically with columns: id, nombre, icono, colorHex, activo, usarVipRotacion, usarScoreCategories, maxAsignarPorLlamada, ordenPrioridad, fuentesDatos, modalTipo, funcionGuardar, canonDesde, canonHasta, canonTipos.

Teams are cached for 6 hours — call `_invalidarCacheEquipos()` (or `limpiarCache()`) after changes.

### Automatic Triggers

Time-based triggers run server-side (configured in GAS triggers UI, not in code). This list is the full inventory as of 2026-07-13 — keep it in sync whenever a trigger is added, retired, or rescheduled in the Apps Script editor, since this is the only place the whole set is documented together.

**SAI sync:**
- `actualizarSolicitudesNuevasAPI()` (`Código.js`) — Every 5–10 min, 24/7 (no time-of-day restriction as of 2026-07-13). Thin wrapper around `_sincronizarVentanaSAI(sIni, sFin, etiquetaLog)` with a fixed "last 3 days" window. **Single** paginated query against SAI (`endPointSaiNewApiDate`) that classifies results into normal solicitudes *and* new biometría-pendiente cases in the same pass (merged 2026-07-13 — previously `_capturarNuevasBiometrias` in `Biometria.js` ran an identical, separate paginated query just for the biometría subset). Never holds `ScriptLock` during the SAI fetch — the lock is only acquired later, inside the downstream save functions (`procesarYGuardarLote`, `eliminarSolicitudesFinalizadas`, `moverAListaEsperaCodeudor`, `_guardarLoteBiometriaPendiente`).
- `sincronizarHistoricoSAI()` (`Código.js`) — **Suspended (2026-07-14, logs and returns immediately)**. Was built to call `_sincronizarVentanaSAI()` with a window that rotates further back in time each run (`DIAS_POR_TANDA_BACKFILL_SAI` = 3-day chunks, up to `VENTANA_MAXIMA_BACKFILL_SAI_DIAS` = 90 days back, then wraps around — pointer in Script Property `PUNTERO_BACKFILL_SAI_DIAS`, same rotation pattern as `PUNTERO_ROTACION`). The intent: the 3-day window above only catches a status change (e.g. to `CODEUDORES_REQUERIDOS`) if it happens within 3 days of the original radicación — a request that changes status later than that is invisible to the whole system, forever, with no automatic recovery (confirmed real case, solicitud 12171019, jul-2026: radicated weeks earlier, missed entirely). But it shares `_sincronizarVentanaSAI()`'s inclusion rules with the 3-day sync, and those rules don't exclude `EN_ESTUDIO` — so any old solicitud (weeks/months back) still sitting in `EN_ESTUDIO` with no real change got re-inserted into `solicitud` as if new, on every rotation that reached its date range. Confirmed real cases (2026-07-14): 12139082, 12138904, 12139026 — all still `EN_ESTUDIO` since late May, never changed, just missing documentation, re-surfaced as apparent duplicates and confused analysts. Suspended until there's a way to distinguish "real status change caught late" from "still exactly the same, just looking further back" (e.g. skip re-inserting when `estadoGeneral === "EN_ESTUDIO"` specifically for backfill-sourced calls, while still catching `CODEUDORES_REQUERIDOS`/biometría/final-status changes normally). While suspended, the system is back to depending only on the 3-day window of `actualizarSolicitudesNuevasAPI()` — the 12171019-style "status change past 3 days goes invisible forever" risk is back until this is redesigned and re-enabled.
- `consultarBiometriasPeriodicaAPI()` (`Biometria.js`) — **Suspended** (2026-07-13, logs and returns immediately). Its work is now done by `actualizarSolicitudesNuevasAPI()` above; safe to delete this trigger from the Apps Script editor whenever convenient.
- `descargarBiometriasAPI()` — **Suspended** (`Biometria.js` — logs and returns immediately). Biometries are now sourced from the `solicitud` sheet instead; kept only so the existing trigger doesn't error if still scheduled.
- `revisarEnEsperaCodeudor()` (`Código.js`) — Periodic (own schedule, independent of the sync above): re-checks each solicitud waiting on `CODEUDORES_REQUERIDOS` individually against SAI (one call per pending id), reactivates or archives as needed.

**Biometría follow-up cycle (all in `Biometria.js`):**
- `consultarBiometriasPeriodicaAPI()` — see "Suspended" above.
- `cicloPrimerContactoBiometria()` — Every hour: calls `_enviarPrimerContactoBiometria()`, which re-checks each phase-empty pending biometría against SAI (one call per case) and sends the first WhatsApp contact once the 4h window has passed.
- `cicloBiometriaPendiente()` — 8am and 12pm: calls `limpiarBiometriasResueltas()`, `_archivarColaBiometriaVencida()`, and `_procesarCortePendientes()` in sequence (refresh, archive expired, escalate WA_ENVIADO cases to the call queue). Since 2026-07-14, the whole function returns immediately (does none of the three) if `_esDiaNoHabilOperacion(new Date())` is true (Sunday or a date in the `Festivos` sheet) — before this guard, the function ran unconditionally every day including Sundays/holidays, so `_archivarColaBiometriaVencida()` could archive a case purely on wall-clock hours elapsed even on a day operación never worked to call it, recreating the same kind of premature-archival problem the `fecha_actualizacion_fase` fix (below) addressed from a different angle. `_esDiaNoHabilOperacion()` was extracted out of `_dentroDeVentanaLey2300()` (same Sunday/`Festivos` check, minus the hour-of-day part) so both guards share one holiday source of truth. `desaplazamiento`/`biometriaFallida` cases only ever become assignable (both to analysts via `RequestLeadUnificado` and via `autoAsignarBiometria()`) once `_procesarCortePendientes()` escalates them into `solicitud` — there's no path that skips the WA→escalation cycle, so a Ley 2300/holiday-blocked stretch (see `_dentroDeVentanaLey2300()`) with no new WA sends means no new escalations either, and the assignable queue can run dry until sending resumes. Since 2026-07-14, `_archivarColaBiometriaVencida()` ages a case from the timestamp it actually entered the queue (`pendiente_biometria`'s `fecha_actualizacion_fase` at the moment its fase became `ESCALADA`), not from SAI's `fechaResultado`/`fechaRadicacion` — anchoring to the SAI date used to cause cases delayed by a blocked WA window to get archived almost immediately after finally escalating, instead of getting their full ~12h in queue. There's still no automatic un-archive; `admin_desarchivarBiometrias()` (see "Manual only" below) is the manual recovery path. `_procesarCortePendientes()` caps itself at `MAX_CANDIDATOS_POR_CORTE` (500, oldest-`fecha_actualizacion_fase`-first) and writes in blocks of `TAMANO_BLOQUE_ESCRITURA_CORTE` (50) as it goes, with a `TIEMPO_MAXIMO_CONSULTAS_CORTE_MS` (20 min) time backstop — before 2026-07-14 it queried SAI for every WA_ENVIADO candidate first and wrote nothing until the whole batch finished, so a backlog large enough to exceed Apps Script's execution limit (confirmed real case: 1369 candidates, still running past 23 minutes) got killed before a single write happened, and the next corte re-queried the identical backlog from scratch forever. `_enviarPrimerContactoBiometria()` and `limpiarBiometriasResueltas()` still have this same query-all-then-write-all shape and are exposed to the same risk if their own candidate counts grow large enough — not yet fixed.
- `cicloLimpiezaBiometriaEscalada()` — Every hour: calls `limpiarBiometriasResueltas()` again, to catch biometrías that resolved themselves after being escalated. `limpiarBiometriasResueltas()` has a 5-minute self-guard (`_MIN_ENTRE_CORRIDAS_LIMPIAR_BIOMETRIAS`, PropertiesService-backed) so if this trigger's schedule ever overlaps with `cicloBiometriaPendiente()`'s 8am/12pm slots, the second call skips instead of re-querying SAI for the same cases.

**Daily status reconciliation (both in `Biometria.js`, both call `_verificarAprobacionesPendientesEnSAI()` — unified 2026-07-13, previously ~90% duplicated code):**
- `triggerVerificacionDesaplazamientos()` — Daily, 4–5pm: re-checks desaplazamiento/inducción cases (`Historico_Gestiones` principal, 90-day window) left without a final result.
- `triggerVerificacionInducciones()` — **Suspended** (2026-07-13, logs and returns immediately). `triggerVerificacionDesaplazamientos()` already covers inducción internally — this was 100% redundant (confirmed by a comment already in the code before the fix). Safe to delete this trigger from the Apps Script editor whenever convenient.
- `triggerVerificacionReestudiosUar()` — Own daily trigger, 4–5pm: same reconciliation for reestudio/nuevaUar/deudorUar cases (`ID_HOJA_REESTUDIOS`, 3-day window).

**Other:**
- `trigger_recalcularContadores()` (`Admin.js`) — Daily, during off-hours (e.g. 2am–3am): rebuilds the incremental counters (`_PROP_CARGA_PENDIENTE`, `_PROP_CONTADORES_CUPO`) from scratch by reading `Historico_Gestiones`. These counters are now load-bearing for both speed and correctness (see below), and can drift if an admin deletes rows directly from the sheet (an accepted, valid action) — this trigger is the automatic safety net so that recovery doesn't depend on someone remembering to run `admin_recalcularContadores()` by hand. **Not yet scheduled** — must be added manually in the Apps Script editor (clock icon → Add trigger).
- `trigger_importarFestivosColombiaAnual()` (`Admin.js`) — Monthly, only acts in December: imports next year's Colombian holidays from the public Google Calendar.

**Manual only (not triggers — run from the Apps Script editor on demand):** `diagnosticarDestinosBiometria()` / `diagnosticarDestinosBiometriaTest()` (debug a single case's WhatsApp destinations), `corregirBiometriasMalEnrutadas()` (idempotent one-off repair for misrouted cases), `forzarPrimerContactoBiometriaManual()` (force first-contact WhatsApp without waiting for the 4h window), `diagnosticarSolicitudCodeudor()` / `diagnosticarSolicitudCodeudorTest()` (`Código.js` — read-only, checks all 4 codeudor-flow locations plus SAI's live status for one solicitud id), `recuperarSolicitudCodeudorManual()` / `recuperarSolicitudCodeudorManualTest()` (`Código.js` — moves one already-identified stuck solicitud into `pendiente_codeudor` immediately; matters more now that `sincronizarHistoricoSAI()` is suspended and its rotation isn't running at all), `admin_listarBiometriasArchivadas()` / `admin_desarchivarBiometrias(cantidad)` (`Biometria.js` — also exposed as a "Desarchivar Biometrías" button in `VistaAdmin.html`'s dashboard config strip; recovers the N most recently `ARCHIVADA` cases from `pendiente_biometria`, revalidating each against SAI before reinserting into `solicitud`'s call queue — see note below), `diagnosticarArchivadoColaBiometria()` (`Biometria.js` — read-only, replays `_archivarColaBiometriaVencida()`'s Phase 1 candidate selection and current threshold without archiving anything, logging which pending cases would/wouldn't be archived right now and why — added 2026-07-14 to let an admin sanity-check the archival timing fix before/after a Ley 2300-blocked stretch), `diagnosticarLiberacionDesaplazamiento()` (`Biometria.js` — read-only, replays the same candidate selection as `RequestLeadUnificado`/`autoAsignarBiometria` against `_calcularLimiteLiberacionDesaplazamiento()` without assigning anything, logging which pending desaplazamiento cases are currently offerable to an analyst vs. still waiting for their release window — added 2026-07-14 alongside the release-window gating itself).

### SLA Calculation

`calcularTiemposCaso()` in `MotorTiempos.js` is the active SLA engine. It calculates three metrics (minutos_cola, minutos_gestion, minutos_general) using per-analyst shifts from the `Turnos`, `Analistas_Turnos`, and `Horas_Extra` sheets. The legacy `calcularMinutosHabilesSLA()` in `Código.js` is deprecated.

## Corporate Design System

### Brand Colors (El Libertador)

| Name | HEX | CSS Variable |
|------|-----|--------------|
| Rojo intenso | `#BD0F14` | `var(--color-primario)` |
| Azul oscuro | `#253150` | `var(--color-secundario)` |
| Gris medio | `#706F6F` | `var(--gris)` |

**Rules:**
- Always use `var(--color-primario)` for red **brand elements** (headers, primary buttons, active nav) — never `#dc2626`, `#ef4444`, or other generic reds for those.
- Always use `var(--color-secundario)` or `var(--grad-azul)` for the primary blue **brand elements**.
- Semantic state colors (green = approved/productive, amber = delayed, red = error/rejected/danger) are acceptable for status indicators only, never for brand elements. The codebase consistently uses a distinct danger-red family (`#fee2e2`/`#fecaca`/`#b91c1c`) for rejected/error states — this is intentional, so that "this failed" reads differently from "this is a primary brand action" in the same UI.
- Each request type/team also has its own fixed categorical badge color (e.g. Digital = blue `#dbeafe`/`#1d4ed8`, Reestudios = purple, UAR = pink, Desaplazamiento = indigo) for quick visual scanning across tables — these are deliberately distinct from the brand palette and from each other, not a violation of it.
- The full gradient variables `--grad-azul` and `--grad-rojo` are defined in `estilos-compartidos.html` and must be used for headers/buttons that need a gradient feel.

## Key Conventions

- **Concurrency:** Always use `LockService.getScriptLock()` with `waitLock(...)` before writing to any shared sheet, and always release it in a `finally` block (or `if (lock.hasLock()) lock.releaseLock()` inside `finally`) — never release manually before each `return`, since an exception thrown between `waitLock()` and a manual release leaves the lock held until it expires, blocking every analyst until then.
- **Never call an external API (SAI) while holding the ScriptLock.** The lock should only wrap the actual sheet read/write; slow network calls happen before acquiring it or after releasing it.
- **Sheet lookups:** Prefer `range.createTextFinder(text).matchEntireCell(true).findNext()/findAll()` over reading a full column/sheet into memory and looping to find a match — this matters once `Historico_Gestiones` has thousands of rows and 40 analysts are hitting it concurrently.
- **Error handling:** `google.script.run` mutation endpoints (the ones with a `{success, message}` return contract) should wrap their body in `try { ... } catch (e) { return { success: false, message: e.message }; }`. Plain getters that return raw arrays/objects should generally NOT be wrapped this way — turning a getter's failure into a `{success:false}` object breaks callers that call `.forEach()`/`.map()` on the expected array shape; letting the exception propagate to `withFailureHandler` is safer for those.
- **User-facing error text:** never show `err.message`/`e.message` raw in a `Swal.fire` or inline error banner — analysts and admins aren't technical. Route it through `UX.mensajeError(err)` (`utilidades-ux.html`, used by `VistaUnificada.html`/`main.js.html`) or `mensajeErrorAmigable(err)` (defined locally in `VistaAdmin.html`, which doesn't include `utilidades-ux.html`) to get a warm, translated message; the raw detail still goes to `console.error` for debugging.
- **Number format:** Use `.setNumberFormat("@")` on cells that must preserve leading zeros (policy numbers, IDs).
- **Flush writes:** Call `SpreadsheetApp.flush()` after batch writes to force immediate persistence before returning to the client.
- **Frontend↔Backend calls:** All client-to-server calls use `google.script.run.withSuccessHandler(...).withFailureHandler(...)`. Never use `fetch` or `XMLHttpRequest` — GAS sandboxes prohibit direct HTTP from the client.
- **Date format:** Display dates as `dd/MM/yyyy`; store ISO strings internally.
- **Column references:** Sheet columns are referenced by 1-based index (`.getRange(row, col)`). The column map is documented in `DOCUMENTACION_TECNICA.md`.
- **Currency parsing:** values like `canon` may arrive as plain numbers or as Colombian-formatted text (`.` for thousands, `,` for decimals — e.g. `"8.500.000,00"`). Use `_parseCanonColombiano()` (`MotorAsignacion.js`) rather than a naive `parseFloat(...replace(',', '.'))`, which mishandles the thousands separators.
