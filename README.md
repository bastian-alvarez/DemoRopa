# Sur Studio

Tienda de ropa de muestra en Node.js. Incluye catálogo con búsqueda y filtros, bolsa de compra en el navegador, panel protegido para administrar prendas y preparación del pedido en WhatsApp. No cobra ni almacena datos de pago.

## Iniciar

Necesitas Node.js 20 o superior. Copia `.env.example` a `.env` y configura:

- `ADMIN_USER` y `ADMIN_PASSWORD`: credenciales privadas del panel.
- `SESSION_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `WHATSAPP_NUMBER`: número internacional del vendedor, solo dígitos y sin `+` (por ejemplo, `56912345678`).
- `PORT`: opcional; por defecto `3000`.

Luego ejecuta `npm start` y abre `http://localhost:3000`. Para desarrollo con reinicio automático puedes usar `npm run dev`.

El botón **Admin** abre el panel. La primera ejecución crea `data/products.json` a partir de `data/products.seed.json`; los cambios al catálogo quedan guardados en ese archivo. Las imágenes de las prendas se agregan mediante URL HTTPS.

## Puesta en producción

Despliega detrás de HTTPS y define `NODE_ENV=production`; en ese modo la aplicación exige las credenciales y el secreto y emite la cookie de administración con `Secure`. Usa una contraseña larga y única, no subas `.env` ni `data/products.json` al repositorio y conserva copias de seguridad del catálogo. El proceso debe tener permiso de escritura en `data/`.

Esta base es para una tienda pequeña en una sola instancia: las sesiones activas viven en memoria y se cierran al reiniciar el proceso. Para varias instancias o más operadores, conviene reemplazar el almacén de productos y sesiones por una base de datos compartida con copias de seguridad.

## Preview en GitHub Pages

El workflow `.github/workflows/pages.yml` publica una vista estática al subir cambios a `main` o `master` (también se puede ejecutar manualmente desde Actions). En el repositorio, entra a **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación. Después del primer despliegue, la URL aparece en el entorno `github-pages` y en la pestaña Actions.

Pages sirve la tienda y la bolsa como preview; no ejecuta Node ni incluye administración. Para mostrar pedidos por WhatsApp en Pages, configura `public/site-config.json` con el número del vendedor en formato internacional. El catálogo de la preview se genera desde `data/products.seed.json`; los cambios de catálogo hechos por el servidor Node se guardan en `data/products.json` y no se publican automáticamente.

Las imágenes del catálogo usan URLs de images.unsplash.com para mantener una lista de orígenes permitidos en la política de seguridad del navegador.

