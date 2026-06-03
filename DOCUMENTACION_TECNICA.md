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
- **Analistas operativos:** Reciben asignaciones automáticas según su capacidad y especialidad.
- **Administradores:** Monitorizan KPIs, gestionan usuarios, y controlan prioridades del sistema.
- **Analistas de Biometría:** Gestionan solicitudes pendientes de verificación biométrica.
- **Analistas de Reestudios:** Evalúan solicitudes provenientes de canales como Victoria y Correo.

### 🛠️ Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Backend | Google Apps Script (JavaScript V8) |
| Base de Datos | Google Sheets (múltiples hojas de cálculo) |
| Frontend | HTML5 + CSS3 + JavaScript (Client-Side) |
| Framework CSS | Bootstrap 5.3 |
| Tablas Interactivas | DataTables 1.13.x |
| Alertas UI | SweetAlert2 11.x |
| Efectos Visuales | Particles.js 2.0 |
| Fuente | Google Fonts (Manrope) |
| Iconografía | Bootstrap Icons + Font Awesome 6 |
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
┌────────────────────────────────────────────────────────────┐
│                    GOOGLE APPS SCRIPT                        │
│                                                             │
│   doGet() ──► Autenticación por Email (Session API)         │
│       │                                                     │
│       ├── ADMIN ──────────► VistaAdmin.html                 │
│       ├── ASESOR                                            │
│       │    ├── PENDIENTE_BIOMETRIA ──► VistaBiometria.html  │
│       │    ├── UAR ──────────────────► VistaUar.html        │
│       │    ├── REESTUDIOS ───────────► VistaReestudios.html │
│       │    └── ESTUDIO DIGITAL ──────► index.html           │
│       └── NO RECONOCIDO ─► "Rol no reconocido"             │
│                                                             │
│   ┌─────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│   │  Código.js  │  │ ModeloAsignación  │  │  Admin.js   │  │
│   │ (Core/API)  │  │  (Distribución)  │  │ (Gestión)   │  │
│   └─────────────┘  └──────────────────┘  └─────────────┘  │
│   ┌─────────────┐  ┌──────────────────┐                    │
│   │Biometria.js │  │ Reestudios.js    │                    │
│   │(Biometría)  │  │ (Victoria/Correo)│                    │
│   └─────────────┘  └──────────────────┘                    │
└────────────────────────────────────────────────────────────┘
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
| `ModeloAsignación.js` | **Motor de asignación inteligente.** Algoritmo `RequestLead()` que distribuye solicitudes según prioridad (VIP, rotación por categorías de inmobiliaria), capacidad del analista y orden configurable globalmente. |
| `Admin.js` | **Panel de administración.** CRUD de usuarios, dashboard de KPIs, control de prioridad global, botón de pánico para desactivar todos los asesores, desasignación de solicitudes y limpieza de duplicados. |
| `Biometria.js` | **Módulo de biometría.** Descarga desde API de solicitudes con códigos 500/503, asignación automática a analistas de biometría, verificación de estado en tiempo real, gestión y tipificación de casos. |
| `Reestudios.js` | **Módulo de reestudios.** Gestión de dos bandejas (Victoria y Correo), notificaciones automáticas vía Google Chat Webhooks, escáner de nuevas entradas y registro de aprobados. |
| `index.html` | **Vista del Asesor (Estudio Digital).** Tabla de solicitudes asignadas, modal de gestión con detalle en tiempo real desde la API, selector de estados, métricas personales. |
| `VistaAdmin.html` | **Vista del Administrador.** Dashboard con métricas, tabla de usuarios, control segmentado de prioridades, modales CRUD, botón de emergencia. |
| `VistaBiometria.html` | **Vista de Biometría.** Tabla de solicitudes pendientes de biometría, modal de tipificación con tabs (formulario + historial de deudores). |
| `VistaReestudios.html` | **Vista de Reestudios.** Sistema de tabs (Victoria / Correo), modales de visualización y gestión, integración con hojas externas. |
| `VistaUar.html` | **Vista UAR.** Placeholder para el módulo de Unidad de Análisis de Riesgo (en desarrollo). |
| `main.js.html` | **JavaScript compartido del Asesor.** Lógica de renderizado de tabla con DataTables, auto-asignación al entrar, manejo de estados, guardado de gestiones, comunicación con backend. |
| `appsscript.json` | **Manifiesto del proyecto.** Configuración de zona horaria, runtime V8, despliegue como Web App con ejecución como usuario desplegador y acceso por dominio. |
| `.clasp.json` | **Configuración de clasp.** Vinculación con el proyecto de Google Apps Script para push/pull del código fuente. |

