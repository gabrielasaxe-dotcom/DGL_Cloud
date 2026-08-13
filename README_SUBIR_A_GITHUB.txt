DEVINE GOLDEN LUCK — CLOUD LUXURY / RECAUDACIÓN OFICIAL

QUÉ SUBIR A GITHUB
-------------------
Reemplaza el contenido del repositorio DGL_Cloud por estos archivos:

server.js
package.json
render.yaml
public/
  index.html
  app.js
  styles.css
  manifest.json

NO HAY QUE CONECTAR EL ESP32 para actualizar la página.
GitHub -> Commit -> Render despliega solo.

VARIABLES DE RENDER
-------------------
Conserva las que ya tienes:
DGL_DEVICE_API_KEY = la misma clave que usa Config.h en los ESP32
DGL_ADMIN_KEY      = tu clave privada para entrar a la página

Opcional:
DGL_ACTION_PIN = 2324
Si no la creas, el servidor usa 2324 por defecto.

RECAUDACIÓN
------------
- La pantalla principal NO muestra totalHistoric.
- "Recaudación actual" = histórico real del ESP32 menos el histórico guardado en la última recaudación.
- El campo "Mes / período actual" usa ese mismo valor y queda en $0 al recaudar.
- Al registrar una recaudación se exige PIN 2324 y la máquina debe estar ONLINE.
- El histórico real del ESP32 NO se borra.
- La sección Recaudación guarda fecha, monto, histórico al retiro y nota.
- Incluye exportación CSV.

PAGOS REMOTOS
--------------
- Todo pago exige PIN 2324 en una ventana de confirmación.
- El servidor también valida el PIN; no depende solamente del botón de la página.
- Una orden física se entrega una sola vez al ESP32 para reducir el riesgo de pagos o reinicios duplicados.

MÁQUINAS
--------
- DGL-01 y DGL-02 aparecen como base.
- Cualquier nuevo ESP32 con otro DGL_NOMBRE_MAQUINA se agrega automáticamente cuando envía telemetría.

IMPORTANTE SOBRE EL HISTORIAL
-----------------------------
Este proyecto conserva el esquema JSON local que ya estabas usando. En un servicio Render sin disco persistente, ese archivo puede perderse al recrear/redeployar la instancia. Para usar el historial de recaudación como registro contable definitivo, conviene migrar después a una base de datos persistente. Mientras tanto, usa también el botón Exportar CSV como respaldo.
