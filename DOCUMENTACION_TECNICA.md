# 📋 Documentación Técnica Oficial

## Sistema de Gestión y Asignación de Solicitudes de Análisis

---

## 1. 🏷️ Ficha Técnica del Proyecto

| Campo | Detalle |
|-------|---------|
| **Nombre** | Sistema de Asignación y Análisis de Solicitudes |
| **Organización** | El Libertador (Sector Inmobiliario / Fianzas) |
| **Tipo de Aplicación** | Web App desplegada como Google Apps Script |
| **Runtime** | Google Apps Script V8 |
| **Zona Horaria** | America/Bogota (GMT-5) |

### 🎯 Propósito General

El sistema resuelve la necesidad de **gestionar, asignar y dar trazabilidad** a solicitudes de estudios de arrendamiento (fianzas inmobiliarias). Automatiza la distribución inteligente de carga de trabajo entre analistas, controla biometrías pendientes, administra reestudios y provee un panel de administración en tiempo real.

**Beneficiarios directos:**
- **Analistas operativos (Estudio Digital):** Reciben asignaciones automáticas según su capacidad, especialidad y rotación por categoría de inmobiliaria.
- **Administradores:** Monitorizan KPIs, gestionan usuarios, y controlan prioridades del sistema.
- **Analistas de Biometría:** Gestionan solicitudes pendientes de verificación biométrica.
- **Analistas de Reestudios:** Reciben asignación automática equitativa de solicitudes provenientes de Victoria y Correo.

### 🛠️ Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Backend | Google Apps Script (JavaScript V8) |
| Base de Datos | Google Sheets (múltiples hojas de cálculo) |
| Frontend | HTML5 + CSS3 + JavaScript (Client-Side) |
| Framework CSS | Bootstrap 5.3 |
| Tablas Interactivas | DataTables 1.13.x |
| Alertas UI | SweetAlert2 11.x |
| Gráficos | Chart.js 4.x + chartjs-plugin-datalabels 2.x |
| Efectos Visuales | Particles.js 2.0 |
| Fuente | Google Fonts (Manrope) |
| Iconografía | Bootstrap Icons |
| API Externa | SAI (Sistema de Análisis de Inquilinos) |
| Notificaciones | Google Chat Webhooks |
| Control de Versiones | clasp (Google Apps Script CLI) |
| Despliegue | Google Apps Script Web App (acceso por dominio) |

---

## 2. 🏗️ Arquitectura de Software

### Modelo de Diseño

El proyecto utiliza un patrón **Enrutador Central + Módulos por Especialidad**, que combina:

1. **Enrutador por Rol (`doGet()`):** Punto de entrada único que determina qué vista HTML servir según el rol y especialidad del usuario autenticado.
2. **Módulos Backend Especializados:** Archivos `.js` separados por dominio funcional (Admin, Biometría, Reestudios, Modelo de Asignación).
3. **Frontend SPA-like:** Cada vista HTML es autocontenida con su lógica JavaScript embebida, comunicándose con el backend vía `google.script.run`.

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE APPS SCRIPT                         │
│                                                              │
│   doGet() ──► Autenticación por Email (Session API)          │
│       │                                                      │
│       ├── ADMIN ──────────► VistaAdmin.html                  │
│       ├── ASESOR ────────────► VistaUnificada.html            │
│       └── NO RECONOCIDO ─► "Rol no reconocido"              │
│                                                              │
│   ┌─────────────┐  ┌──────────────────┐  ┌─────────────┐   │
│   │  Código.js  │  │ ModeloAsignación  │  │  Admin.js   │   │
│   │ (Core/API)  │  │  (Digital/Bio)   │  │ (Gestión)   │   │
│   └─────────────┘  └──────────────────┘  └─────────────┘   │
│   ┌─────────────┐  ┌──────────────────┐  ┌─────────────────┐│
│   │Biometria.js │  │ Reestudios.js    │  │ModeloReestudios ││
│   │(Biometría)  │  │ (Gestión Reest.) │  │(Asig. Reest.)   ││
│   └─────────────┘  └──────────────────┘  └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐   ┌──────────────────┐
│  Google Sheets  │   │  API SAI Externa │
│  (Múltiples SS) │   │  (REST / JSON)   │
└─────────────────┘   └──────────────────┘
```

### Estructura de Archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `Código.js` | **Núcleo del sistema.** Enrutador `doGet()`, autenticación, `obtenerCuposEfectivos()` (lectura de cupos individuales/globales con retrocompatibilidad singular/plural), `guardarCambiosInternos()` (guardado con mapeo tipo→clase para los 7 tipos), gestión de estados (`actualizarEstadoPropio`, `admin_sincronizarEstado` — ambos con `getScriptLock`), sincronización API SAI, permisos/incapacidades, autoservicio del analista. |
| `ModeloAsignación.js` | **Motor legacy de asignación (v1).** `RequestLead()` — supersedido por `RequestLeadUnificado` en `MotorAsignacion.js`. Se mantiene por compatibilidad pero no es llamado desde el frontend actual. |
| `Admin.js` | **Panel de administración.** CRUD de usuarios, dashboard de KPIs, control de prioridad global, cupos por equipo e individuales con histórico, novedades/estados del equipo, sistema de **turnos y horarios** (CRUD de turnos, asignación a analistas, horas extra, alertas), gestión de **permisos e incapacidades** (aprobación/rechazo), botón de pánico, desasignación de solicitudes. |
| `MotorTiempos.js` | **Motor unificado de tiempos hábiles.** `calcularTiemposCaso(tRadicacion, tAsignacion, tResultado, emailAnalista)` → `{ minutos_cola, minutos_gestion, minutos_general }`. Lee turnos de las hojas `Turnos`, `Analistas_Turnos` y `Horas_Extra` para calcular tiempos según el horario real de cada analista. |
| `Biometria.js` | **Módulo de biometría.** Descarga desde API de solicitudes con códigos 500/503, asignación automática a analistas de biometría, verificación de estado en tiempo real, gestión y tipificación de casos. |
| `ModeloReestudios.js` | **Motor legacy de reestudios (v1).** `RequestLeadReestudios()` — supersedido por `RequestLeadUnificado` en `MotorAsignacion.js`. Se mantiene por compatibilidad. |
| `Reestudios.js` | **Módulo de gestión de reestudios.** Obtención de datos asignados (`getReestudiosData()`) — lee de `Historico_Gestiones` del ssReestudios; guardado de gestión (`guardarGestionReestudio()`) con búsqueda por solicitudId (caso abierto = fechaFin vacía) y auto-reasignación. |
| ~~`index.html`~~ | *(Eliminada)* Vista de Estudio Digital migrada a `VistaUnificada.html` (modal `#modalDigital` con prefijo `dig_`). |
| `VistaAdmin.html` | **Vista del Administrador.** Dashboard con métricas, tabla de usuarios, control de prioridades, sección de cupos (general + individual), novedades del equipo con tabs (disponibilidad + solicitudes de permisos), sección de **Turnos y Horarios** (CRUD de turnos, asignación de analistas, horas extra), modales CRUD, botón de emergencia. |
| `VistaUnificada.html` | **Vista unificada del Analista.** Dashboard multi-equipo (Digital, Biometría, Reestudios) con modales especializados por tipo, métricas, cupos, polling automático y control de estado. Reemplaza las vistas individuales anteriores. |
| ~~`VistaReestudios.html`~~ | *(Eliminada)* Vista de Reestudios migrada a `VistaUnificada.html` (modal `#modalReestudio` con prefijo `rst_`). |
| `main.js.html` | **JavaScript compartido del Analista.** Lógica de renderizado de tabla con DataTables, auto-asignación al entrar, manejo de estados, guardado de gestiones, comunicación con backend. Incluye: `_quitarFilaTabla()` para remoción optimista inmediata de filas tras guardar; `abrirGestionReestudioDigital()` para poblar y mostrar el modal de reestudio; `rmdActualizarEstado()` y `guardarGestionReestudioDesdeDigital()`. |
| `appsscript.json` | **Manifiesto del proyecto.** Configuración de zona horaria, runtime V8, despliegue como Web App con ejecución como usuario desplegador y acceso por dominio. |
| `.clasp.json` | **Configuración de clasp.** Vinculación con el proyecto de Google Apps Script para push/pull del código fuente. |

### Archivos Eliminados (v2)