### Gestión de Datos

El sistema utiliza **Google Sheets como base de datos relacional distribuida**, accediendo a múltiples Spreadsheets por su ID:

| ID Variable | Hoja(s) Clave | Propósito |
|-------------|---------------|-----------|
| `TARGET_SOLICITUDES_SS_ID` | `solicitud`, `Usuarios`, `score`, `Historico_Gestiones`, `Historico_Estados`, `Festivos` | Base central de solicitudes, usuarios y scoring |
| `WAREHOUSE_ID` | `Hoja 1` | Warehouse de pólizas |
| `ID_SHEET_ORIGEN` (Biometría) | `Hoja 2` | Cola de biometrías pendientes descargadas de la API |
| `ID_SHEET_GESTION` (Biometría) | `Hoja 1` | Registro de biometrías asignadas y gestionadas |
| `ID_HOJA_VICTORIA` | `Anexar documentos a la solicitud` | Solicitudes ingresadas por canal Victoria |
| `ID_HOJA_CORREO` | `Solicitudes` | Solicitudes ingresadas por correo electrónico |
| `ID_HOJA_APROBADOS` | `Hoja 1` | Registro de solicitudes aprobadas por reestudios |

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
- Último row procesado de Victoria (`LAST_ROW_VICTORIA`)

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
| **ASESOR - ESTUDIO DIGITAL** | Col E (índice 4) | Vista principal | Tabla de solicitudes, gestión de casos, estados personales |
| **ASESOR - PENDIENTE_BIOMETRIA** | Col E (índice 4) | Vista biometría | Asignación automática de biometrías, tipificación |
| **ASESOR - UAR** | Col E (índice 4) | Vista UAR | Módulo en desarrollo |
| **ASESOR - REESTUDIOS** | Col E (índice 4) | Vista reestudios | Gestión Victoria y Correo |

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

### 4.1 Flujo de Asignación Inteligente (`RequestLead`)

Este es el corazón del sistema. Distribuye solicitudes a analistas de forma balanceada.

**Paso a paso:**

1. **Bloqueo de concurrencia:** Se adquiere un `ScriptLock` para evitar asignaciones duplicadas.
2. **Validación del usuario:** Se verifica que el analista esté ACTIVO, con especialidad "ESTUDIO DIGITAL" y con capacidad disponible.
3. **Cálculo de capacidad real:**
   ```javascript
   capacidadDisponible = capTotal - capPendienteReal
   ```
   Donde `capPendienteReal` = solicitudes asignadas al usuario sin `fecha fin gestión`.
4. **Clasificación de solicitudes:** Se categorizan las pólizas en buckets (VIP, grande, mediana, pequeña, genérica, en desarrollo, revisar, otros) usando la hoja `score`.
5. **Priorización configurable:** Se respeta el orden global definido por el admin:
   - `NUEVAS_PRIMERO` → nueva > biometría > inducción
   - `BIOMETRIA_PRIMERO` → biometría > nueva > inducción
   - `INDUCCION_PRIMERO` → inducción > nueva > biometría
6. **Rotación de categorías:** Se alterna entre VIP y el resto de categorías con un máximo de 2 VIP consecutivas (`MAX_VIP_CONSECUTIVAS`).
7. **Escritura en hoja:** Se registra la fecha de asignación, el email del analista y su nombre.

```
[Analista activo] → [Verificar capacidad] → [Filtrar pendientes]
       ↓                                            ↓
[Calcular prioridad]  ←──── [Orden global admin]
       ↓
[Seleccionar por bucket/rotación] → [Asignar y escribir en hoja]
```

### 4.2 Flujo de Gestión de una Solicitud (`guardarCambiosInternos`)

