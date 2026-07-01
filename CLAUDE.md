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
| `ModeloAsignación.js` | Legacy assignment engine (`RequestLead`) — superseded by MotorAsignacion.js, kept for backwards compatibility |
| `ModeloReestudios.js` | Legacy re-studies assignment (`RequestLeadReestudios`) — superseded by MotorAsignacion.js |
| `MotorTiempos.js` | SLA time calculation engine — per-analyst shift-aware working minutes |
| `Admin.js` | Admin dashboard, user CRUD, dynamic cupos (global/individual), teams CRUD, shifts, permissions |
| `Biometria.js` | Downloads pending biometries (SAI codes 500/503), auto-assigns |
| `Reestudios.js` | Saves re-study outcomes, triggers next assignment |
| `Tests.js` | Test suite (253 tests) — run `EJECUTAR_TODAS_LAS_PRUEBAS` in GAS editor |

### Frontend Files

HTML files embed their JavaScript inline. `main.js.html` is included via `<?= HtmlService.createHtmlOutputFromFile('main.js') ?>` and contains shared analyst logic (DataTables, modal handling, state machine).

| File | View |
|------|------|
| `VistaUnificada.html` | Unified analyst dashboard (all teams: Digital, Biometry, Re-studies) |
| `VistaAdmin.html` | Admin KPIs, user management, priority control |
| `ux-enhancements.html` | Shared UI utilities (SweetAlert wrappers, loaders) |

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
5. Counts today's assignments per type from `Historico_Gestiones`
6. Collects pending cases, skipping types with full cupos
7. Applies canon filter (DIGITAL < 8M, CANONES_ALTOS >= 8M)
8. **Sorts by 4 levels:** reasignadas first → lowest cupo ratio type → external channel first → FIFO (oldest)
9. For DIGITAL/CANONES_ALTOS: applies VIP rotation + score categories
10. Writes assignment, moves row to `Historico_Gestiones`, deletes from source
11. Releases lock

### Teams Configuration (`Equipos` sheet)

5 teams configured dynamically with columns: id, nombre, icono, colorHex, activo, usarVipRotacion, usarScoreCategories, maxAsignarPorLlamada, ordenPrioridad, fuentesDatos, modalTipo, funcionGuardar, canonDesde, canonHasta, canonTipos.

Teams are cached for 6 hours — call `_invalidarCacheEquipos()` (or `limpiarCache()`) after changes.

### Automatic Triggers

Two time-based triggers run server-side (configured in GAS triggers UI, not in code):
- `actualizarSolicitudesNuevasAPI()` — Every 5–10 min, 8am–6pm: pulls new requests from SAI and writes them to the main sheet
- `descargarBiometriasAPI()` — Every 10–15 min: pulls pending biometries (result codes 500/503) from SAI

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
- Always use `var(--color-primario)` for red — never `#dc2626`, `#ef4444`, or other generic reds.
- Always use `var(--color-secundario)` or `var(--grad-azul)` for the primary blue.
- Semantic state colors (green = approved, amber = delayed) are acceptable for status indicators only, never for brand elements.
- The full gradient variables `--grad-azul` and `--grad-rojo` are defined in `estilos-compartidos.html` and must be used for headers/buttons that need a gradient feel.

## Key Conventions

- **Concurrency:** Always use `LockService.getScriptLock()` with `waitLock(15000)` before writing to any shared sheet.
- **Number format:** Use `.setNumberFormat("@")` on cells that must preserve leading zeros (policy numbers, IDs).
- **Flush writes:** Call `SpreadsheetApp.flush()` after batch writes to force immediate persistence before returning to the client.
- **Frontend↔Backend calls:** All client-to-server calls use `google.script.run.withSuccessHandler(...).withFailureHandler(...)`. Never use `fetch` or `XMLHttpRequest` — GAS sandboxes prohibit direct HTTP from the client.
- **Date format:** Display dates as `dd/MM/yyyy`; store ISO strings internally.
- **Column references:** Sheet columns are referenced by 1-based index (`.getRange(row, col)`). The column map is documented in `DOCUMENTACION_TECNICA.md`.