| Archivo | Razón |
|---------|-------|
| `Uar.js` | Módulo UAR eliminado. Las solicitudes UAR que vienen de Victoria/Correo ahora se gestionan desde el módulo de Reestudios. Las UAR de la API se gestionan por el modelo principal. |
| `VistaUar.html` | Vista UAR eliminada. Ya no existe como especialidad independiente. |
| `VistaBiometria.html` | Vista de Biometría eliminada. Toda su funcionalidad fue migrada a `VistaUnificada.html` (modal `#modalBiometria` con prefijo `bio_`). |
| `VistaReestudios.html` | Vista de Reestudios eliminada. Toda su funcionalidad fue migrada a `VistaUnificada.html` (modal `#modalReestudio` con prefijo `rst_`). |
| `index.html` | Vista de Estudio Digital eliminada. Toda su funcionalidad fue migrada a `VistaUnificada.html` (modal `#modalDigital` con prefijo `dig_`). |

### Nuevo Archivo (v2.5)

| Archivo | Responsabilidad |
|---------|----------------|
| `MotorTiempos.js` | **Motor unificado de cálculo de tiempos hábiles.** Reemplaza `calcularMinutosHabilesSLA()` para soportar turnos personalizados por analista. Función principal: `calcularTiemposCaso(tRadicacion, tAsignacion, tResultado, emailAnalista)` que devuelve `{ minutos_cola, minutos_gestion, minutos_general }`. Lee configuración de las hojas `Turnos`, `Analistas_Turnos` y `Horas_Extra`. |
| `MotorAsignacion.js` | **Motor unificado de asignación (v3).** `RequestLeadUnificado(equipoIdOverride)` — motor principal para los 5 equipos. Sorting proporcional por ratio de cupos, prioridad de canal externo, filtro de canon, VIP/Score para equipos digitales. Reemplaza `RequestLead` y `RequestLeadReestudios`. |
| `Tests.js` | **Suite de pruebas 360° (253 tests).** Bloques A-U: equipos, mapeo, cupos, prioridad, sorting, VIP, canon, motor unificado, utilidades, datos reales, dry-runs, turnos, catálogo dinámico, locks, histórico. Ejecutar: `EJECUTAR_TODAS_LAS_PRUEBAS` en GAS. |

### Gestión de Datos

El sistema utiliza **Google Sheets como base de datos relacional distribuida**, accediendo a múltiples Spreadsheets por su ID:

| ID Variable | Hoja(s) Clave | Propósito |
|-------------|---------------|-----------|
| `TARGET_SOLICITUDES_SS_ID` | `solicitud`, `Usuarios`, `score`, `Historico_Gestiones`, `Historico_Estados`, `Festivos`, `historico_cupos`, `Turnos`, `Analistas_Turnos`, `Horas_Extra`, `Permisos_Incapacidades` | Base central de solicitudes, usuarios, scoring, turnos y permisos |
| `WAREHOUSE_ID` | `Hoja 1` | Warehouse de pólizas |
| `ID_SHEET_ORIGEN` (Biometría) | `Hoja 2` | Cola de biometrías pendientes descargadas de la API |
| `ID_SHEET_GESTION` (Biometría) | `Hoja 1` | Registro de biometrías asignadas y gestionadas |
| `ID_HOJA_REESTUDIOS` | `ORIGEN`, `Historico_Gestiones` | Cola de solicitudes de reestudios/UAR pendientes de asignación (ORIGEN) y registro de casos asignados abiertos/cerrados (Historico_Gestiones) |

**Mecanismos de lectura/escritura:**

- **Lectura masiva:** `getDataRange().getValues()` y `getDisplayValues()` para cargas completas de hojas.
- **Escritura por rango:** `setValues()` para lotes, `setValue()` para celdas individuales.
- **Control de concurrencia:** `LockService.getScriptLock()` con `waitLock()` para evitar escrituras simultáneas.
- **Formato de datos:** `setNumberFormat("@")` para forzar texto plano en IDs numéricos.
- **Flush explícito:** `SpreadsheetApp.flush()` para forzar escritura inmediata.

**Almacenamiento de propiedades:**

```javascript
PropertiesService.getScriptProperties()
```

Se usa para almacenar:
- Claves de API (`KeyEndPointSaiFullProd`)
- Endpoints (`endPointSaiNewApiDate`, `endpointSaiNewApi`, `endPointSaiFullStageProd`)
- Punteros de rotación (`PUNTERO_ROTACION`)
- Contadores VIP por usuario (`VIP_COUNT_{email}`)
- Prioridad global (`GLOBAL_PRIORIDAD`)
- Cupos diarios por equipo (`CUPOS_{EQUIPO}_{SUBCATEGORIA}`) — ver sección 4.10

---

## 3. 🔐 Roles y Seguridad

### Modelo de Autenticación

El sistema utiliza **autenticación implícita del dominio de Google Workspace**:

```javascript
Session.getActiveUser().getEmail()
```

No requiere login manual. El acceso está restringido por la configuración del manifiesto:

```json
"webapp": {
  "executeAs": "USER_DEPLOYING",
  "access": "DOMAIN"
}
```

Esto garantiza que solo usuarios del dominio corporativo puedan acceder.

### Niveles de Acceso

| Rol | Columna en Hoja `Usuarios` | Acceso | Funcionalidades |
|-----|---------------------------|--------|-----------------|
| **ADMIN** | Col X (índice 23) | Panel completo | Dashboard, CRUD usuarios, prioridades, cupos por equipo, pánico global, desasignación |
| **ASESOR - ESTUDIO DIGITAL** | Col E (índice 4) | Vista principal | Tabla de solicitudes, gestión de casos, estados personales, auto-asignación inteligente |
| **ASESOR - PENDIENTE_BIOMETRIA** | Col E (índice 4) | Vista biometría | Asignación automática de biometrías, tipificación |
| **ASESOR - REESTUDIOS** | Col E (índice 4) | Vista reestudios | Asignación automática equitativa de reestudios (Victoria + Correo), gestión unificada |

### Mecanismo de Verificación Admin

```javascript
function verificarPermisoAdmin() {
  const userEmail = Session.getActiveUser().getEmail().toLowerCase().trim();
  const ss = SpreadsheetApp.openById(TARGET_SOLICITUDES_SS_ID);
  const hojaUser = ss.getSheetByName("Usuarios");
  const dataUser = hojaUser.getDataRange().getValues();
  const usuario = dataUser.find(f => String(f[2]).toLowerCase().trim() === userEmail);
  if (!usuario || String(usuario[23]).toUpperCase().trim() !== "ADMIN") {
    throw new Error("Acceso Denegado: Se requieren permisos de Administrador.");
  }
}
```

### Validaciones de Estado

- Solo los usuarios con estado **"ACTIVO"** pueden recibir asignaciones automáticas.
- El sistema verifica el estado en base de datos antes de asignar (previene manipulación del frontend).

---

## 4. ⚙️ Flujos Clave del Sistema (Core Workflows)

### 4.1 Flujo de Asignación Unificada — `RequestLeadUnificado` (MotorAsignacion.js)

Motor principal de asignación para todos los equipos. Reemplaza a `RequestLead` (ModeloAsignación.js) y `RequestLeadReestudios` (ModeloReestudios.js) que se mantienen como código legacy.

**5 equipos configurados dinámicamente (hoja `Equipos`):**

| Equipo | Canon | VIP/Score | Modal |
|--------|-------|-----------|-------|
| DIGITAL | 0 – 7,999,999 | Sí | DIGITAL_FULL |
| CANONES_ALTOS | 8,000,000+ | Sí | DIGITAL_FULL |
| REESTUDIOS | Sin filtro | No | REESTUDIO_SIMPLE |
| UAR | Sin filtro | No | REESTUDIO_SIMPLE |
| DESAPLAZAMIENTO | Sin filtro | No | BIOMETRIA_TIPIFICACION |

**Paso a paso:**

