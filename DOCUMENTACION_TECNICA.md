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
│       ├── ASESOR                                             │
│       │    ├── PENDIENTE_BIOMETRIA ──► VistaBiometria.html   │
│       │    ├── REESTUDIOS ───────────► VistaReestudios.html  │
│       │    └── ESTUDIO DIGITAL ──────► index.html            │
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
| `Código.js` | **Núcleo del sistema.** Enrutador `doGet()`, autenticación, constantes globales, carga de datos de tabla, consulta a API SAI, función `guardarCambiosInternos()`, gestión de estados del analista, cálculo de SLA en minutos hábiles, sincronización de API para nuevas solicitudes. |
| `ModeloAsignación.js` | **Motor de asignación inteligente (Estudio Digital).** Algoritmo `RequestLead()` que distribuye solicitudes de la API según prioridad (VIP, rotación por categorías de inmobiliaria), capacidad del analista y orden configurable globalmente. |
| `Admin.js` | **Panel de administración.** CRUD de usuarios, dashboard de KPIs, control de prioridad global, botón de pánico para desactivar todos los asesores, desasignación de solicitudes y limpieza de duplicados. |
| `Biometria.js` | **Módulo de biometría.** Descarga desde API de solicitudes con códigos 500/503, asignación automática a analistas de biometría, verificación de estado en tiempo real, gestión y tipificación de casos. |
| `ModeloReestudios.js` | **Motor de asignación equitativa (Reestudios).** Algoritmo `RequestLeadReestudios()` que distribuye solicitudes de Victoria y Correo según orden FIFO, capacidad del analista y exclusión de tipos UAR. Asigna 1 caso por invocación con control de concurrencia. |
| `Reestudios.js` | **Módulo de gestión de reestudios.** Obtención de datos asignados (`getReestudiosData()`), guardado de gestión (`guardarGestionReestudio()`) con auto-reasignación vía `ModeloReestudios.js`, y utilidades de sesión. |
| `index.html` | **Vista del Asesor (Estudio Digital).** Tabla de solicitudes asignadas, modal de gestión con detalle en tiempo real desde la API, selector de estados, métricas personales, control de estado del analista. |
| `VistaAdmin.html` | **Vista del Administrador.** Dashboard con métricas, tabla de usuarios, control segmentado de prioridades, modales CRUD, botón de emergencia. |
| `VistaBiometria.html` | **Vista de Biometría.** Tabla de solicitudes pendientes de biometría, modal de tipificación con tabs (formulario + historial de deudores). |
| `VistaReestudios.html` | **Vista de Reestudios.** Tabla unificada de casos asignados (Victoria + Correo), modal de gestión con estados, motivos y observaciones, métricas, control de estado del analista, auto-asignación al entrar. |
| `main.js.html` | **JavaScript compartido del Asesor.** Lógica de renderizado de tabla con DataTables, auto-asignación al entrar, manejo de estados, guardado de gestiones, comunicación con backend. |
| `appsscript.json` | **Manifiesto del proyecto.** Configuración de zona horaria, runtime V8, despliegue como Web App con ejecución como usuario desplegador y acceso por dominio. |
| `.clasp.json` | **Configuración de clasp.** Vinculación con el proyecto de Google Apps Script para push/pull del código fuente. |

### Archivos Eliminados (v2)

| Archivo | Razón |
|---------|-------|
| `Uar.js` | Módulo UAR eliminado. Las solicitudes UAR que vienen de Victoria/Correo ahora se gestionan desde el módulo de Reestudios. Las UAR de la API se gestionan por el modelo principal. |
| `VistaUar.html` | Vista UAR eliminada. Ya no existe como especialidad independiente. |

### Gestión de Datos

El sistema utiliza **Google Sheets como base de datos relacional distribuida**, accediendo a múltiples Spreadsheets por su ID:

| ID Variable | Hoja(s) Clave | Propósito |
|-------------|---------------|-----------|
| `TARGET_SOLICITUDES_SS_ID` | `solicitud`, `Usuarios`, `score`, `Historico_Gestiones`, `Historico_Estados`, `Festivos` | Base central de solicitudes, usuarios y scoring |
| `WAREHOUSE_ID` | `Hoja 1` | Warehouse de pólizas |
| `ID_SHEET_ORIGEN` (Biometría) | `Hoja 2` | Cola de biometrías pendientes descargadas de la API |
| `ID_SHEET_GESTION` (Biometría) | `Hoja 1` | Registro de biometrías asignadas y gestionadas |
| `ID_HOJA_REESTUDIOS` | `ORIGEN` | Hoja consolidada de solicitudes de reestudios y UAR (Victoria + Correo) para asignación equitativa |

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
| **ADMIN** | Col X (índice 23) | Panel completo | Dashboard, CRUD usuarios, prioridades, pánico global, desasignación |
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

### 4.1 Flujo de Asignación Inteligente — Estudio Digital (`RequestLead`)

Este es el motor principal para solicitudes que vienen de la API SAI.

**Paso a paso:**

1. **Bloqueo de concurrencia:** Se adquiere un `ScriptLock` para evitar asignaciones duplicadas.
2. **Validación del usuario:** Se verifica que el analista esté ACTIVO, con especialidad "ESTUDIO DIGITAL" y con capacidad disponible.
3. **Cálculo de capacidad real:**
   ```javascript
   capacidadDisponible = capTotal - capPendienteReal
   ```
4. **Clasificación de solicitudes:** Se categorizan las pólizas en buckets (VIP, grande, mediana, pequeña, genérica, en desarrollo, revisar, otros) usando la hoja `score`.
5. **Priorización configurable:** Se respeta el orden global definido por el admin:
   - `NUEVAS_PRIMERO` → nueva > biometría > inducción
   - `BIOMETRIA_PRIMERO` → biometría > nueva > inducción
   - `INDUCCION_PRIMERO` → inducción > nueva > biometría
6. **Rotación de categorías:** Se alterna entre VIP y el resto con un máximo de 2 VIP consecutivas.
7. **Escritura en hoja:** Se registra la fecha de asignación, el email del analista y su nombre.

### 4.2 Flujo de Asignación Equitativa — Reestudios (`RequestLeadReestudios` en `ModeloReestudios.js`)

Motor de asignación para solicitudes de Victoria y Correo. Opera sobre la hoja "ORIGEN" del spreadsheet `ID_HOJA_REESTUDIOS`.

**Paso a paso:**

1. **Bloqueo de concurrencia:** `LockService.getScriptLock()` con timeout de 15s.
2. **Validación del usuario:**
   - ¿Registrado en hoja Usuarios? ✓
   - ¿Especialidad incluye "REESTUDIOS"? ✓
   - ¿Estado = "ACTIVO"? ✓
   - ¿Capacidad > 0? ✓
3. **Cálculo de carga actual:** Cuenta filas donde columna G = email del analista Y columna J vacía (sin gestionar).
4. **Cupo disponible:** `capacidad - cargaActual`. Si <= 0 → "Capacidad llena".
5. **Búsqueda de caso disponible:** Recorre la hoja buscando la primera fila que cumpla:
   - Columna G vacía (sin asignar)
   - Columna B no vacía (tiene nro solicitud)
   - NO es "NUEVA UAR" ni "DEUDOR UAR" (excluidos por tipo/clase)
6. **Asignación (máximo 1 por llamada):** Escribe en la fila:
   - Col G: email del analista
   - Col H: nombre del analista
   - Col I: fecha/hora actual
7. **Retorna resultado.**

**Cuándo se ejecuta:**
- Al entrar el analista a la vista (si no tiene pendientes y está ACTIVO)
- Al guardar una gestión (se intenta asignar un nuevo caso automáticamente)

