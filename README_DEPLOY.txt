DGL CLOUD — PUBLICAR EN RENDER

1. Crea un repositorio NUEVO en GitHub llamado DGL_Cloud.
2. Sube TODO el contenido de esta carpeta cloud (no la carpeta contenedora).
3. Entra a https://render.com e inicia sesión con GitHub.
4. New + > Web Service > selecciona DGL_Cloud.
5. Runtime: Node | Build Command: npm install | Start Command: npm start | Plan: Free.
6. En Environment agrega:
   DGL_DEVICE_API_KEY = inventa una clave larga (mínimo 32 caracteres)
   DGL_ADMIN_KEY = inventa otra clave larga para entrar al panel
7. Create Web Service. Cuando termine copia la URL https://....onrender.com
8. Pon esa URL y la MISMA DGL_DEVICE_API_KEY en firmware/src/Config.h.
9. Compila y carga el firmware al ESP32.

IMPORTANTE: el plan gratis puede dormirse. El ESP32 vuelve a despertarlo y reconecta solo.
Los totales reales se conservan en el ESP32 y se vuelven a enviar al servidor.