1. **Bloqueo de concurrencia:** `ScriptLock` con `waitLock(15000)`. Solo 1 asignación a la vez.
2. **Validación del usuario:** ACTIVO + capacidad disponible (`capTotal - cargaPendiente > 0`).
3. **Resolución de equipo:** Vía `resolverEquipoDesdeEspecialidad()` o `equipoIdOverride`. Lee configuración de la hoja `Equipos` (cacheada 6h).
4. **Lectura de cupos:** `obtenerCuposEfectivos(email, equipoId, dataUsuarios)` → individuales (JSON col Y) o globales (ScriptProperties).
5. **Conteo de asignaciones hoy:** Cuenta por tipo (`digital`, `induccion`, `reestudio`, `desaplazamiento`, `nuevaUar`, `deudorUar`, `biometriaFallida`) en `Historico_Gestiones` principal + reestudios.
6. **Recolección de pendientes:** Recorre hoja `solicitud` y `ORIGEN` (reestudios). Descarta tipos con cupo lleno. Aplica filtro de canon si el equipo lo tiene (`canonTipos=["digital"]`).
7. **Ordenamiento — 4 niveles de prioridad:**

   ```
   NIVEL 1: Reasignadas (marcadas por admin) → prioridad -1
   NIVEL 2: Tipo con menor ratio cupo usado (asignadosHoy / cupoDiario)
            Desempate: GLOBAL_PRIORIDAD (DIGITAL_PRIMERO, INDUCCION_PRIMERO, etc.)
   NIVEL 3: Canal externo primero (Canal ≠ EL_LIBERTADOR)
   NIVEL 4: FIFO (más antiguo, por fechaRadicacion).
            Excepción — desaplazamiento/biometría: ordena por fechaResultado (última
            actualización SAI), en LIFO (más reciente) o FIFO (más antiguo) según la
            propiedad ORDEN_DESAPLAZAMIENTO (configurable por el admin desde el
            dashboard). autoAsignarBiometria() en Biometria.js respeta la misma propiedad.
   ```

8. **VIP y Score (solo DIGITAL y CANONES_ALTOS):** Rotación 2 VIP → 1 otra categoría. Categorías: mediana, grande, pequeña, premier, preferente, micro, pyme.
9. **Asignación:** Escribe email/nombre/fecha, mueve fila a `Historico_Gestiones`, elimina de hoja origen.
10. **Libera lock.**

### 4.2 Flujo de Asignación Equitativa — Reestudios (`RequestLeadReestudios` en `ModeloReestudios.js`)

Motor de asignación para solicitudes de Victoria y Correo. Opera sobre la hoja "ORIGEN" del spreadsheet `ID_HOJA_REESTUDIOS`.

**Paso a paso:**

1. **Bloqueo de concurrencia:** `LockService.getScriptLock()` con timeout de 15s.
2. **Validación del usuario:**
   - ¿Registrado en hoja Usuarios? ✓
   - ¿Estado = "ACTIVO"? ✓
   - ¿Capacidad > 0? ✓
3. **Lectura de cupos del equipo Reestudios:** Se leen las propiedades `CUPOS_REESTUDIOS_*` que definen el límite diario por subcategoría (reestudio, UAR, nuevas, inducciones, biometría).
4. **Conteo de asignaciones del día:** Se cuenta cuántos casos de cada tipo le fueron asignados hoy al analista (buscando en ORIGEN por fechaAsignacion del día).
5. **Cálculo de carga actual:** Cuenta filas en ORIGEN donde columna G = email del analista Y columna J vacía (sin gestionar).
6. **Cupo disponible:** `capacidad - cargaActual`. Si <= 0 → "Capacidad llena".
7. **Búsqueda de caso disponible:** Recorre la hoja ORIGEN buscando la primera fila que cumpla:
   - Columna G vacía (sin asignar)
   - Columna B no vacía (tiene nro solicitud)
   - NO es "NUEVA UAR" ni "DEUDOR UAR" (excluidos por tipo/clase)
   - El cupo diario del tipo de caso no esté lleno
8. **Asignación (máximo 1 por llamada):** Escribe en la fila:
   - Col G: email del analista
   - Col H: nombre del analista
   - Col I: fecha/hora actual
9. **⚠️ Movimiento automático:** Inmediatamente después de escribir la asignación, la fila completa (18 columnas) se **copia a la hoja `Historico_Gestiones`** del mismo spreadsheet y se **elimina de ORIGEN**. El caso asignado ya NO existe en ORIGEN.
10. **Retorna resultado.** Si no hay casos disponibles o todos los cupos están llenos → "No hay solicitudes pendientes o tu cupo diario está lleno."

**Cuándo se ejecuta:**
- Al entrar el analista a la vista (si no tiene pendientes y está ACTIVO)
- Al guardar una gestión (se intenta asignar un nuevo caso automáticamente)

**Estructura de la hoja "ORIGEN" y `Historico_Gestiones` de ssReestudios:**

Ambas hojas comparten el mismo esquema de columnas (la fila se mueve completa al asignar):

| Col | Campo | Quién lo escribe |
|-----|-------|-----------------|
| A(1) | fechaRadicacion | Script de ingesta |
| B(2) | solicitud | Script de ingesta |
| C(3) | linkDrive | Script de ingesta |
| D(4) | origen (VICTORIA/CORREO) | Script de ingesta |
| E(5) | tipoDeProceso | Script de ingesta |
| F(6) | claseDeSolicitud | Script de ingesta |
| G(7) | analistaAsignado (email) | Motor de asignación |
| H(8) | nombreAnalista | Motor de asignación |
| I(9) | fechaAsignacion | Motor de asignación |
| J(10) | fechaFinGestion | Vista (al guardar gestión) |
| K(11) | estadoGestion | Vista (al guardar gestión) |
| L(12) | motivoAplazamiento | Vista (al guardar gestión) |
| M(13) | motivoNegacion | Vista (al guardar gestión) |
| N(14) | observaciones | Vista (al guardar gestión) |
| O(15) | tiempoTotalResolucion (min) | Cálculo al guardar |
| P(16) | tiempoGestion (min) | Cálculo al guardar |
| Q-R (17-18) | Campos adicionales | Script de ingesta |

**ORIGEN** = cola de casos pendientes de asignación (col G vacía). **Historico_Gestiones** = todos los casos ya asignados (col G llena), abiertos (col J vacía) o cerrados (col J con fecha).

### 4.3 Flujo de Gestión de una Solicitud — Estudio Digital (`guardarCambiosInternos`)

1. **Frontend (VistaUnificada.html → modal `#modalDigital`):** El analista abre un modal, selecciona estado, biometría, comentarios y motivos. Puede gestionar tanto solicitudes digitales (de la hoja `solicitud`) como reestudios (de ssReestudios).
2. **Discriminador de ruta (`tipoSolicitudActual`):** El frontend envía `tipoSolicitudActual: 'reestudio'` cuando el caso proviene del modal de gestión de reestudio (`#modalReestudioDigital`). Esto permite al backend saber a qué hoja escribir.
3. **Búsqueda de fila destino (RUTA A — solicitudes digitales y del warehouse):**
   - Solo se ejecuta si `tipoSolicitudActual !== 'reestudio'`.
   - Busca en `Historico_Gestiones` del spreadsheet principal por col A (solicitudId) Y col AA (fechaFinGestion) vacía.
   - Fallback: busca en la hoja `solicitud` activa.
4. **Búsqueda de fila destino (RUTA B — reestudios):**
   - Se ejecuta si RUTA A no encontró nada O si `tipoSolicitudActual === 'reestudio'`.
   - Busca en `Historico_Gestiones` de ssReestudios por col B (solicitudId) Y col J (fechaFinGestion) vacía.
   - Igual que en `guardarGestionReestudio`, requiere que el caso esté abierto (fechaFin vacía) para evitar sobreescribir casos con el mismo solicitudId ya cerrados.
5. **Escritura en hoja central:** Se actualizan las columnas de estado (17), tracking (23), biometría (24), observaciones (25), fecha fin (29), SLA (30), motivos (32-33).
6. **Cálculo de SLA en horas hábiles:** Función `calcularMinutosHabilesSLA()` que excluye fines de semana y festivos, solo cuenta entre 8:00 y 18:00.
7. **Registro histórico:** Se copia la fila completa a la hoja `Historico_Gestiones`.
8. **Auto-asignación:** Si el estado es de cierre o aplazamiento, se dispara automáticamente `RequestLead()`.

### 4.4 Flujo de Gestión de una Solicitud — Reestudios (`guardarGestionReestudio` en `Reestudios.js`)

1. **Frontend (VistaUnificada.html → modal `#modalReestudio`):** El analista selecciona estado, motivo y observaciones. El `datos` enviado incluye `solicitudId` (número de caso).
2. **Búsqueda de la fila destino (búsqueda por ID, no por número de fila):**
   - **Primero busca en `Historico_Gestiones`** de ssReestudios: recorre cols B–J buscando la fila donde col B = `solicitudId` Y col J (fechaFinGestion) está vacía (caso abierto). Esto cubre todos los casos asignados normalmente (fueron movidos al asignar).
   - **Fallback:** Si no encuentra en Historico, usa `filaReal` como número de fila en ORIGEN (casos legacy asignados antes del movimiento automático).
