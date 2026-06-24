# Manual de Pruebas — Sistema de Asignación v2

**Fecha:** 2026-06-24
**Preparado para:** Despliegue a producción

---

## Convenciones

- ✅ = Resultado esperado (verificar que se cumpla)
- 📋 = Dato a anotar para validar después
- ⚠️ = Punto crítico (bug corregido hoy, verificar especialmente)

---

## PARTE 1: VISTA DEL ANALISTA

### 1.1 Login y carga inicial

1. Abrir la URL de la web app en el navegador
2. ✅ Se carga la vista de analista (VistaUnificada)
3. ✅ Aparece el nombre del analista en la parte superior
4. ✅ Se muestra el badge del equipo (Digital, Reestudios, etc.)
5. ✅ La tabla de casos pendientes carga sin errores
6. ✅ Si no hay casos, aparece mensaje "Sin solicitudes pendientes"

### 1.2 Cambio de estado

1. Hacer clic en el selector de estado
2. Cambiar a **ACTIVO**
3. ✅ El badge de estado cambia inmediatamente (actualización optimista)
4. ✅ No hay error en consola del navegador (F12 → Console)
5. Cambiar a **ALMUERZO**
6. ✅ Estado cambia correctamente
7. Cambiar a **PAUSA ACTIVA**
8. ✅ Estado cambia
9. Volver a **ACTIVO**
10. ✅ Estado se restaura

### 1.3 Cupos del día

1. Verificar el indicador de cupos en la parte superior
2. ✅ Muestra cupos usados / total para cada subcategoría
3. ✅ Los números coinciden con lo configurado en Admin → Cupos

### 1.4 Auto-asignación (polling)

1. Estar en estado ACTIVO con la tabla vacía
2. ✅ El sistema intenta auto-asignar un caso automáticamente
3. ✅ Si hay caso disponible, aparece en la tabla con notificación
4. ✅ Si no hay caso, no hay error visible

### 1.5 Solicitar caso manualmente

1. Hacer clic en el botón "Solicitar caso" / "Obtener caso"
2. ✅ Se asigna un caso y aparece en la tabla
3. ✅ Aparece notificación con el tipo de caso asignado
4. 📋 Anotar el ID de solicitud asignado

---

## PARTE 2: GESTIÓN DE CASOS DIGITALES

### 2.1 Abrir y gestionar caso digital

1. Hacer clic en un caso de tipo **Digital** en la tabla
2. ✅ Se abre el modal de gestión digital
3. ✅ Los datos del caso se muestran correctamente (solicitud, póliza, etc.)
4. ✅ El badge dice "Digital"
5. ✅ El select de estado tiene opciones: APROBADA, APLAZADA, NEGADA, PENDIENTE VALIDACION, PENDIENTE EVIDENTE
6. ✅ El campo de biometría es visible

#### Guardar como APROBADA:
7. Seleccionar biometría = Sí o No
8. Seleccionar estado = **APROBADA**
9. Hacer clic en Guardar
10. ✅ Muestra mensaje de éxito
11. ✅ El modal se cierra
12. ✅ El caso desaparece de la tabla
13. ✅ En la hoja Historico_Gestiones, el caso aparece con fecha de fin

#### Guardar como APLAZADA:
14. Abrir otro caso digital
15. Seleccionar estado = **APLAZADA**
16. ✅ Aparece el campo de motivo de aplazamiento
17. Seleccionar un motivo
18. Guardar
19. ✅ Se guarda correctamente

#### Guardar como NEGADA:
20. Abrir otro caso digital
21. Seleccionar estado = **NEGADA**
22. ✅ Aparece el campo de motivo de negación
23. Seleccionar un motivo
24. Guardar
25. ✅ Se guarda correctamente

---

## PARTE 3: GESTIÓN DE INDUCCIONES ⚠️

> **Bugs corregidos hoy:** detectarTipoCaso no detectaba inducciones, modal no restauraba opciones, tipoSolicitudActual no se enviaba al backend.

### 3.1 Abrir caso de inducción