1. **Frontend (index.html):** El analista abre un modal, selecciona estado, biometría, comentarios y motivos.
2. **Validación:** Se verifica que los motivos correspondan al estado seleccionado.
3. **Escritura en hoja central:** Se actualizan las columnas de estado (17), tracking (23), biometría (24), observaciones (25), fecha fin (29), SLA (30), motivos (32-33).
4. **Cálculo de SLA en horas hábiles:** Función `calcularMinutosHabilesSLA()` que excluye fines de semana y festivos, solo cuenta entre 8:00 y 18:00.
5. **Registro histórico:** Se copia la fila completa a la hoja `Historico_Gestiones`.
6. **Auto-asignación:** Si el estado es de cierre o aplazamiento, se dispara automáticamente `RequestLead()` para llenar la capacidad liberada.

### 4.3 Flujo de Sincronización de Nuevas Solicitudes (`actualizarSolicitudesNuevasAPI`)

1. **Validación horaria:** Solo se ejecuta entre las 8am y 6pm.
2. **Consulta a la API SAI:** Se obtienen solicitudes de los últimos 3 días con paginación (200 registros/página).
3. **Filtrado:** Se excluyen estados `RECHAZADO`, `APROBADO`, `CODEUDORES_REQUERIDOS` y tipos `AD`, `AC`. Solo se guardan solicitudes con `mainResultCode === "2"`.
4. **Homologación de clase:** Se mapean tipos de la API (`TS` → NUEVA, `RSD`/`RE`/`RC` → REESTUDIO, `IND` → INDUCCION).
5. **Deduplicación:** Se comparan contra IDs existentes en la hoja para evitar duplicados.
6. **Escritura en lote con bloqueo:** Se usa `LockService` y se escriben todas las filas nuevas en una sola operación batch.

### 4.4 Flujo de Biometría

1. **Descarga desde API:** `descargarBiometriasAPI()` busca solicitudes con `resultCode` 500 o 503 (biometría pendiente) y las almacena en una hoja intermedia.
2. **Auto-asignación al entrar:** `autoAsignarBiometria()` verifica en tiempo real si cada solicitud aún está pendiente de biometría (`verificarEstadoBiometria()`).
3. **Limpieza automática:** Si la solicitud ya no está pendiente, se elimina de la cola.
4. **Escritura en hoja de gestión:** Se registran datos enriquecidos incluyendo inmobiliaria (desde la hoja `score`), personas a contactar (JSON), fecha y analista.
5. **Tipificación:** El analista guarda resultado de llamada y resultado final. Al guardar, se reasigna automáticamente un nuevo caso.

### 4.5 Flujo de Reestudios (Victoria y Correo)

**Canal Victoria:**
1. Se lee la hoja de Victoria (columnas A a Q).
2. Se presentan todas las solicitudes al analista en una tabla con estado (gestionada/pendiente).
3. El analista selecciona un estado de resolución y tipo de documento presentado.
4. Si el estado es "Solicitud aprobada", se registra en la hoja de aprobados.

**Canal Correo:**
1. Se leen registros de la hoja de Correo donde la columna L (estado evaluación) esté vacía.
2. El analista evalúa y selecciona "APROBADO PARA ASIGNAR" o "NO APROBADO".
3. Se implementa control de concurrencia: si otro analista ya evaluó el registro, se rechaza la escritura.

---

## 5. ⏰ Automatizaciones y Procesos en Segundo Plano

### Triggers Identificados

| Función | Tipo Estimado | Frecuencia | Descripción |
|---------|--------------|-----------|-------------|
| `actualizarSolicitudesNuevasAPI()` | Trigger por tiempo | Cada X minutos (8am - 6pm) | Descarga nuevas solicitudes desde la API SAI y las inserta en la hoja central |
| `descargarBiometriasAPI()` | Trigger por tiempo | Periódico | Descarga biometrías pendientes (resultCode 500/503) de los últimos 8 días |
| `escanearYNotificar()` | Trigger por tiempo | Periódico | Escanea nuevas entradas en Victoria y Correo, envía notificaciones por Google Chat |

### Validaciones en Background