3. **Validación:** Se verifica que la fila encontrada no tenga `fechaFinGestion` ya escrita (previene doble gestión).
4. **Escritura en la hoja correspondiente:** Cols J-N (fecha fin, estado, motivos, observaciones) + cols O-P (tiempos calculados).
5. **Auto-asignación:** Se llama a `RequestLeadReestudios()` (de `ModeloReestudios.js`) para asignar un nuevo caso.

**¿Por qué búsqueda por ID y no por número de fila?** El mismo número de solicitud puede entrar varias veces al sistema de reestudios (el cliente puede solicitar múltiples revisiones). `Historico_Gestiones` puede tener múltiples filas con el mismo solicitudId: la que tiene `fechaFinGestion` vacía es el caso activo actual; las demás son revisiones anteriores ya cerradas. La búsqueda solo hace match con `fechaFin === ''` para evitar sobreescribir gestiones antiguas.

### 4.5 Flujo de Sincronización de Nuevas Solicitudes (`actualizarSolicitudesNuevasAPI`)

1. **Validación horaria:** Solo se ejecuta entre las 8am y 6pm.
2. **Consulta a la API SAI:** Se obtienen solicitudes de los últimos 3 días con paginación (200 registros/página).
3. **Filtrado:** Se excluyen estados `RECHAZADO`, `APROBADO`, `CODEUDORES_REQUERIDOS` y tipos `AD`, `AC`. Solo se guardan solicitudes con `mainResultCode === "2"`.
4. **Homologación de clase:** Se mapean tipos de la API (`TS` → NUEVA, `RSD`/`RE`/`RC` → REESTUDIO, `IND` → INDUCCION). El tipo `AV` se excluye desde la ingesta (ver punto 3), no llega a homologarse.
5. **Deduplicación:** Se comparan contra IDs existentes en la hoja para evitar duplicados.
6. **Escritura en lote con bloqueo.**

### 4.6 Flujo de Biometría

1. **Descarga desde API:** `descargarBiometriasAPI()` busca solicitudes con `resultCode` 500 o 503.
2. **Auto-asignación al entrar:** `autoAsignarBiometria()` verifica en tiempo real si cada solicitud aún está pendiente. Respeta el cupo diario del equipo Biometría (`CUPOS_BIOMETRIA_BIOMETRIA`).
3. **Limpieza automática:** Si la solicitud ya no está pendiente, se elimina de la cola.
4. **Tipificación:** El analista guarda resultado. Al guardar, se reasigna automáticamente un nuevo caso (si hay cupo disponible).

### 4.7 Sistema de Medición de Tiempos

El sistema mide **tres** tipos de tiempo que reflejan diferentes perspectivas de rendimiento (desde v2.5 vía `MotorTiempos.js`):

| Métrica | Desde | Hasta | Mide | Unidad |
|---------|-------|-------|------|--------|
| **Tiempo Cola** | Radicación | Asignación al analista | Espera antes de atender | Minutos hábiles (horario equipo) |
| **Tiempo Gestión** | Asignación al analista | Resultado/cierre | Eficiencia individual del analista | Minutos hábiles (horario turno analista) |
| **Tiempo General** | Radicación | Resultado/cierre | Nivel de servicio al cliente | cola + gestión |

**Motor unificado (`MotorTiempos.js` — `calcularTiemposCaso`):**

```javascript
const tiempos = calcularTiemposCaso(tRadicacion, tAsignacion, tResultado, emailAnalista);
// → { minutos_cola, minutos_gestion, minutos_general }
```

- **Horario del equipo** (`_horarioEquipo`): Unión de todos los turnos activos en la hoja `Turnos`. Excluye festivos.
- **Horario del analista** (`_horarioAnalista`): Turno asignado al analista en `Analistas_Turnos` para la fecha del cálculo. Se añaden las `Horas_Extra` del día.
- Si no hay `tAsignacion`: cola = radicación → resultado con horario equipo; gestión = 0.
- Si no hay `tRadicacion`: cola = 0; gestión = asignación → resultado con horario analista.

**Columnas en hoja `solicitud` (por `guardarCambiosInternos`):**

| Col | Índice | Valor guardado |
|-----|--------|----------------|
| AI | 34 | `minutos_gestion` |
| AJ | 35 | Canal |
| AK | 36 | `minutos_general` |

> `calcularMinutosHabilesSLA()` (función heredada en `Código.js`) sigue disponible para compatibilidad pero `MotorTiempos.js` es el motor activo.

**Dónde se exponen estos tiempos:**

1. **Panel de Seguimiento de Analistas** — columnas "Prom. Gestión" y "Prom. General" por analista
2. **Modal Detalle del Analista** — columnas "T. Gestión" y "T. General" por solicitud
3. **Tarjetas KPI de Métricas** — "Tiempo Gestión" (promedio global) y "Tiempo General" (promedio global)
4. **Tabla Rendimiento Individual** — columnas "T. Gestión" y "T. General" por analista en el período

### 4.8 Panel de Métricas del Equipo (`obtenerDatosMetricas`)

Función backend que consolida KPIs de ambas hojas (solicitudes + reestudios/UAR) para un rango de fechas:

**KPIs calculados:**

| KPI | Fuente | Descripción |
|-----|--------|-------------|
| Total Gestionadas | Ambas hojas | Solicitudes cerradas en el período |
| Tiempo Gestión (promedio) | Col AI solicitudes + Col P reestudios | Promedio de minutos asignación → cierre |
| Tiempo General (promedio) | Col AK solicitudes + Col O reestudios | Promedio de horas hábiles radicación → cierre |
| Tasa Aprobación | Ambas hojas | % de solicitudes con estado APROBADO |
| Fuera de SLA | Col AD solicitudes | Solicitudes con > 4 horas hábiles de gestión |

**Gráficos disponibles (con data labels):**

| Gráfico | Tipo | Datos |
|---------|------|-------|
| Producción Diaria | Línea con área | Cantidad de solicitudes cerradas por día |
| Distribución por Estado | Donut | Aprobadas / Negadas / Aplazadas con porcentaje |
| Productividad por Analista | Barras horizontales | Top 10 analistas por volumen |
| Cumplimiento SLA | Barras agrupadas | Dentro de SLA vs Fuera de SLA por día |

**Filtros disponibles:**
- Rango de fechas libre (desde/hasta)
- Atajos: Hoy, Última semana, Último mes

### 4.9 Seguimiento de Analistas con Filtro de Fecha

El panel "Seguimiento de Analistas" permite consultar la actividad por fecha (predeterminado: hoy).

**Comportamiento según la fecha seleccionada:**

| Fecha | Columna "Gestionadas" | Columna "Pendientes/Asignadas" | Último Resultado |
|-------|----------------------|-------------------------------|-----------------|
| **Hoy** | Solicitudes cerradas hoy | Pendientes actuales (asignadas sin resultado) | Con tiempo transcurrido (verde/amarillo/rojo) |
| **Fecha pasada** | Solicitudes cerradas ese día | Asignadas ese día | Solo hora (sin tiempo transcurrido) |

**Modal de detalle por analista:** También respeta la fecha seleccionada, mostrando gestionadas y pendientes/asignadas según el contexto temporal.

### 4.10 Sistema de Cupos por Equipo

El sistema de cupos define **límites diarios de asignación por equipo y subcategoría**. Permite control granular tanto a nivel de equipo (global) como a nivel de analista individual.

**Equipos definidos (dinámicos, hoja `Equipos`):**

| Equipo | Motor de Asignación | Propiedad Prefijo |
|--------|--------------------|--------------------|
| DIGITAL | `RequestLeadUnificado()` en `MotorAsignacion.js` | `CUPOS_DIGITAL_*` |
| CANONES_ALTOS | `RequestLeadUnificado()` en `MotorAsignacion.js` | `CUPOS_CANONES_ALTOS_*` |
| REESTUDIOS | `RequestLeadUnificado()` en `MotorAsignacion.js` | `CUPOS_REESTUDIOS_*` |
| UAR | `RequestLeadUnificado()` en `MotorAsignacion.js` | `CUPOS_UAR_*` |
| DESAPLAZAMIENTO | `autoAsignarBiometria()` en `Biometria.js` | `CUPOS_DESAPLAZAMIENTO_*` |