1. Abrir un caso cuya clase sea **INDUCCION** (col 21 de solicitudes)
2. ✅ ⚠️ El badge dice "Inducción" (no "Digital")
3. ✅ ⚠️ El select de estado SOLO muestra "APLAZADA" (correcto para inducciones)
4. ✅ El campo de biometría está oculto

### 3.2 Gestionar inducción

5. Seleccionar estado = APLAZADA
6. Seleccionar motivo de aplazamiento
7. Guardar
8. ✅ Se guarda correctamente
9. ✅ ⚠️ En Historico_Gestiones, verificar que la columna "clase" diga **INDUCCION** (no vacía ni "EN_ESTUDIO")

### 3.3 Modal después de inducción ⚠️

10. **Cerrar el modal** de la inducción
11. **Abrir un caso digital normal** (no inducción)
12. ✅ ⚠️ El select de estado tiene TODAS las opciones (APROBADA, APLAZADA, NEGADA, PENDIENTE VALIDACION, PENDIENTE EVIDENTE)
13. ✅ El campo de biometría es visible de nuevo
14. ✅ El badge dice "Digital" (no "Inducción")

> **Si el select solo muestra "APLAZADA" después de abrir una inducción, el bug NO se corrigió.**

---

## PARTE 4: GESTIÓN DE DESPLAZAMIENTOS (BIOMETRÍA)

### 4.1 Abrir caso de desplazamiento

1. Abrir un caso de tipo **desaplazamiento** (estado = APROBADO_PENDIENTE_BIOMETRIA)
2. ✅ Se abre el modal de biometría (no el de digital)
3. ✅ Aparecen los campos: resultado de llamada, resultado final

### 4.2 Gestionar desplazamiento

4. Seleccionar resultado de llamada
5. Seleccionar resultado final = APLAZADA
6. Seleccionar motivo de aplazamiento
7. Guardar
8. ✅ Se guarda correctamente
9. ✅ En Historico_Gestiones, la clase dice **BIOMETRIA**

---

## PARTE 5: GESTIÓN DE REESTUDIOS

### 5.1 Abrir caso de reestudio

1. Abrir un caso de tipo **reestudio**
2. ✅ Se abre el modal de reestudio
3. ✅ Aparecen los campos: estado gestión, póliza, observaciones

### 5.2 Gestionar reestudio

4. Seleccionar estado = APLAZADA
5. Llenar póliza y motivo de aplazamiento
6. Guardar
7. ✅ Se guarda correctamente

### 5.3 Guardar reestudio con error ⚠️

8. Intentar guardar sin seleccionar estado
9. ✅ Muestra advertencia "Estado requerido"
10. Intentar guardar con estado APLAZADA pero sin motivo
11. ✅ Muestra advertencia "Motivo requerido"
12. Si el backend retorna error:
13. ✅ ⚠️ Muestra ícono de **advertencia** (no de éxito)
14. ✅ ⚠️ El modal NO se cierra (el usuario puede reintentar)

---

## PARTE 6: ADMIN — DASHBOARD

### 6.1 Acceso al panel

1. Ingresar con un usuario que tenga rol **ADMIN** en la hoja Usuarios (col X = ADMIN)
2. ✅ Se carga el Panel de Admin
3. ✅ Dashboard muestra: Sin Asignar, En Gestión, Gestionadas Hoy
4. ✅ Los contadores son coherentes con los datos de las hojas

### 6.2 KPIs

5. ✅ Analistas activos/inactivos coinciden con la hoja Usuarios
6. ✅ Desglose por tipo (digital, inducción, reestudio, etc.) es coherente

---

## PARTE 7: ADMIN — GESTIÓN DE USUARIOS

### 7.1 Crear usuario

1. Admin → Usuarios → Nuevo Usuario
2. Llenar: nombre, correo, documento, especialidad, capacidad
3. Guardar
4. ✅ Aparece mensaje de éxito con número de asesor
5. ✅ En hoja Usuarios, aparece la nueva fila con estado INACTIVO

### 7.2 Editar usuario

6. Seleccionar un usuario existente
7. Cambiar capacidad y/o especialidad
8. Guardar
9. ✅ Mensaje de éxito
10. ✅ En hoja Usuarios, los valores cambiaron