- **Horario de operación:** `actualizarSolicitudesNuevasAPI()` no se ejecuta fuera del rango 8:00 - 18:00.
- **Timeout de ejecución:** `descargarBiometriasAPI()` incluye un límite de 5 minutos (`TIEMPO_LIMITE_MS = 300000`) para no exceder el límite de Google Apps Script.
- **Anti rate-limiting:** Pausas de 2 segundos entre páginas de la API (`Utilities.sleep(2000)`).
- **Control de duplicados:** Tanto la descarga de solicitudes como la de biometrías verifican IDs existentes antes de insertar.

### Funciones de Mantenimiento

```javascript
resetProgress()          // Limpia checkpoints de procesos batch interrumpidos
eliminarTriggersBio()    // Elimina triggers específicos de biometría
inicializarHistorico()   // Marca todos los correos como "NOTIFICADO" (reset de alertas)
```

---

## 6. 📬 Sistema de Alertas y Notificaciones

### Notificaciones en Pantalla (Frontend)

El sistema usa **SweetAlert2** para notificar al usuario en tiempo real:

| Evento | Tipo | Mensaje |
|--------|------|---------|
| Nueva asignación automática | Toast (top-end) | "Se te ha asignado un nuevo registro" |
| Gestión guardada exitosamente | Modal success | "¡Operación Exitosa!" + detalle |
| Error de conexión | Modal error | "Error de Conexión" |
| Validación incompleta | Modal warning | "Completa todos los campos obligatorios" |
| Sistema ocupado | Toast | Reintento sugerido |

### Notificaciones Externas (Google Chat)

El módulo de Reestudios envía **cards enriquecidas** a un espacio de Google Chat mediante webhook:

```javascript
const URL_WEBHOOK_GOOGLE_CHAT = 'https://chat.googleapis.com/v1/spaces/...'
```

**Estructura de la notificación:**
- Título (Victoria / Correo)
- Número de solicitud
- Detalles adicionales
- Botón "Ver solicitud" (enlace a la Web App)
- Botón "Ver Adjuntos / Carpeta" (si aplica)

**Eventos que disparan notificaciones:**
- Nueva entrada en la hoja de Victoria (fila nueva detectada)
- Nueva entrada en la hoja de Correo (sin marca "NOTIFICADO")

---

## 7. 🔧 Guía de Mantenimiento y Configuración

### Variables de Entorno (Script Properties)

Estas propiedades deben configurarse en **PropertiesService.getScriptProperties()** desde el editor de Apps Script:

| Propiedad | Descripción | Ejemplo |
|-----------|-------------|---------|
| `KeyEndPointSaiFullProd` | API Key para autenticación contra la API SAI | `abc123-xyz...` |
| `endPointSaiFullStageProd` | Endpoint base para consulta individual de solicitudes | `https://api.sai.co/v1/request/` |
| `endpointSaiNewApi` | Endpoint para consulta por consecutivo | `https://api.sai.co/v2/solicitud/` |
| `endPointSaiNewApiDate` | Endpoint para consulta masiva por rango de fecha | `https://api.sai.co/v2/requests` |
| `GLOBAL_PRIORIDAD` | Orden de prioridad de asignación | `NUEVAS_PRIMERO` |
| `PUNTERO_ROTACION` | Índice actual de rotación de categorías | `0` |
| `VIP_COUNT_{email}` | Contador de VIPs consecutivas por analista | `1` |
| `LAST_ROW_VICTORIA` | Última fila procesada para notificaciones de Victoria | `350` |

### IDs de Hojas de Cálculo

| Constante | Propósito |
|-----------|-----------|
| `WAREHOUSE_ID` = `1V2GTI4IOPUEsC67SPIGey3LM3OxFCt-8HlFbX95R_fs` | Warehouse de pólizas |
| `TARGET_SOLICITUDES_SS_ID` = `1x9groW5-I7Xg5ULh7DXfa2XGmS_RMdfqfW1iDWB8bJ0` | BD central de solicitudes |
| `ID_SHEET_ORIGEN` = `1tmXIxNB65eAUQah8dxvSJSJVKmR25ZiuM59SLX0NYME` | Origen de biometrías |
| `ID_SHEET_GESTION` = `1lT9BxWAKgo9xed9xaAbbFqna304TWNbzL3v2302ZvOQ` | Gestión de biometrías |
| `ID_HOJA_VICTORIA` = `1_wSkdh3eD0mG474De6RUrj9yd9L8SKnnSjqO3Pg4Jsg` | Victoria (reestudios) |
| `ID_HOJA_CORREO` = `1jGa30nF7DTlu6bRoU8cOBqU8c_AP-bq6LP8D52JpaPQ` | Correo (reestudios) |
| `ID_HOJA_APROBADOS` = `1slgykTgjoAtCd6KmlG7Lqiuw-nM1hSguQbi0XqeLu7U` | Aprobados (reestudios) |