**Propiedades almacenadas (ScriptProperties) — Cupos Globales:**

Cada equipo tiene 8 propiedades. Los sufijos usan nombres legacy mapeados por `_propKeyCupo()`:

```
CUPOS_{EQUIPO}_TOTAL              → Tope máximo del equipo
CUPOS_{EQUIPO}_DIGITAL            → Cupo para solicitudes digitales (legacy: NUEVAS)
CUPOS_{EQUIPO}_REESTUDIOS         → Cupo para reestudios
CUPOS_{EQUIPO}_INDUCCIONES        → Cupo para inducciones
CUPOS_{EQUIPO}_DESAPLAZAMIENTO    → Cupo para desplazamientos (legacy: BIOMETRIA)
CUPOS_{EQUIPO}_NUEVA_UAR          → Cupo para Nueva UAR
CUPOS_{EQUIPO}_DEUDOR_UAR         → Cupo para Deudor UAR
CUPOS_{EQUIPO}_BIOMETRIA_FALLIDA  → Cupo para biometría fallida
```

**Mapeo tipo catálogo → sufijo ScriptProperty (`_propKeyCupo`):**

| ID catálogo (singular) | Sufijo property (legacy) |
|------------------------|-------------------------|
| `digital` | `DIGITAL` |
| `induccion` | `INDUCCIONES` |
| `reestudio` | `REESTUDIOS` |
| `desaplazamiento` | `DESAPLAZAMIENTO` |
| `nuevaUar` | `NUEVA_UAR` |
| `deudorUar` | `DEUDOR_UAR` |
| `biometriaFallida` | `BIOMETRIA_FALLIDA` |

**Cupos Individuales (por analista):**

Se almacenan como JSON en la columna Y (index 24) de la hoja `Usuarios`. Usan los IDs del catálogo dinámico (singular):

```json
{"total":12,"digital":8,"reestudio":2,"induccion":1,"desaplazamiento":0,"nuevaUar":1,"deudorUar":1,"biometriaFallida":0,"fijo":false}
```

`obtenerCuposEfectivos()` acepta tanto las claves nuevas (singular) como las antiguas (plural) para retrocompatibilidad. Si un analista tiene cupos individuales, estos prevalecen sobre los globales del equipo.

**Función compartida `obtenerCuposEfectivos()` (Código.js):**

Todos los motores de asignación llaman esta función que:
1. Busca cupos individuales del analista en col Y de la hoja Usuarios
2. Si existen y son JSON válido → los usa
3. Si no → usa los cupos globales del equipo desde ScriptProperties

**Valores por defecto (globales):**

| Propiedad | Digital | Biometría | Reestudios |
|-----------|---------|-----------|------------|
| TOTAL | 90 | 10 | 15 |
| NUEVAS | 70 | 0 | 0 |
| REESTUDIOS | 10 | 0 | 10 |
| INDUCCIONES | 8 | 0 | 2 |
| BIOMETRIA | 0 | 8 | 0 |
| NUEVA_UAR | 2 | 0 | 3 |
| DEUDOR_UAR | 2 | 0 | 2 |

**UI — Sección Cupos (VistaAdmin.html):**

Accesible desde el sidebar del panel de administración. Tiene 2 modos:

**Modo General (por equipo):**
- 3 cards (Digital, Biometría, Reestudios) con:
  - Campo "Total Cupos": al modificarlo, sugiere distribución proporcional automática
  - 5 subcategorías editables manualmente
  - Barra de progreso + badge con retroalimentación:
    - `✓ 90 / 90` (verde): distribución exacta → permite guardar
    - `Faltan 5 → 85 / 90` (color equipo): cupos sin asignar → **bloquea guardado**
    - `⚠️ Sobran 3 → 93 / 90` (rojo): excedido → **bloquea guardado**
- Solo permite guardar si suma = total en los 3 equipos

**Modo Por Analista (individual):**
- Buscador por nombre con resultados en vivo
- Al seleccionar un analista muestra: nombre, correo, equipo
- Toggle "Usar cupos personalizados":
  - Apagado: usa cupos globales del equipo
  - Encendido: muestra los mismos campos (total + 5 subcategorías) con la misma validación
- Botón "Usar globales" para eliminar cupos personalizados

**Cómo afectan la asignación:**

- **Todos los equipos (`RequestLeadUnificado`):** Llama `obtenerCuposEfectivos(email, equipoId, dataUsuarios)`. Si el cupo de un tipo está lleno, salta casos de ese tipo.
- **Desaplazamiento (`autoAsignarBiometria`):** Llama `obtenerCuposEfectivos(email, 'DESAPLAZAMIENTO', dataUsuarios)`. Limita al cupo de desplazamiento del día.

**Competencia entre equipos:** Los equipos Digital y Reestudios pueden asignar casos de la misma hoja ORIGEN. El control de concurrencia (`LockService`) evita duplicados, y los cupos determinan cuántos casos absorbe cada equipo por día.

**Histórico de cupos (hoja `historico_cupos`):**

Cada cambio de cupos (global o individual) se registra automáticamente. Las columnas de tipos se generan dinámicamente desde el catálogo `_getTiposParaCupos()`:

| Columna | Campo |
|---------|-------|
| A | Fecha/hora del cambio |
| B | Tipo (`GENERAL`, `INDIVIDUAL`, `INDIVIDUAL_RESET`) |
| C | Equipo/Especialidad |
| D | Email del analista (vacío si es general) |
| E | Nombre del analista (vacío si es general) |
| F | Total |
| G+ | Una columna por cada tipo activo del catálogo (orden según `_getTiposParaCupos`) |
| Última | Email del admin que hizo el cambio |

**Backend (Admin.js):**

- `admin_getCuotasGlobales()` → Retorna cupos globales de los 3 equipos
- `admin_setCuotasGlobales(cupos)` → Guarda globales + registra en histórico
- `admin_buscarAnalistasCupos(termino)` → Busca analistas por nombre (max 10 resultados)
- `admin_getCuposIndividual(correo)` → Retorna cupos individuales o null
- `admin_setCuposIndividual(correo, cupos)` → Guarda/elimina cupos individuales + registra en histórico
- `registrarHistoricoCupos_()` → Función interna que escribe en la hoja `historico_cupos`

### 4.11 Panel de Novedades del Equipo

Sección del panel de administración que muestra en tiempo real los estados y novedades reportados por todos los analistas durante el día.

**Acceso:** Sidebar → "Novedades"

**Backend (`admin_obtenerNovedades` en Admin.js):**
- Lee la hoja `Usuarios`, parsea el JSON de historial diario (col L, index 11)
- Retorna solo analistas con actividad del día (excluye inactivos sin historial)
- Cada registro incluye: nombre, correo, especialidad, estado actual, y array de historial

**UI (VistaAdmin.html):**

Sección "Novedades" con dos tabs:

1. **Disponibilidad del Equipo:** Tabla DataTable con Analista, Equipo, Estado Actual, Historial del Día. El historial se muestra como timeline de badges con hora de inicio, nombre del estado, duración en minutos y un indicador verde pulsante si está "EN CURSO". Incluye filtros de fecha, turno y botón de refresh.
2. **Solicitudes de Permisos:** Tabla de solicitudes con estado PENDIENTE/APROBADO/RECHAZADO. Permite aprobar/rechazar directamente. El sidebar muestra un badge naranja con el número de permisos pendientes.

**Estructura del historial JSON (col L de Usuarios):**

```json
[
  { "estado": "ACTIVO", "inicio": "2026-06-12T08:00:00.000Z", "fin": "2026-06-12T10:15:00.000Z", "duracion_min": 135 },
  { "estado": "BREAK MAÑANA", "inicio": "2026-06-12T10:15:00.000Z", "fin": "2026-06-12T10:30:00.000Z", "duracion_min": 15 },
  { "estado": "ACTIVO", "inicio": "2026-06-12T10:30:00.000Z", "fin": "EN CURSO", "duracion_min": 0 }
]
```

**Categorías de estados disponibles:**
- Básicos: ACTIVO, INACTIVO, ALMUERZO, BREAK MAÑANA, BREAK TARDE, BAÑO
- Fallas técnicas: FALLA DE COMPUTADOR, FALLA DE DATACREDITO, FALLA DE INTERNET, etc.
- Ausencias: AUSENCIA JUSTIFICADA, CALAMIDAD, CITA MÉDICA, INCAPACIDAD, VACACIONES, etc.
- Reuniones: CAPACITACION, CURSOS XPLORA, REUNIÓN, EVENTO SEGUROS BOLÍVAR, etc.
- Operativas: ACTIVIDADES DE OFICINA, ANALISTA DESPLAZAMIENTO, etc.