### 7.3 Cambiar estado desde admin

11. Seleccionar un usuario
12. Cambiar estado a ACTIVO
13. ✅ Estado cambia en la hoja Usuarios
14. ✅ Se registra en Historico_Estados

---

## PARTE 8: ADMIN — CUPOS GLOBALES ⚠️

> **Bug corregido hoy:** Los cupos se guardaban con claves hardcodeadas en plural, causando que reestudios e inducciones se guardaran como 0.

### 8.1 Configurar cupos

1. Admin → Cupos → Seleccionar un equipo (ej. CANONES_ALTOS)
2. Configurar:
   - Total: 20
   - Digital: 10
   - Inducción: 5
   - Reestudios: 3
   - Desplazamiento: 2
3. Guardar
4. ✅ ⚠️ Mensaje "Cupos actualizados correctamente"
5. ✅ ⚠️ Badge dice "Guardado"

### 8.2 Verificar en historico_cupos ⚠️

6. Abrir la hoja **historico_cupos**
7. Buscar el último registro del equipo que editaste
8. ✅ ⚠️ Total = 20
9. ✅ ⚠️ Digital = 10
10. ✅ ⚠️ **Inducción = 5** (NO 0)
11. ✅ ⚠️ **Reestudios = 3** (NO 0)
12. ✅ ⚠️ Desplazamiento = 2

> **Si Inducción o Reestudios aparecen como 0, el bug original NO se corrigió.**

### 8.3 Verificar que el motor los lee

13. Ir a GAS → ejecutar `test_C2_CuposPorEquipo`
14. ✅ Los cupos del equipo editado reflejan los nuevos valores

---

## PARTE 9: ADMIN — CUPOS INDIVIDUALES ⚠️

### 9.1 Asignar cupos personalizados

1. Admin → Cupos → Individual → Buscar un analista
2. Activar "Cupos personalizados"
3. Configurar valores diferentes a los globales
4. Guardar
5. ✅ ⚠️ Mensaje de éxito

### 9.2 Verificar en hoja Usuarios

6. Abrir hoja Usuarios, buscar el analista
7. Ir a columna Y (índice 24)
8. ✅ ⚠️ Contiene un JSON con las claves correctas
9. ✅ ⚠️ Las claves son `digital`, `reestudio`, `induccion` (singular, NO plural)
10. ✅ ⚠️ Los valores coinciden con lo que configuraste

### 9.3 Eliminar cupos personalizados

11. Hacer clic en "Eliminar cupos personalizados"
12. Confirmar
13. ✅ Mensaje "usará los cupos globales del equipo"
14. ✅ En hoja Usuarios, la columna Y queda vacía para ese analista

---

## PARTE 10: ADMIN — DESASIGNAR / REASIGNAR ⚠️

> **Bug corregido hoy:** Faltaba LockService en desasignar.

### 10.1 Desasignar solicitud

1. Admin → Dashboard → En Gestión → seleccionar una solicitud digital
2. Hacer clic en "Desasignar"
3. ✅ ⚠️ Mensaje "Solicitud desasignada"
4. ✅ En la hoja, las columnas de asignación están vacías
5. ✅ La solicitud vuelve a aparecer como "Sin Asignar"

### 10.2 Desasignar reestudio

6. Hacer lo mismo con una solicitud de reestudio
7. ✅ ⚠️ Funciona sin error

### 10.3 Reasignar

8. Admin → seleccionar solicitud en gestión → Reasignar
9. Seleccionar otro analista
10. ✅ Mensaje de éxito con nombre del nuevo analista
11. ✅ En Historico_Gestiones, el email y nombre cambiaron

---

## PARTE 11: ADMIN — PRIORIDAD GLOBAL

### 11.1 Cambiar prioridad

1. Admin → Prioridad → seleccionar un modo diferente (ej. INDUCCION_PRIMERO)
2. Guardar
3. ✅ Mensaje "Prioridad actualizada"
4. ✅ En Script Properties, GLOBAL_PRIORIDAD tiene el nuevo valor

### 11.2 Verificar efecto

