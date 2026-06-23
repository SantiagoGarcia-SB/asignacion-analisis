# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Apps Script (GAS) web application for managing request assignment workflows at El Libertador (surety/real estate company). Three analyst roles: Digital Studies, Biometry, and Re-studies. Deployed as a domain-restricted web app on Google Workspace.

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
| `Código.js` | Entry point (`doGet`), SAI API sync, SLA calculation, shared utilities |
| `ModeloAsignación.js` | Assignment algorithm for digital studies — capacity, VIP rotation, category priority |
| `ModeloReestudios.js` | Assignment algorithm for re-studies — FIFO, 1 case per call, excludes UAR |
| `Admin.js` | Admin dashboard data, user CRUD, emergency disable |
| `Biometria.js` | Downloads pending biometries (SAI codes 500/503), auto-assigns |
| `Reestudios.js` | Saves re-study outcomes, triggers next assignment |

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
| `GLOBAL_PRIORIDAD` | Assignment priority mode |
| `PUNTERO_ROTACION` | Category rotation pointer |

### Assignment Engine Logic (`ModeloAsignación.js`)

`RequestLead()` runs when an analyst clicks "Get New Case":
1. Checks analyst is ACTIVE and has capacity (`cupo > 0`)
2. Reads `GLOBAL_PRIORIDAD` to determine category order (NUEVAS_PRIMERO, BIOMETRIA_PRIMERO, INDUCCION_PRIMERO)
3. Applies VIP rotation (tracks `VIP_COUNT_{email}` in Script Properties)
4. Assigns the oldest matching unassigned case, writes analyst email/name/date to the sheet
5. Uses `LockService` to prevent concurrent double-assignments

Same pattern applies in `ModeloReestudios.js` (FIFO, simpler — no VIP or category rotation).

### Automatic Triggers

Two time-based triggers run server-side (configured in GAS triggers UI, not in code):
- `actualizarSolicitudesNuevasAPI()` — Every 5–10 min, 8am–6pm: pulls new requests from SAI and writes them to the main sheet
- `descargarBiometriasAPI()` — Every 10–15 min: pulls pending biometries (result codes 500/503) from SAI

### SLA Calculation

`calcularMinutosHabilesSLA()` in `Código.js` counts only working minutes (8am–6pm Mon–Fri, excluding holidays from the "Festivos" sheet). Stored in column 35 of the main solicitudes sheet in hours.

## Key Conventions

- **Concurrency:** Always use `LockService.getScriptLock()` with `waitLock(15000)` before writing to any shared sheet.
- **Number format:** Use `.setNumberFormat("@")` on cells that must preserve leading zeros (policy numbers, IDs).
- **Flush writes:** Call `SpreadsheetApp.flush()` after batch writes to force immediate persistence before returning to the client.
- **Frontend↔Backend calls:** All client-to-server calls use `google.script.run.withSuccessHandler(...).withFailureHandler(...)`. Never use `fetch` or `XMLHttpRequest` — GAS sandboxes prohibit direct HTTP from the client.
- **Date format:** Display dates as `dd/MM/yyyy`; store ISO strings internally.
- **Column references:** Sheet columns are referenced by 1-based index (`.getRange(row, col)`). The column map is documented in `DOCUMENTACION_TECNICA.md`.