### Estructura de la Hoja `Usuarios`

| Columna | Índice | Contenido |
|---------|--------|-----------|
| A | 0 | Número de asesor |
| B | 1 | Nombre comercial |
| C | 2 | Correo electrónico |
| D | 3 | Documento de identidad |
| E | 4 | Especialidad (ESTUDIO DIGITAL, PENDIENTE_BIOMETRIA, UAR, REESTUDIOS) |
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
| AD | 29 | Tiempo total de resolución (horas hábiles SLA) |
| AE | 30 | Nombre del analista |
| AF | 31 | Motivo de aplazamiento |
| AG | 32 | Motivo de negación |
| AH | 33 | Fecha de gestión (solo día) |
| AI | 34 | Tiempo de gestión (minutos) |
| AJ | 35 | Marcador (REASIGNADA) |
| AK | 36 | Canal |

### Instrucciones de Despliegue

#### Requisitos Previos

1. Cuenta Google Workspace con permisos en el dominio.
2. Node.js instalado con `clasp` (`npm install -g @google/clasp`).
3. Acceso a las hojas de cálculo referenciadas.
4. API Key de la plataforma SAI.

#### Pasos para Despliegue Nuevo

1. **Clonar el repositorio:**
   ```bash
   git clone <url-del-repo>
   cd asignacion-analisis
   ```

2. **Autenticarse con clasp:**
   ```bash
   clasp login
   ```

3. **Crear un nuevo proyecto de Apps Script** (o vincular a uno existente editando `.clasp.json`):
   ```bash
   clasp create --type webapp --title "Asignación Análisis"
   ```

4. **Subir el código:**
   ```bash
   clasp push
   ```

5. **Configurar Script Properties** (desde el editor de Apps Script → Configuración del proyecto → Propiedades del script):
   - `KeyEndPointSaiFullProd`
   - `endPointSaiFullStageProd`
   - `endpointSaiNewApi`
   - `endPointSaiNewApiDate`

6. **Crear las hojas de cálculo necesarias** con la estructura descrita o apuntar los IDs en las constantes del código.

7. **Desplegar como Web App:**
   ```bash
   clasp deploy --description "v1.0"
   ```
   O desde el editor: Implementar → Nueva implementación → App Web → Ejecutar como usuario que implementa → Acceso: Cualquier usuario del dominio.

8. **Configurar Triggers (en el editor de Apps Script → Activadores):**
   - `actualizarSolicitudesNuevasAPI` → Trigger basado en tiempo (cada 5-10 minutos)
   - `descargarBiometriasAPI` → Trigger basado en tiempo (cada 10-15 minutos)
   - `escanearYNotificar` → Trigger basado en tiempo (cada 5 minutos)

9. **Inicializar el módulo de notificaciones:**
   ```javascript
   inicializarHistorico() // Ejecutar una vez manualmente
   ```

#### Consideraciones de Producción

- El sistema usa `LockService` para concurrencia; en alta carga, los locks pueden expirar (timeout de 15-30 segundos).
- Google Apps Script tiene un límite de ejecución de **6 minutos** por función (o 30 minutos para triggers). Las funciones de descarga de API tienen controles de tiempo.
- El límite de llamadas a `UrlFetchApp` es de **20,000 por día** para cuentas Workspace.
- Las hojas de cálculo tienen un límite de **10 millones de celdas** por archivo.

---

> 📅 **Documento generado:** Junio 2026  
> 🔄 **Versión:** 1.0  
> 📝 **Mantenedor:** Equipo de Desarrollo - El Libertador
