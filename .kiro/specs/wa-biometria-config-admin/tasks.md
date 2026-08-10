# Implementation Plan: wa-biometria-config-admin

## Overview

Externalizar la configuración de horarios de envío WA Biometría desde valores hardcodeados en `Biometria.js` hacia Script Properties, con administración desde el panel VistaAdmin.html. La implementación sigue un enfoque incremental: primero la lógica pura testeable, luego el backend de persistencia, después la refactorización del motor de biometría, y finalmente la UI del admin.

## Tasks

- [x] 1. Crear módulo de lógica pura y funciones de validación
  - [x] 1.1 Crear `tests/lib/wa-biometria-config-puro.js` con la lógica pura extraída
    - Implementar constantes `CONFIG_WA_BIOMETRIA_DEFAULTS` con valores por defecto (L-V 7-19, Sáb 8-15, Dom deshabilitado, ventanaHoras 4)
    - Implementar `validarConfigWaBiometria(config)` — valida estructura, tipos, regla horaFin > horaInicio para días habilitados, ventanaHoras 1-48
    - Implementar `validarEstructuraConfig(obj)` — verifica que un objeto JSON parseado tenga la estructura esperada
    - Implementar `evaluarDesviacionesLey2300(config)` — retorna array de desviaciones contra límites de referencia
    - Implementar `dentroDeVentana(config, dow, horaDecimal)` — evaluación pura de si un instante está dentro de la ventana configurada
    - Implementar `cumpleVentanaHoras(ventanaHoras, horasDesdeResultado)` — evaluación de si se cumple la ventana mínima
    - Implementar `getConfigConDefaults(rawString)` — parsea JSON string y retorna config o defaults ante cualquier fallo
    - Exportar todas las funciones con `module.exports`
    - _Requirements: 1.6, 2.1, 2.2, 2.3, 2.7, 2.8, 4.1, 4.2, 4.4, 5.1, 5.2, 5.3_

  - [ ]* 1.2 Write property test: Validation rejects invalid time ranges (Property 1)
    - **Property 1: Validation rejects invalid time ranges**
    - Generar configs arbitrarias donde al menos un día habilitado tiene horaFin ≤ horaInicio
    - Verificar que `validarConfigWaBiometria` retorna `{ok: false}` en todos los casos
    - **Validates: Requirements 1.6**

  - [ ]* 1.3 Write property test: Ley 2300 deviation detection is sound and complete (Property 2)
    - **Property 2: Ley 2300 deviation detection is sound and complete**
    - Generar configs arbitrarias y verificar que `evaluarDesviacionesLey2300` retorna array no vacío si y solo si se cumplen las condiciones de desviación (weekday fuera de 7-19, sábado fuera de 8-15, domingo habilitado)
    - Verificar completitud: cada desviación presente en config tiene su entrada en el array retornado
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8**

  - [ ]* 1.4 Write property test: Time-window evaluation correctness (Property 3)
    - **Property 3: Time-window evaluation correctness**
    - Generar configs válidas + instantes arbitrarios (dow 0-6, hora 0.0-23.99)
    - Verificar que `dentroDeVentana` retorna true si y solo si el día está habilitado y la hora cumple horaInicio ≤ hora < horaFin
    - **Validates: Requirements 4.1, 4.6**

  - [ ]* 1.5 Write property test: VentanaHoras comparison uses configured value (Property 4)
    - **Property 4: VentanaHoras comparison uses configured value**
    - Generar ventanaHoras (1-48) y horasDesdeResultado arbitrarios
    - Verificar que `cumpleVentanaHoras` retorna false si y solo si horasDesdeResultado < ventanaHoras
    - **Validates: Requirements 4.2**

  - [ ]* 1.6 Write property test: Fallback to defaults on invalid config (Property 5)
    - **Property 5: Fallback to defaults on invalid config**
    - Generar strings arbitrarios: JSON inválido, JSON sin clave `dias`, JSON sin `ventanaHoras`, JSON con tipos incorrectos
    - Verificar que `getConfigConDefaults` retorna exactamente los defaults en todos los casos
    - **Validates: Requirements 4.4, 5.1, 5.2, 5.3**

- [x] 2. Checkpoint - Validar lógica pura
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implementar backend de persistencia y lectura (Admin.js)
  - [x] 3.1 Implementar `_getConfigWaBiometria()` en Admin.js
    - Función helper que lee `CONFIG_WA_BIOMETRIA` de Script Properties
    - Parsea JSON, valida estructura con `_validarEstructuraConfig()`
    - Retorna defaults si no existe, es null, o es inválido + Logger.log WARNING
    - Incluir constantes `CONFIG_WA_BIOMETRIA_DEFAULTS` inline (mismo patrón que el módulo puro)
    - _Requirements: 3.5, 4.3, 4.4, 5.1, 5.2, 5.3_

  - [x] 3.2 Implementar `_validarEstructuraConfig()` y `_validarConfigWaBiometria()` en Admin.js
    - `_validarEstructuraConfig(obj)` — verifica que parsed JSON tiene estructura esperada (7 días con habilitado/horaInicio/horaFin, ventanaHoras entero 1-48)
    - `_validarConfigWaBiometria(config)` — validación server-side completa: estructura + regla horaFin > horaInicio para días habilitados
    - Retorna `{ok: true, config: sanitized}` o `{ok: false, error: "mensaje"}`
    - _Requirements: 1.6, 6.2_

  - [x] 3.3 Implementar `admin_getConfigWaBiometria()` en Admin.js
    - Función expuesta a `google.script.run`
    - Llama `verificarPermisoAdmin()` antes de operar
    - Retorna resultado de `_getConfigWaBiometria()`
    - _Requirements: 1.3, 1.4, 6.1, 6.2, 6.3_

  - [x] 3.4 Implementar `admin_setConfigWaBiometria(config)` en Admin.js
    - Función expuesta a `google.script.run`
    - Llama `verificarPermisoAdmin()`
    - Valida con `_validarConfigWaBiometria(config)`, retorna `{success: false}` si falla
    - `JSON.stringify` + `setProperty('CONFIG_WA_BIOMETRIA', ...)` 
    - try/catch: retorna `{success: false, message: genérico}` + Logger.log detalle en error
    - Retorna `{success: true, message: "Configuración de envío WA Biometría actualizada correctamente."}`
    - _Requirements: 1.5, 3.1, 3.2, 3.3, 3.4, 6.1, 6.2, 7.1_