5. Solicitar un caso como analista
6. ✅ El tipo del caso asignado refleja la nueva prioridad (si hay disponibles)
7. **Restaurar** la prioridad original al terminar

---

## PARTE 12: ADMIN — TURNOS

### 12.1 Ver turnos

1. Admin → Turnos
2. ✅ Se muestran los turnos configurados
3. ✅ Se muestran los analistas asignados a cada turno
4. ✅ Se muestran los analistas sin turno

### 12.2 Crear/editar turno

5. Crear un turno de prueba con horarios
6. ✅ Se guarda correctamente
7. Asignar un analista al turno
8. ✅ El analista aparece bajo ese turno

---

## PARTE 13: ADMIN — NOVEDADES

### 13.1 Consultar novedades del día

1. Admin → Novedades
2. ✅ Se muestra tabla con analistas y sus estados del día
3. ✅ Tiempos en cada estado son coherentes
4. ✅ Primer y último resultado se muestran si hubo gestiones

---

## PARTE 14: ADMIN — BÚSQUEDA

### 14.1 Buscar solicitud

1. Admin → Buscar → ingresar un ID de solicitud existente
2. ✅ Se muestran todos los datos del caso
3. ✅ Si es de reestudios, muestra datos de reestudio

### 14.2 Buscar solicitud inexistente

4. Ingresar un ID que no existe
5. ✅ Muestra "Solicitud no encontrada"

---

## PARTE 15: FILTRO DE CANON ⚠️

> **Corregido hoy:** canonTipos tenía "nueva" en vez de "digital".

### 15.1 Verificar separación DIGITAL vs CANONES_ALTOS

1. Solicitar caso como analista del equipo **DIGITAL**
2. 📋 Anotar el canon del caso asignado
3. ✅ ⚠️ El canon es **menor a 8,000,000**

4. Solicitar caso como analista del equipo **CANONES_ALTOS**
5. 📋 Anotar el canon del caso asignado
6. ✅ ⚠️ El canon es **8,000,000 o mayor** (para casos digitales)

---

## PARTE 16: SLA Y TIEMPOS

### 16.1 Verificar cálculo de tiempos

1. Gestionar un caso (aprobarlo)
2. ✅ En Historico_Gestiones, las columnas de tiempo se llenaron:
   - minutos_cola (tiempo desde radicación hasta asignación)
   - minutos_gestion (tiempo desde asignación hasta cierre)
   - minutos_general (tiempo total)
3. ✅ Los tiempos son coherentes (no negativos, no exageradamente grandes)

---

## CHECKLIST FINAL

| # | Prueba | OK? |
|---|--------|-----|
| 1 | Login carga sin errores | |
| 2 | Cambio de estado funciona | |
| 3 | Auto-asignación funciona | |
| 4 | Gestión digital se guarda correctamente | |
| 5 | ⚠️ Inducción se detecta como "induccion" (no "digital") | |
| 6 | ⚠️ Modal restaura opciones después de inducción | |
| 7 | ⚠️ Clase queda "INDUCCION" en Historico | |
| 8 | Desplazamiento se gestiona correctamente | |
| 9 | Reestudio se gestiona correctamente | |
| 10 | ⚠️ Error en reestudio muestra advertencia (no éxito) | |
| 11 | Admin dashboard carga | |
| 12 | Crear usuario funciona | |
| 13 | Editar usuario funciona | |
| 14 | ⚠️ Cupos globales se guardan correctamente (no en 0) | |
| 15 | ⚠️ Cupos individuales usan claves singulares | |
| 16 | ⚠️ Desasignar funciona sin error | |
| 17 | Reasignar funciona | |
| 18 | Prioridad global se cambia | |
| 19 | Búsqueda de solicitud funciona | |
| 20 | ⚠️ Canon: DIGITAL < 8M, CANONES_ALTOS >= 8M | |
| 21 | Tiempos SLA se calculan | |

---

**Tiempo estimado:** 30-45 minutos

**Nota:** Los puntos marcados con ⚠️ son los bugs corregidos hoy. Si alguno falla, reportar inmediatamente antes de desplegar.