### 4.12 Sistema de Turnos y Horarios

Permite al administrador definir horarios de trabajo (turnos) y asignarlos a analistas. El `MotorTiempos.js` los usa para calcular tiempos hábiles precisos por analista.

**Acceso:** Sidebar Admin → "Turnos"

**Hojas de datos (en `TARGET_SOLICITUDES_SS_ID`):**

| Hoja | Columnas | Propósito |
|------|----------|-----------|
| `Turnos` | A=ID_Turno, B=Nombre, C=Activo(bool), D-J=Lun-Dom(bool), K=HoraInicio, L=HoraFin | Catálogo de turnos |
| `Analistas_Turnos` | A=Email, B=ID_Turno, C=Fecha_Desde, D=Fecha_Hasta | Asignación de turnos a analistas con vigencia |
| `Horas_Extra` | A=Email, B=Fecha, C=HoraInicio, D=HoraFin, E=Descripcion | Horas fuera del turno regular |

**Funciones backend (Admin.js):**

| Función | Descripción |
|---------|-------------|
| `admin_getTurnosData()` | Retorna turnos activos y asignaciones de analistas |
| `admin_guardarTurno(turno)` | Crea o actualiza un turno |
| `admin_desactivarTurno(idTurno)` | Marca un turno como inactivo |
| `admin_asignarTurnoAnalista(email, idTurno, fechaDesde)` | Asigna turno a un analista desde una fecha |
| `admin_asignarTodosSinTurno(idTurno, fechaDesde)` | Asigna un turno a todos los analistas que no tienen uno |
| `admin_getHorasExtra(email, anio, mes)` | Retorna horas extra del analista para un mes |
| `admin_guardarHorasExtra(extra)` | Registra horas extra |
| `admin_eliminarHorasExtra(fila)` | Elimina una entrada de horas extra |
| `admin_getAlertasTurnos()` | Lista analistas activos sin turno asignado |

### 4.13 Sistema de Permisos e Incapacidades

Los analistas pueden solicitar permisos o registrar incapacidades directamente desde su vista. Los administradores los aprueban o rechazan desde el panel.

**Hoja:** `Permisos_Incapacidades` (se crea automáticamente en `TARGET_SOLICITUDES_SS_ID` si no existe)

| Col | Campo |
|-----|-------|
| A | ID (timestamp) |
| B | Email analista |
| C | Nombre analista |
| D | Tipo novedad |
| E | Fecha inicio |
| F | Fecha fin |
| G | Observación analista |
| H | Estado (PENDIENTE / APROBADO / RECHAZADO) |
| I | Observación admin |
| J | Email admin que resolvió |
| K | Fecha de resolución |

**Funciones para analistas (Código.js):**

| Función | Descripción |
|---------|-------------|
| `solicitarPermiso(tipoNovedad, fechaInicio, fechaFin, observacion)` | Crea solicitud con estado PENDIENTE. Notifica al admin vía Google Chat. |
| `verificarPermisoVigenteHoy()` | Retorna `true` si el analista tiene permiso APROBADO que cubre la fecha actual. |

**Funciones para admin (Admin.js):**

| Función | Descripción |
|---------|-------------|
| `admin_contarPermisosPendientes()` | Retorna conteo de permisos PENDIENTE (para badge en sidebar). |
| `admin_obtenerPermisosPendientes(filtroEstado)` | Lista permisos filtrados por estado. |
| `admin_resolverPermiso(id, decision, observacionAdmin)` | Aprueba o rechaza un permiso. |

**UI en VistaAdmin:** Sección "Novedades" tiene dos tabs: "Disponibilidad del Equipo" (historial de estados) y "Solicitudes de Permisos" (tabla de permisos con badge de pendientes en el sidebar).

---

## 5. ⏰ Automatizaciones y Procesos en Segundo Plano

### Triggers Identificados

| Función | Tipo Estimado | Frecuencia | Descripción |
|---------|--------------|-----------|-------------|
| `actualizarSolicitudesNuevasAPI()` | Trigger por tiempo | Cada X minutos (8am - 6pm) | Descarga nuevas solicitudes desde la API SAI |
| `descargarBiometriasAPI()` | Trigger por tiempo | Periódico | Descarga biometrías pendientes (resultCode 500/503) |
| `cicloPrimerContactoBiometria()` | Trigger por tiempo | Cada 1-2h (L-V 7:00-19:00, Sáb 8:00-15:00) | Envía WhatsApp a pendientes de biometría que cumplieron ventana de 4h desde `fechaResultado` de SAI y siguen en `APROBADO_PENDIENTE_BIOMETRIA` |
| `cicloBiometriaPendiente()` | Trigger por tiempo | 8am y 12pm | **Corte principal de biometría:** 1) Limpia resueltas (consulta SAI), 2) Archiva vencidas por `fechaResultado` de SAI, 3) Escala a cola de llamada los que ya tuvieron WA y siguen pendientes |
| `trigger_recalcularContadores()` | Trigger por tiempo | Nocturno (1x/día) | Reconstruye contadores incrementales de cupo/carga desde las hojas reales |
| `trigger_importarFestivosColombiaAnual()` | Trigger mensual | Mensual (solo actúa en diciembre) | Importa festivos del año siguiente desde Google Calendar |

### Ciclo de Vida de una Biometría Pendiente

```
SAI reporta APROBADO_PENDIENTE_BIOMETRIA (resultCode 500/503)
    │
    ▼
[pendiente_biometria] fase="" (recién ingresada)
    │
    │ cicloPrimerContactoBiometria (cada 1-2h)
    │ Condición: fechaResultado SAI > 4h atrás Y sigue pendiente
    ▼
[pendiente_biometria] fase="WA_ENVIADO" → WhatsApp al cliente
    │
    │ cicloBiometriaPendiente (8am / 12pm)
    │ _procesarCortePendientes: SAI confirma que sigue pendiente
    ▼
[solicitud] estado="APROBADO_PENDIENTE_BIOMETRIA" → cola de llamada
[pendiente_biometria] fase="ESCALADA"
    │
    │ Analista de desaplazamiento toma el caso (RequestLeadUnificado)
    │ O bien: cicloBiometriaPendiente archiva si venció la ventana
    ▼
[Asignado] o [Archivado]
```

**Criterio de archivado (`_archivarColaBiometriaVencida`):**
Se archivan las solicitudes en cola de llamada cuya `fechaResultado` de SAI (col S de la hoja `solicitud`) sea anterior al umbral del corte:
- **Corte 8am** (hora < 9): umbral = ayer a las 12:00pm
- **Corte 12pm** (hora >= 9): umbral = hoy a las 00:00

Esto da una ventana de ~12h para que un analista tome el caso. `limpiarBiometriasResueltas()` refresca la `fechaResultado` contra SAI justo antes del archivado en el mismo ciclo, asegurando que siempre sea el dato más reciente del API.

### Validaciones en Background

- **Horario de operación:** `actualizarSolicitudesNuevasAPI()` no se ejecuta fuera del rango 8:00 - 18:00.
- **Ley 2300:** `cicloPrimerContactoBiometria()` solo envía WhatsApp dentro del horario legal (L-V 7:00-19:00, Sáb 8:00-15:00, no domingos/festivos).
- **Días no hábiles:** `cicloBiometriaPendiente()` no archiva ni escala en domingos/festivos (nadie está llamando).
- **Timeout de ejecución:** `descargarBiometriasAPI()` incluye un límite de 5 minutos.
- **Anti rate-limiting:** Pausas de 1-2 segundos entre consultas individuales a SAI.
- **Control de duplicados:** Se verifican IDs existentes antes de insertar.

---

## 6. 📬 Sistema de Alertas y Notificaciones

### Notificaciones en Pantalla (Frontend)

El sistema usa **SweetAlert2** para notificar al usuario en tiempo real:

| Evento | Tipo | Mensaje |
|--------|------|---------|
| Nueva asignación automática | Toast (top-end) | "Se te ha asignado un nuevo registro" / "Se te asignaron X caso(s)" |
| Gestión guardada exitosamente | Modal success | "¡Operación Exitosa!" + detalle |
| Error de conexión | Modal error | "Error de Conexión" |
| Validación incompleta | Modal warning | "Completa todos los campos obligatorios" |
| Cambio de estado | Toast | "Estado: ACTIVO" / "Estado: ALMUERZO" etc. |

---

## 7. 🔧 Guía de Mantenimiento y Configuración

### Variables de Entorno (Script Properties)

| Propiedad | Descripción | Ejemplo |
|-----------|-------------|---------|
| `KeyEndPointSaiFullProd` | API Key para autenticación contra la API SAI | `abc123-xyz...` |
| `endPointSaiFullStageProd` | Endpoint base para consulta individual | `https://api.sai.co/v1/request/` |
| `endpointSaiNewApi` | Endpoint para consulta por consecutivo | `https://api.sai.co/v2/solicitud/` |
| `endPointSaiNewApiDate` | Endpoint para consulta masiva por rango de fecha | `https://api.sai.co/v2/requests` |
| `GLOBAL_PRIORIDAD` | Orden de prioridad de asignación | `NUEVAS_PRIMERO` |
| `ORDEN_DESAPLAZAMIENTO` | Dentro de la cola de desaplazamiento/biometría, quién se asigna primero según `fechaResultado`: `RECIENTE_PRIMERO` (LIFO, default) o `ANTIGUO_PRIMERO` (FIFO). Configurable por el admin (`admin_setOrdenDesaplazamiento`), aplica a `RequestLeadUnificado` y `autoAsignarBiometria` | `RECIENTE_PRIMERO` |
| `PUNTERO_ROTACION` | Índice actual de rotación de categorías | `0` |
| `VIP_COUNT_{email}` | Contador de VIPs consecutivas por analista | `1` |
| `CUPOS_{EQUIPO}_TOTAL` | Tope total de cupos diarios del equipo | `90` |
| `CUPOS_{EQUIPO}_NUEVAS` | Cupo diario de nuevas para el equipo | `70` |
| `CUPOS_{EQUIPO}_REESTUDIOS` | Cupo diario de reestudios para el equipo | `10` |
| `CUPOS_{EQUIPO}_INDUCCIONES` | Cupo diario de inducciones para el equipo | `8` |
| `CUPOS_{EQUIPO}_BIOMETRIA` | Cupo diario de biometría para el equipo | `0` |
| `CUPOS_{EQUIPO}_NUEVA_UAR` | Cupo diario de Nueva UAR (CORREO + tipoProceso NUEVA) | `2` |
| `CUPOS_{EQUIPO}_DEUDOR_UAR` | Cupo diario de Deudor UAR (CORREO + tipoProceso ADICIONAL) | `2` |

### IDs de Hojas de Cálculo

| Constante | Propósito |
|-----------|-----------|
| `WAREHOUSE_ID` = `1V2GTI4IOPUEsC67SPIGey3LM3OxFCt-8HlFbX95R_fs` | Warehouse de pólizas |
| `TARGET_SOLICITUDES_SS_ID` = `1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0` | BD central de solicitudes y usuarios |
| `ID_SHEET_ORIGEN` = `1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME` | Origen de biometrías |
| `ID_SHEET_GESTION` = `1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ` | Gestión de biometrías |
| `ID_HOJA_REESTUDIOS` = `1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U` | Hoja consolidada de reestudios (Victoria + Correo) |

### Estructura de la Hoja `Usuarios`

| Columna | Índice | Contenido |
|---------|--------|-----------|
| A | 0 | Número de asesor |
| B | 1 | Nombre comercial |
| C | 2 | Correo electrónico |
| D | 3 | Documento de identidad |
| E | 4 | Especialidad (ESTUDIO DIGITAL, PENDIENTE_BIOMETRIA, REESTUDIOS) |
| F | 5 | Estado (ACTIVO, INACTIVO, ALMUERZO, BREAK MAÑANA, etc.) |
| G | 6 | Capacidad máxima |
| H | 7 | Pendientes actuales |
| L | 11 | Historial JSON de estados del día |
| X | 23 | Rol (ADMIN, ASESOR) |
| Y | 24 | Cupos individuales (JSON, opcional). Si tiene valor, prevalece sobre cupos globales del equipo |

### Estructura de la Hoja `solicitud` (Primeras 37 Columnas)

| Col | Índice | Campo |
|-----|--------|-------|
| A | 0 | Número de solicitud (ID único) |
| B | 1 | Número de póliza |
| C | 2 | Identificación del inquilino |
| D | 3 | Tipo de identificación |
| E | 4 | Nombre del inquilino |
| F | 5 | Correo del inquilino |
| G | 6 | Teléfono del inquilino |
| H | 7 | Ingresos |
| I | 8 | Fecha de expedición |
| J | 9 | Canon |
| K | 10 | Cuota |
| L | 11 | Dirección del inmueble |
| M | 12 | Destino del inmueble |
| N | 13 | Ciudad del inmueble |
| O | 14 | Nombre del asesor |
| P | 15 | Correo del asesor |
| Q | 16 | Estado general |
| R | 17 | Fecha de radicación |
| S | 18 | Fecha de resultado |
| T | 19 | Descripción del resultado |
| U | 20 | Clase (NUEVA, REESTUDIO, INDUCCION) |
| V | 21 | UAR (Si/No) |
| W | 22 | Tracking (historial de fechas) |
| X | 23 | Biometría |
| Y | 24 | Observaciones |
| Z | 25 | — |
| AA | 26 | Fecha de asignación |
| AB | 27 | Email del analista asignado |
| AC | 28 | Fecha fin de gestión |
| AD | 29 | Tiempo total de resolución (horas hábiles SLA, asignación → cierre) |
| AE | 30 | Nombre del analista |
| AF | 31 | Motivo de aplazamiento |
| AG | 32 | Motivo de negación |
| AH | 33 | Fecha de gestión (solo día dd/MM/yyyy) |
| AI | 34 | Tiempo de gestión (minutos brutos, asignación → cierre) |
| AJ | 35 | Canal |
| AK | 36 | Tiempo general — radicación (horas hábiles, radicación → cierre) |

### Estructura de la Hoja "ORIGEN" y `Historico_Gestiones` (Reestudios, ssReestudios) — 18 Columnas

> **Nota:** Estas dos hojas comparten el mismo esquema. Al asignar un caso, `ModeloReestudios.js` mueve la fila completa de ORIGEN a `Historico_Gestiones`. ORIGEN solo contiene casos sin asignar; `Historico_Gestiones` contiene todos los casos asignados (abiertos y cerrados).

| Col | Índice | Campo | Origen |
|-----|--------|-------|--------|
| A | 0 | fechaRadicacion | Ingesta automática |
| B | 1 | solicitud (ID) | Ingesta automática |
| C | 2 | linkDrive (URL carpeta) | Ingesta automática |
| D | 3 | origen (VICTORIA/CORREO) | Ingesta automática |
| E | 4 | tipoDeProceso | Ingesta automática |
| F | 5 | claseDeSolicitud | Ingesta automática |
| G | 6 | analistaAsignado (email) | Motor de asignación |
| H | 7 | nombreAnalista | Motor de asignación |
| I | 8 | fechaAsignacion | Motor de asignación |
| J | 9 | fechaFinGestion | Gestión del analista |
| K | 10 | estadoGestion | Gestión del analista |
| L | 11 | motivoAplazamiento | Gestión del analista |
| M | 12 | motivoNegacion | Gestión del analista |
| N | 13 | observaciones | Ingesta automática (nota del radicador, sobre todo en CORREO) al entrar; sobrescrita por el comentario de cierre del analista al gestionar |
| O | 14 | tiempoTotalResolucion (minutos, radicación → cierre) | Cálculo al guardar |
| P | 15 | tiempoGestion (minutos, asignación → cierre) | Cálculo al guardar |
| S | 18 | tipo (bucket de cupo, p.ej. `nuevaUar`/`reestudio`) | Motor de asignación — solo presente en `Historico_Gestiones`, `ORIGEN` no la tiene |
| T | 19 | marca de reasignación admin (`ADMIN:email\|fecha`) | `admin_reasignarSolicitud()` (Admin.js) — solo en `Historico_Gestiones`, nunca en `ORIGEN`. **No reutilizar esta columna.** |
| U | 20 | observacionesRadicador | Snapshot inmutable de la col N tomado antes de que la gestión del analista la sobrescriba — preserva la nota original del radicador. Ver `_asignarCasoReestudios` (MotorAsignacion.js) y `guardarGestionReestudio` (Reestudios.js) |

