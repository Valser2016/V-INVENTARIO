# Despliegue en Railway

## 1. Crear el proyecto y los servicios

1. Crea un proyecto nuevo en Railway.
2. Añade un servicio PostgreSQL mediante `New > Database > PostgreSQL`.
3. Añade un servicio `Deploy from GitHub repo` para el backend.
4. Añade otro servicio `Deploy from GitHub repo` para el frontend.
5. En cada servicio, configura las variables de entorno desde la sección **Variables**.

> Railway asigna automáticamente una URL de base de datos al servicio PostgreSQL. No se debe guardar esa URL en Git ni compartirla en el repositorio.

## 2. Secretos de despliegue en GitHub

En **Settings > Secrets and variables > Actions** del repositorio, crea estos
secretos de repositorio:

- `RAILWAY_DEPLOY_API_TOKEN`: token de cuenta de Railway con acceso a los
  proyectos. El workflow lo entrega al CLI como `RAILWAY_API_TOKEN`.
- `RAILWAY_DEPLOY_PROJECT_ID_BACKEND`: ID del proyecto Railway que contiene
  el servicio backend.
- `RAILWAY_DEPLOY_PROJECT_ID_FRONTEND`: ID del proyecto Railway que contiene
  el servicio frontend.

El workflow enlaza cada proyecto usando `railway link --project` y selecciona
el entorno `production` y el servicio correspondiente antes de desplegar.
Sube el repositorio desde su raíz; conserva `backend` o `frontend` como
directorio raíz de cada servicio en Railway.

No es necesario guardar `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` ni `CSRF_TRUSTED_ORIGINS` en GitHub. Deben configurarse como variables secretas en Railway para cada servicio.

El workflow de despliegue se activa cuando termina correctamente el workflow
`CI` para un push a `main`. Protege la rama `main` en GitHub y exige que pasen
los checks de los jobs `backend` y `frontend` antes de permitir integrar
cambios. Si el servicio está vinculado al repositorio de GitHub, desactiva el
despliegue automático de Railway para que no publique antes de que termine CI;
el despliegue debe realizarlo este workflow.

## 3. Variables del backend

Para el servicio backend, configura:

- `DJANGO_ENV=production`
- `SECRET_KEY=<secreto largo generado>`
- `DEBUG=False`
- `ALLOWED_HOSTS=<dominio-railway-del-backend>`
- `CORS_ALLOWED_ORIGINS=https://<dominio-railway-del-frontend>`
- `CSRF_TRUSTED_ORIGINS=https://<dominio-railway-del-frontend>`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` usando la variable vinculada del servicio PostgreSQL.

Railway inyectará `DATABASE_URL` y el backend utilizará automáticamente esa conexión.

## Almacenamiento de fotos de activos

Las fotos se guardan en el sistema de archivos del backend. Para conservarlas
entre despliegues, crea un **Volume** en Railway para el servicio backend,
móntalo en `/app/media` y agrega la variable:

- `MEDIA_ROOT=/app/media`

El volumen debe estar montado en el mismo servicio que ejecuta Django. Sin él,
los archivos locales pueden desaparecer al reemplazar la instancia. Las fotos
se consultan mediante la API autenticada; no se necesita configurar un dominio
público de archivos.

El proyecto no tiene flujos de envío de correo actualmente. Si se habilitan,
configura en Railway `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
`SMTP_PASSWORD` y el indicador TLS apropiado (`SMTP_USE_TLS` o
`SMTP_USE_SSL`). El backend usa consola en desarrollo y SMTP en producción
cuando se define `SMTP_HOST`.

## Seguridad de cuentas y roles

- Los usuarios dados de baja se desactivan con `is_active`; el inicio de sesión rechaza esas cuentas.
- La API de selección de responsables solo expone el ID y nombre completo de usuarios activos.
- Los permisos operativos de inventario, catálogos, revisión de solicitudes, aprobación y devoluciones se delegan por rol. El rol activo `Inventario` recibe estos permisos mediante la migración de base de datos. Solo el rol activo `Administrador` administra usuarios y roles. En Django Admin, el acceso sigue sujeto a los permisos de staff/superusuario.
- El login permite hasta 5 intentos por minuto; los límites generales son 100 peticiones anónimas por día y 1000 por usuario por día.
- El frontend aún guarda JWT en `localStorage`. Migrar a cookies `httpOnly`, `Secure` y con protección CSRF es una mejora pendiente; mientras tanto, el access token dura 20 minutos.