- [x] 4. Refactorizar motor de biometría (Biometria.js)
  - [x] 4.1 Refactorizar `_dentroDeVentanaLey2300()` para lectura dinámica
    - Reemplazar la lógica hardcodeada de day-of-week y horarios por lectura de `_getConfigWaBiometria()`
    - Implementar `_horaANumero(horaStr)` — convierte "HH:MM" a decimal
    - Evaluar `diaConfig.habilitado`, luego `horaInicio ≤ hora < horaFin`
    - Si el día está deshabilitado, loguear festivo si aplica con `_verificarFestivoParaLog()`
    - Mantener lectura fresca (sin caché) en cada invocación
    - _Requirements: 4.1, 4.5, 4.6, 4.7_

  - [x] 4.2 Refactorizar `_enviarPrimerContactoBiometria()` para usar `ventanaHoras` dinámico
    - Leer `config = _getConfigWaBiometria()` al inicio de la función
    - Reemplazar `horasDesdeResultado < VENTANA_HORAS_WA_BIOMETRIA` por `horasDesdeResultado < config.ventanaHoras`
    - Actualizar mensajes de Logger.log para mostrar el valor dinámico en vez de la constante
    - Eliminar o comentar la constante `VENTANA_HORAS_WA_BIOMETRIA = 4` (ya no se usa como fuente de verdad)
    - _Requirements: 4.2, 4.5_

- [x] 5. Checkpoint - Validar backend
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar UI de configuración en VistaAdmin.html
  - [x] 6.1 Agregar enlace "WA Biometría" en el sidebar de VistaAdmin.html
    - Agregar un `<a>` con id `link-wabiometria`, icono `bi-whatsapp`, texto "WA Biometría"
    - Posicionar después de la sección de "Catálogo" en el sidebar
    - Conectar con `onclick="mostrarSeccion('wabiometria', event)"` siguiendo el patrón existente
    - _Requirements: 1.1_

  - [x] 6.2 Crear sección HTML `seccion-wabiometria` con formulario de configuración
    - `<div id="seccion-wabiometria" class="seccion-admin" style="display:none;">`
    - Header con título "Configuración de envío WA Biometría" e ícono WhatsApp
    - Card informativa con borde amarillo con nota de referencia Ley 2300 (L-V 7-19, Sáb 8-15, Dom no recomendado)
    - Grid de 7 filas (Lunes a Domingo): checkbox habilitado + select hora inicio (00:00-23:30, incrementos 30 min) + select hora fin
    - Input numérico para ventana de horas (min 1, max 48)
    - Botón guardar con spinner (patrón existente `btn-primary-brand`)
    - _Requirements: 1.1, 1.2_

  - [x] 6.3 Implementar funciones JavaScript del formulario WA Biometría
    - `cargarConfigWaBiometria()` — llama `google.script.run.admin_getConfigWaBiometria()`, renderiza valores en formulario
    - `_recolectarFormWaBiometria()` — recolecta valores del DOM en objeto ConfigWaBiometria
    - `_validarHorariosWaBiometria(config)` — valida horaFin > horaInicio para cada día habilitado, retorna `{valido, errores}`
    - `_evaluarDesviacionesLey2300(config)` — evalúa desviaciones client-side contra límites Ley 2300
    - `guardarConfigWaBiometria()` — orquesta: validar → evaluar Ley 2300 → confirmar si aplica → enviar con spinner
    - Manejar `withSuccessHandler` (SweetAlert2 success auto-close 3s) y `withFailureHandler` (SweetAlert2 error)
    - Timeout de 30s: rehabilitar botón + SweetAlert2 error si no hay respuesta
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7. Checkpoint final
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties defined in the design
- El módulo puro (`tests/lib/wa-biometria-config-puro.js`) replica la lógica sin dependencias de Google Apps Script, siguiendo el patrón de `tests/lib/guardar-y-asignar-puro.js`
- La implementación en Admin.js y Biometria.js usa el mismo código validado en los tests pero adaptado al entorno GAS (sin `module.exports`, con `PropertiesService`)
- fast-check 4.1.1 y Vitest 3.2.7 ya están instalados en el proyecto

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3"] }
  ]
}
```