### Instrucciones de Despliegue

#### Requisitos Previos

1. Cuenta Google Workspace con permisos en el dominio.
2. Node.js instalado con `clasp` (`npm install -g @google/clasp`).
3. Acceso a las hojas de cálculo referenciadas.
4. API Key de la plataforma SAI.

#### Pasos para Despliegue

1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repo>
   cd asignacion-analisis
   ```

2. **Autenticarse con clasp:**
   ```bash
   clasp login
   ```

3. **Subir el código:**
   ```bash
   clasp push
   ```

4. **Configurar Script Properties** (desde el editor de Apps Script → Configuración del proyecto → Propiedades del script).

5. **Desplegar como Web App:**
   ```bash
   clasp deploy --description "v2.0"
   ```

6. **Configurar Triggers:**
   - `actualizarSolicitudesNuevasAPI` → Cada 5-10 minutos
   - `descargarBiometriasAPI` → Cada 10-15 minutos

#### Consideraciones de Producción

- El sistema usa `LockService` para concurrencia; en alta carga, los locks pueden expirar (timeout de 15-30 segundos).
- Google Apps Script tiene un límite de ejecución de **6 minutos** por función.
- El límite de llamadas a `UrlFetchApp` es de **20,000 por día** para cuentas Workspace.
- Las hojas de cálculo tienen un límite de **10 millones de celdas** por archivo.

---

## 8. 🎨 Mejoras UX/UI Implementadas

### 8.1 Remoción Optimista de Filas (`_quitarFilaTabla`)

Cada vista elimina inmediatamente la fila de "Mis Solicitudes Asignadas" al guardar una gestión, sin esperar que `cargarDatos()` recargue la tabla. Esto evita que el analista vuelva a abrir el mismo caso accidentalmente mientras espera la respuesta del servidor.

**Implementación por vista (difieren en el tipo de dato de la tabla):**

| Vista | Archivo | Cómo identifica la fila |
|-------|---------|------------------------|
| Todos los equipos | `main.js.html` | DataTable con arrays — compara `d[0]` o `d[6]` (solicitudId) |

**Patrón de uso:**
```javascript
function _quitarFilaTabla(solicitudId) {
  if (!$.fn.DataTable.isDataTable('#miTabla')) return;
  $('#miTabla').DataTable()
    .rows(function(i, d) { return String(d[0]) === String(solicitudId); })
    .remove().draw(false);
}
// Se llama en el successHandler del google.script.run, antes de cargarDatos()
```

### 8.2 Modal de Gestión de Reestudio (Vista Digital)

El modal `#modalReestudio` en `VistaUnificada.html` (antes `#modalReestudioDigital` en index.html) sigue el mismo diseño que los demás modales del sistema.

**Elementos del modal:**
- Header con gradiente (`modal-header-inner`), ícono `bi-layers`, badge de solicitud (`#rmd_header_sol`) y badge de tipo coloreado (`#rmd_tipo_badge`)
- Botón "Ver Anexo" (`#btnDriveRmd`) — aparece solo si hay `linkDrive` disponible
- 4 tarjetas de información: Solicitud, Origen, Fecha Radicación, Fecha Asignación
- Formulario: campo Póliza, selector de Estado (APROBADA/APLAZADA/NEGADA), contenedores condicionales de Motivo (MotivoPicker), campo Observaciones
- Footer: botón Cancelar + botón Guardar

**Datos mostrados (disponibles desde la hoja de reestudios):**
- `fila[1]` = solicitud, `fila[2]` = linkDrive, `fila[3]` = origen, `fila[17]` = fechaRadicacion, `fila[26]` = fechaAsignacion, `fila[20]` = tipoDeProceso (para colorear badge)

**Colores del badge por tipo:**
- `NUEVA UAR` → rosa (`#be185d` / `#fce7f3`)
- `DEUDOR UAR` → rojo (`#b91c1c` / `#fee2e2`)
- Otros → púrpura (`#7c3aed` / `#ede9fe`)

**Envío al backend:** `guardarCambiosInternos(datos)` con `tipoSolicitudActual: 'reestudio'` para que RUTA A se salte y RUTA B maneje el guardado en ssReestudios.

### 8.3 Ordenamiento Alfabético de Motivos

Todos los `<select>` de Motivo Aplazamiento y Motivo Negación están ordenados alfabéticamente A→Z en las 3 vistas:

| Vista | Selects afectados |
|-------|-----------------|
| ~~`index.html`~~ *(eliminada)* | Motivos migrados a `VistaUnificada.html` con carga dinámica |
| `VistaUnificada.html` | `#dig_motivo_aplazamiento`, `#dig_motivo_negacion`, `#rst_motivo_aplazamiento`, `#rst_motivo_negacion` (cargados dinámicamente) |

### 8.4 Validación de Fecha Futura

En `VistaUnificada.html` / `main.js.html`, la función `_validarFechaSaiAnteDeGuardar()` valida que el campo "Fecha y Hora de Radicación SAI" no sea futura ni tenga formato inválido al momento de guardar. Si falla, muestra un Swal warning y detiene el guardado.

---

## 9. 📝 Pendientes y Consideraciones Futuras

| Item | Estado | Descripción |
|------|--------|-------------|
| Carpetas Drive unificadas | En progreso | Sistema de carpetas por solicitud (`SOL-{nro}`) en unidad compartida para centralizar documentos |
| Notificaciones Google Chat (reestudios) | Pendiente | Evaluar si se necesita notificación al chat al asignar reestudios |
| Reasignación desde Admin | ✅ Completado | El admin puede desasignar casos de reestudios desde el panel de monitoreo (botón "Quitar" con `desasignarSolicitudReestudio()`) |
| Sistema de cupos por equipo | ✅ Completado | Cupos diarios configurables por equipo (Digital, Biometría, Reestudios) con distribución por subcategoría, cupos individuales por analista, histórico de cambios, y validación estricta (suma = total). UAR dividido en `nuevaUar` y `deudorUar`. |
| Modal reestudio vista digital | ✅ Completado | Modal `#modalReestudio` en VistaUnificada.html. |
| Visibilidad de casos asignados en Reestudios | ✅ Completado | `getReestudiosData()` lee de `Historico_Gestiones` de ssReestudios. |
| Guardado correcto de gestión de reestudio | ✅ Completado | `guardarCambiosInternos()` usa discriminador `tipoSolicitudActual`; `guardarGestionReestudio()` busca por solicitudId + caso abierto. |
| Remoción inmediata de filas tras gestión | ✅ Completado | `_quitarFilaTabla()` elimina la fila del DataTable al instante en todas las vistas. |
| Ordenamiento alfabético de motivos | ✅ Completado | Todos los selects de Motivo Aplazamiento/Negación están ordenados A→Z. |
| Validación fecha futura en Radicación SAI | ✅ Completado | `_validarFechaSaiAnteDeGuardar()` bloquea el guardado si la fecha SAI es futura o tiene formato inválido. |
| Motor de tiempos por turno | ✅ Completado | `MotorTiempos.js` con `calcularTiemposCaso()` reemplaza `calcularMinutosHabilesSLA()`. Calcula cola, gestión y general según horario real del analista (turnos + horas extra). |
| Sistema de Turnos y Horarios | ✅ Completado | Admin puede crear turnos, asignarlos a analistas con vigencia, registrar horas extra y ver alertas de analistas sin turno. Nueva sección "Turnos" en VistaAdmin. |
| Sistema de Permisos e Incapacidades | ✅ Completado | Analistas solicitan permisos desde su vista; admin los aprueba/rechaza en Novedades → tab Solicitudes de Permisos. Badge naranja en sidebar indica pendientes. |
| RequestLead multi-equipo | ✅ Completado | `RequestLead()` detecta automáticamente el equipo del analista (DIGITAL/REESTUDIOS/BIOMETRIA) sin requerir especialidad "ESTUDIO DIGITAL" explícita. |
| Historico_Gestiones para solicitudes digitales | ✅ Completado | `getTableData()` ahora lee desde `Historico_Gestiones` de la hoja principal (mismo patrón que reestudios). Fallback a hoja `solicitud` para legados. |

---

> 📅 **Última actualización:** Junio 2026  
> 🔄 **Versión:** 2.5  
> 📝 **Mantenedor:** Equipo de Desarrollo - El Libertador
