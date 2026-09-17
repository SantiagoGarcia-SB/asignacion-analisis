# Changelog — fix/biometria-cycle-integrity

## [No publicado]

### Corregido
- Se corrigió la sincronización de fases de biometría entre `solicitud`, `Historico_Gestiones` y `pendiente_biometria`: `ESCALADA` ahora requiere que la cola confirme el ID, y las salidas a `ASIGNADA`, `RESUELTA_EN_COLA` y `ARCHIVADA` reportan actualizaciones incompletas.
- Se agregó reconciliación al inicio de cada corte para reparar automáticamente biometrías escaladas que ya fueron asignadas, se resolvieron en SAI o perdieron su fila de cola.
- Se ajustó la escalación por respuestas nulas de SAI para que los casos sigan siendo asignables en la cola, conservando `SAI_NO_CONFIRMO` como trazabilidad.

### Corregido
- Se limitó la verificación de desaplazamientos, inducciones y reestudios contra SAI a 500 candidatos y 20 minutos por corrida, persistiendo los resultados ya consultados para evitar `DEADLINE_EXCEEDED` de Apps Script.
- Se agruparon las actualizaciones finales por estado en `Historico_Gestiones`, reduciendo las operaciones de escritura al cerrar cada verificación.

### Cambiado
- Se trasladó la conciliación diaria de resultados SAI para desaplazamientos desde `Historico_Gestiones` a `pendiente_biometria`; ahora conserva por separado el resultado final SAI y su fecha de confirmación sin sobrescribir la gestión ni los SLA del analista.
- Se incluyeron las biometrías en fase `ARCHIVADA` en la conciliación diaria de cierre SAI, junto con las `ASIGNADA`, para registrar resultados que ocurran después de salir de la cola.

### Agregado
- Se agregó un cursor persistente y continuaciones temporales para que la conciliación SAI de biometrías procese el backlog completo por lotes, sin volver siempre a las primeras solicitudes.
- Se agregó una reserva temporal de ejecución y validación de la fila antes de escribir, evitando consultas superpuestas y actualizaciones sobre una fila que cambió durante la llamada a SAI.

### Cambiado
- Se habilitó el scope `script.scriptapp` para administrar exclusivamente los triggers temporales de continuación del cierre SAI de biometrías.

### Corregido
- Se redujo cada lote de cierre SAI a 100 consultas y cuatro minutos, dejando margen real para guardar el cursor y programar la continuación antes del límite de Apps Script.
- Se fortaleció el cursor con solicitud y fila, incluyendo una continuación por sucesor cuando el punto cambia y el cierre seguro de la vuelta cuando ya no existe sucesor.
- Se hizo que la ejecución administrativa encadene el backlog y que un fallo al crear su trigger temporal se devuelva explícitamente como error.

### Cambiado
- Se actualizaron las tareas de `archive-queue-reactivation-fix` para separar el desarchivado de la política de asignación posterior y ampliar las pruebas de propiedades.
- Se actualizó el diseño de `archive-queue-reactivation-fix` con validación estricta del contrato, máximo de 100 candidatas por operación, respuesta determinista para `CANTIDAD_MAXIMA_EXCEDIDA`, cadencia SAI, presupuesto/telemetría y pruebas de borde sin efectos laterales.
### Cambiado
- Se actualizaron las tareas de `archive-queue-reactivation-fix` con acciones verificables para el máximo estricto de 100, el contrato exacto, selección física por índice 59, cadencia SAI, métricas agregadas sin PII y pruebas de borde/preservación.
### Agregado
- Se agregaron propiedades de preservación reproducibles para cero coincidencias, persistencia SAI confirmada, deduplicación de IDs físicos y orden posterior de Biometría, antes del arreglo de `archive-queue-reactivation-fix`.
### Cambiado
- Se actualizó el modal de desarchivado en `VistaAdmin.html` para seleccionar `fechaConsultaSai`, enviar exclusivamente ese campo junto con `cantidad` y restringir la cantidad a un máximo visible de 100 por operación.

### Agregado
- Se agregaron pruebas de contrato del modal de reactivación para el rango 1–100, el payload exacto, la respuesta autoritativa de límite del backend y el aislamiento de Orden Biometría.
### Corregido
- Se validó en `admin_desarchivarBiometrias` el contrato exacto `{ fechaConsultaSai, cantidad }` antes de acceder a servicios, rechazando entradas inválidas sin efectos y devolviendo `CANTIDAD_MAXIMA_EXCEDIDA` para cantidades enteras superiores a 100.

### Agregado
- Se agregaron pruebas unitarias y de propiedades que instrumentan los servicios de Apps Script para verificar el rechazo sin efectos y el límite estricto de 100.
### Corregido
- Se corrigió el desarchivado manual de biometrías para seleccionar en orden físico solo filas `ARCHIVADA` con ID y `fecha_consulta_sai` de la columna 60/índice 59 coincidente; el límite de 100 se aplica después del filtro y cada consulta SAI consecutiva respeta una cadencia mínima de un segundo.

### Agregado
- Se agregaron pruebas unitarias y de propiedades para la selección física por fecha de consulta SAI, IDs duplicados, cero coincidencias y la cadencia determinista de consultas.
### Corregido
- Se endureció el desarchivado manual de biometrías: solo la respuesta SAI exacta `500` + `APROBADO_PENDIENTE_BIOMETRIA` + código principal `2` y tipo distinto de `AC`/`AV` reutiliza la persistencia protegida; las respuestas disponibles no elegibles cierran en `RESUELTA` y las no interpretables quedan `ARCHIVADA` para reintento.

### Agregado
- Se agregaron métricas de reactivación exclusivamente agregadas y no PII: cantidades filtradas/seleccionadas, intentos y espera SAI, resultados de persistencia, duración y estado de presupuesto, junto con pruebas focalizadas de clasificación y telemetría.
### Corregido
- Se actualizó el adaptador de exploración de reactivación archivada para representar el contrato corregido y conservar las propiedades existentes de límite, selección física, cadencia SAI, decisión SAI y aislamiento de política.