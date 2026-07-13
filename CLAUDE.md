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
| `Biometria.js` | Downloads pending biometries (SAI codes 500/503), auto-assigns |
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

All IDs are stored in **Script Properties** (not in code). Key properties:

| Property | Purpose |
|----------|---------|
| `TARGET_SOLICITUDES_SS_ID` | Main spreadsheet (solicitudes, Usuarios, score, Festivos) |
| `WAREHOUSE_ID` | Policy warehouse |
| `ID_SHEET_ORIGEN` | Biometry pending queue |
| `ID_SHEET_GESTION` | Biometry management log |
| `ID_HOJA_REESTUDIOS` | Re-studies spreadsheet |
| `KeyEndPointSaiFullProd` | SAI API key |
| `endPointSaiFullStageProd` | SAI endpoint (by request ID) |
| `endpointSaiNewApi` | SAI endpoint (by consecutive) |
| `GLOBAL_PRIORIDAD` | Assignment priority mode (DIGITAL_PRIMERO, DESAPLAZAMIENTO_PRIMERO, INDUCCION_PRIMERO) |
| `ORDEN_DESAPLAZAMIENTO` | Within the desaplazamiento/biometría queue: `RECIENTE_PRIMERO` (LIFO by fechaResultado, default) or `ANTIGUO_PRIMERO` (FIFO). Admin-configurable via `admin_setOrdenDesaplazamiento()`; read by both `RequestLeadUnificado` and `autoAsignarBiometria`. |
| `PUNTERO_ROTACION` | Category rotation pointer |
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
8. **Sorts by 4 levels:** reasignadas first → lowest cupo ratio type → external channel first → FIFO (oldest). Exception: `desaplazamiento`/biometría orders by `fechaResultado` (last SAI update) instead of `fechaRadicacion`, direction controlled by `ORDEN_DESAPLAZAMIENTO` (`RECIENTE_PRIMERO`/LIFO by default, or `ANTIGUO_PRIMERO`/FIFO) — same property also governs `autoAsignarBiometria()` in `Biometria.js`.
9. For DIGITAL/CANONES_ALTOS: applies VIP rotation + score categories
10. Writes assignment, moves row to `Historico_Gestiones`, deletes from source
11. Releases lock

### Teams Configuration (`Equipos` sheet)

5 teams configured dynamically with columns: id, nombre, icono, colorHex, activo, usarVipRotacion, usarScoreCategories, maxAsignarPorLlamada, ordenPrioridad, fuentesDatos, modalTipo, funcionGuardar, canonDesde, canonHasta, canonTipos.

Teams are cached for 6 hours — call `_invalidarCacheEquipos()` (or `limpiarCache()`) after changes.

### Automatic Triggers

Time-based triggers run server-side (configured in GAS triggers UI, not in code):
- `actualizarSolicitudesNuevasAPI()` — Every 5–10 min, 8am–6pm: pulls new requests from SAI and writes them to the main sheet
- `descargarBiometriasAPI()` — Every 10–15 min: pulls pending biometries (result codes 500/503) from SAI
- `trigger_recalcularContadores()` — Daily, during off-hours (e.g. 2am–3am): rebuilds the incremental counters (`_PROP_CARGA_PENDIENTE`, `_PROP_CONTADORES_CUPO`) from scratch by reading `Historico_Gestiones`. These counters are now load-bearing for both speed and correctness (see below), and can drift if an admin deletes rows directly from the sheet (an accepted, valid action) — this trigger is the automatic safety net so that recovery doesn't depend on someone remembering to run `admin_recalcularContadores()` by hand. **Not yet scheduled** — must be added manually in the Apps Script editor (clock icon → Add trigger).
- `trigger_importarFestivosColombiaAnual()` — Monthly, only acts in December: imports next year's Colombian holidays from the public Google Calendar.

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
