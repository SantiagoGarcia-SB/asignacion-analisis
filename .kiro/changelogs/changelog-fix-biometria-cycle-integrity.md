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