**Estructura de la hoja "ORIGEN":**

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
| J(10) | fechaFinGestion | Vista (al guardar) |
| K(11) | estadoGestion | Vista (al guardar) |
| L(12) | motivoAplazamiento | Vista (al guardar) |
| M(13) | motivoNegacion | Vista (al guardar) |
| N(14) | observaciones | Vista (al guardar) |

### 4.3 Flujo de Gestión de una Solicitud — Estudio Digital (`guardarCambiosInternos`)

1. **Frontend (index.html):** El analista abre un modal, selecciona estado, biometría, comentarios y motivos.
2. **Validación:** Se verifica que los motivos correspondan al estado seleccionado.
3. **Escritura en hoja central:** Se actualizan las columnas de estado (17), tracking (23), biometría (24), observaciones (25), fecha fin (29), SLA (30), motivos (32-33).
4. **Cálculo de SLA en horas hábiles:** Función `calcularMinutosHabilesSLA()` que excluye fines de semana y festivos, solo cuenta entre 8:00 y 18:00.
5. **Registro histórico:** Se copia la fila completa a la hoja `Historico_Gestiones`.
6. **Auto-asignación:** Si el estado es de cierre o aplazamiento, se dispara automáticamente `RequestLead()`.

### 4.4 Flujo de Gestión de una Solicitud — Reestudios (`guardarGestionReestudio` en `Reestudios.js`)

1. **Frontend (VistaReestudios.html):** El analista selecciona estado, motivo y observaciones.
2. **Validación:** Se verifica que la fila no haya sido gestionada previamente.
3. **Escritura en hoja "ORIGEN":** Se escriben columnas J-N (fecha fin, estado, motivos, observaciones).
4. **Auto-asignación:** Se llama a `RequestLeadReestudios()` (de `ModeloReestudios.js`) para asignar un nuevo caso.

### 4.5 Flujo de Sincronización de Nuevas Solicitudes (`actualizarSolicitudesNuevasAPI`)

1. **Validación horaria:** Solo se ejecuta entre las 8am y 6pm.
2. **Consulta a la API SAI:** Se obtienen solicitudes de los últimos 3 días con paginación (200 registros/página).
3. **Filtrado:** Se excluyen estados `RECHAZADO`, `APROBADO`, `CODEUDORES_REQUERIDOS` y tipos `AD`, `AC`. Solo se guardan solicitudes con `mainResultCode === "2"`.
4. **Homologación de clase:** Se mapean tipos de la API (`TS` → NUEVA, `RSD`/`RE`/`RC` → REESTUDIO, `IND` → INDUCCION).
5. **Deduplicación:** Se comparan contra IDs existentes en la hoja para evitar duplicados.
6. **Escritura en lote con bloqueo.**

### 4.6 Flujo de Biometría

1. **Descarga desde API:** `descargarBiometriasAPI()` busca solicitudes con `resultCode` 500 o 503.
2. **Auto-asignación al entrar:** `autoAsignarBiometria()` verifica en tiempo real si cada solicitud aún está pendiente.
3. **Limpieza automática:** Si la solicitud ya no está pendiente, se elimina de la cola.
4. **Tipificación:** El analista guarda resultado. Al guardar, se reasigna automáticamente un nuevo caso.

### 4.7 Sistema de Medición de Tiempos

El sistema mide dos tipos de tiempo que reflejan diferentes perspectivas de rendimiento:

| Métrica | Desde | Hasta | Mide | Unidad | Columna (Solicitudes) | Columna (Reestudios) |
|---------|-------|-------|------|--------|----------------------|---------------------|
| **Tiempo de Gestión** | Asignación al analista | Resultado/cierre | Eficiencia individual del analista | Minutos brutos | Col AI (35) | Col P (16) |
| **Tiempo General** | Radicación de la solicitud | Resultado/cierre | Nivel de servicio al cliente (incluye cola de espera) | Horas hábiles* | Col AK (37) | Col O (15)** |

\* En la hoja de solicitudes, el Tiempo General se calcula con `calcularMinutosHabilesSLA()` que excluye noches (fuera de 8am-6pm), fines de semana y festivos.