## 4. Variables del frontend

Para el servicio frontend, configura:

- `VITE_API_URL=https://<dominio-railway-del-backend>/api`
- `NODE_ENV=production`

La variable `VITE_API_URL` se utiliza en el build del frontend y debe
configurarse en las variables del servicio frontend de Railway. No es necesario
definirla como secreto si el dominio del backend es público.

## 5. Comandos de construcción y ejecución

### Backend

Si Railway está conectado al repositorio completo, configura `backend` como
directorio raíz del servicio. Usa el builder **Railpack** y configura este
comando de inicio:

```sh
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```

Configura como comando de construcción:

```sh
./.venv/bin/python manage.py collectstatic --noinput
```

WhiteNoise sirve los archivos estáticos recolectados, incluidos los de Django
Admin.

En las variables del servicio backend de Railway, agrega:

- `RAILPACK_DEPLOY_APT_PACKAGES=libreoffice-calc fonts-liberation`

Railpack espera la lista de paquetes separada por espacios. Se usa
`RAILPACK_DEPLOY_APT_PACKAGES` para que LibreOffice esté instalado en la imagen
final, donde se ejecuta Django; instalarlo solo durante la construcción no
estaría disponible al generar los PDF. Después de guardar la variable, vuelve a
desplegar el servicio para reconstruir la imagen. No hace falta configurar
`LIBREOFFICE_PATH`, porque `soffice` se encuentra en el `PATH`.

Si el servicio está configurado con el builder legado **Nixpacks**, cámbialo a
**Railpack** para que se aplique esta variable.

Railway expone el puerto mediante la variable `PORT`; el contenedor debe escuchar en ese puerto en lugar de fijar `8000`.

Configura `./.venv/bin/python manage.py migrate` como **Pre-deploy Command** del servicio
backend para aplicar las migraciones con el entorno de producción antes de
iniciar una nueva versión. Antes del primer despliegue, respalda PostgreSQL.
Después de migrar, crea la cuenta inicial de Django Admin desde el entorno
del servicio backend con `./.venv/bin/python manage.py createsuperuser`. Luego inicia
sesión en `/admin/` y asigna a esa cuenta el rol de aplicación `Administrador`;
el superusuario de Django no recibe ese rol automáticamente.

### Frontend

Configura el servicio frontend con el builder **Railpack** y `frontend` como
directorio raíz si el servicio está conectado al repositorio completo:

- Construcción: `npm ci && npm run build`
- Comando de inicio: `npm run preview -- --host 0.0.0.0 --port $PORT`

El comando de inicio publica el contenido de `dist/` en el puerto que Railway
asigna al servicio y permite navegar por las rutas de la aplicación.

## 6. Health check

El backend expone:

- `GET /health/` → devuelve `{"status": "ok"}`

La comprobación se puede configurar en Railway como health check HTTP usando el dominio del backend y la ruta `/health/`.

## 7. Dominio y HTTPS

1. En Railway, abre el servicio frontend y activa **Custom Domain**.
2. Configura el dominio deseado y sigue la validación DNS indicada por Railway.
3. Repite el proceso para el servicio backend si necesitas conseguir una URL pública propia.
4. Railway gestiona el certificado TLS. Django ya activa la redirección HTTPS
   en producción y usa el encabezado del proxy de Railway para reconocer HTTPS.

## 8. Rollback

1. En Railway, abre **Deployments**.
2. Selecciona la versión anterior lista para producción.
3. Haz clic en **Redeploy** para restaurar la versión anterior.
4. Revisa el health check `/health/` tras completar el rollback.
5. Si el problema continúa, limpia las variables del nuevo despliegue desde Railway y evita volver a desplegar hasta corregir la causa.

Cada despliegue debe ejecutarse con una revisión de Git, y el rollback debe volver a una revisión conocida antes de que aparezcan errores en producción.