\** En la hoja de reestudios, el Tiempo General se almacena en minutos brutos y se convierte a horas en los reportes.

**Cálculo del Tiempo General (solicitudes — `guardarCambiosInternos`):**
```javascript
const fechaRadicacion = sheetOrigen.getRange(targetRow, 18).getValue();
let horasHabilesGeneral = 0;
if (fechaRadicacion instanceof Date && !isNaN(fechaRadicacion.getTime())) {
  const minutosHabilesGeneral = calcularMinutosHabilesSLA(fechaRadicacion, ahora, ssOrigen);
  horasHabilesGeneral = Number((minutosHabilesGeneral / 60).toFixed(2));
}
sheetOrigen.getRange(targetRow, 37).setValue(horasHabilesGeneral);
```

**Cálculo del Tiempo General (reestudios — `guardarGestionReestudio`):**
```javascript
const fechaRadicacionRaw = hoja.getRange(targetRow, 1).getValue();
if (fechaRadicacionRaw instanceof Date && !isNaN(fechaRadicacionRaw.getTime())) {
  tiempoTotalResolucion = Math.round((ahora.getTime() - fechaRadicacionRaw.getTime()) / 60000);
}
hoja.getRange(targetRow, 15).setValue(tiempoTotalResolucion); // col O
```

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

---

## 5. ⏰ Automatizaciones y Procesos en Segundo Plano

### Triggers Identificados

| Función | Tipo Estimado | Frecuencia | Descripción |
|---------|--------------|-----------|-------------|
| `actualizarSolicitudesNuevasAPI()` | Trigger por tiempo | Cada X minutos (8am - 6pm) | Descarga nuevas solicitudes desde la API SAI |
| `descargarBiometriasAPI()` | Trigger por tiempo | Periódico | Descarga biometrías pendientes (resultCode 500/503) |

### Validaciones en Background

- **Horario de operación:** `actualizarSolicitudesNuevasAPI()` no se ejecuta fuera del rango 8:00 - 18:00.
- **Timeout de ejecución:** `descargarBiometriasAPI()` incluye un límite de 5 minutos.
- **Anti rate-limiting:** Pausas de 2 segundos entre páginas de la API.
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
| `PUNTERO_ROTACION` | Índice actual de rotación de categorías | `0` |
| `VIP_COUNT_{email}` | Contador de VIPs consecutivas por analista | `1` |

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

### Estructura de la Hoja "ORIGEN" (Reestudios) — 16 Columnas

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
| N | 13 | observaciones | Gestión del analista |
| O | 14 | tiempoTotalResolucion (minutos, radicación → cierre) | Cálculo al guardar |
| P | 15 | tiempoGestion (minutos, asignación → cierre) | Cálculo al guardar |

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

## 8. 📝 Pendientes y Consideraciones Futuras

| Item | Estado | Descripción |
|------|--------|-------------|
| Exclusión exacta de tipos | Pendiente | Definir los valores exactos de `tipoDeProceso` / `claseDeSolicitud` que identifican "Nueva UAR" y "Deudor UAR" para excluirlos del modelo de reestudios |
| Validación de especialidad | Comentada (testing) | Reactivar la validación `especialidad.includes("REESTUDIOS")` en `RequestLeadReestudios()` (`ModeloReestudios.js`) para producción |
| Notificaciones Google Chat | Pendiente | Evaluar si se necesita notificación al chat al asignar reestudios |
| Reasignación desde Admin | Pendiente | Permitir que el admin reasigne casos de reestudios desde su panel |
| Carpetas Drive unificadas | En progreso | Sistema de carpetas por solicitud (`SOL-{nro}`) en unidad compartida para centralizar documentos |

---

> 📅 **Última actualización:** Junio 2026  
> 🔄 **Versión:** 2.1  
> 📝 **Mantenedor:** Equipo de Desarrollo - El Libertador
