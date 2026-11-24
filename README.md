# Valser Activos

Aplicación web para registrar y consultar activos: backend Django REST Framework,
frontend React y PostgreSQL.

## Requisitos

- Python 3.12+, Node.js 20+ y PostgreSQL.
- LibreOffice para generar localmente los PDF OYS-FO-09.

## Ejecución local

1. Inicia una instancia PostgreSQL y configura las variables del backend.
2. Instala dependencias y aplica migraciones:

   ```sh
   cd backend
   python -m venv .venv
   # Windows: .venv\Scripts\Activate.ps1
   # macOS/Linux: source .venv/bin/activate
   python -m pip install -r requirements.txt
   python manage.py migrate
   python manage.py runserver
   ```

3. En otra terminal, instala y ejecuta el frontend:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

   Si el backend no está en `http://localhost:8000`, define
   `VITE_API_URL` en `frontend/.env.local`, por ejemplo:
   `VITE_API_URL=http://localhost:8000/api`.

## Variables de entorno

Para ejecutar Django directamente, coloca las variables en `backend/.env`
(Django carga ese archivo automáticamente). Nunca guardes secretos reales en Git.

| Variable | Uso |
| --- | --- |
| `SECRET_KEY` | Clave secreta de Django. Obligatoria en producción. |
| `DJANGO_ENV` | Usa `production` para activar configuración de producción; de lo contrario se asume desarrollo. |
| `DEBUG` | Modo debug de Django; debe ser `False` en producción. |
| `DATABASE_URL` | URL completa de PostgreSQL. En producción se usa en lugar del grupo `DB_*`. |
| `DB_NAME` | Nombre de la base cuando no se usa `DATABASE_URL`. |
| `DB_USER` | Usuario de la base cuando no se usa `DATABASE_URL`. |
| `DB_PASSWORD` | Contraseña de la base cuando no se usa `DATABASE_URL`. |
| `DB_HOST` / `DB_PORT` | Host y puerto PostgreSQL; por defecto `localhost` y `5432`. |
| `ALLOWED_HOSTS` | Hosts permitidos por Django, separados por comas. |
| `CORS_ALLOWED_ORIGINS` | Orígenes web autorizados para CORS, separados por comas. |
| `CSRF_TRUSTED_ORIGINS` | Orígenes HTTPS de confianza para protección CSRF. |
| `VITE_API_URL` | URL base de la API usada al compilar/ejecutar el frontend. |

En producción configura **`DATABASE_URL` o las tres variables `DB_NAME`,
`DB_USER` y `DB_PASSWORD`, pero no ambos métodos**. Configura los secretos
directamente en la plataforma de despliegue. Consulta
[la guía de Railway](./docs/deployment-railway.md).

## Pruebas y validaciones

```sh
# Backend, desde backend/ y con su entorno Python activado
python manage.py test apps

# Frontend, desde frontend/
npm ci
npm run lint
npm test
npm run build
```

La integración continua ejecuta estas validaciones para pushes y pull requests.

## Préstamos y devoluciones

El módulo permite asociar varios activos a un préstamo, incluso si el receptor
no tiene cuenta de usuario. Para habilitarlo, crea en **Configuración > Estados**
un estado activo llamado **En servicio** o **Prestado** (sin permitir nuevos préstamos) y verifica
que el estado **Disponible** permita préstamo. Las fechas previstas deben ser
posteriores al día actual. Al devolver, se registra por activo su condición,
observación, estado y ubicación. Antes de guardar la devolución, Almacén revisa
un resumen del checklist y confirma los datos.

Después de actualizar el proyecto, aplica las migraciones con
`python manage.py migrate` desde `backend/`. **Préstamos** y **Solicitudes**
comparten el flujo de aprobación: crear una solicitud no registra el préstamo
ni cambia el estado de los activos. Se pueden incluir activos del inventario y
consumibles independientes en una misma solicitud. Almacén completa el checklist
físico de cada activo como **Bueno** o **Malo**, puede excluir de la salida uno
que no esté en condiciones y genera el PDF previo. Si la solicitud solo contiene
consumibles, Almacén la valida sin checklist de activos. Administración y los
usuarios con permiso de revisión pueden aprobar; Administración y los usuarios
con permiso de aprobación pueden rechazar. Al aprobar, el sistema vuelve a
comprobar la disponibilidad, crea el préstamo con sus activos y consumibles, y
actualiza el inventario.

Las solicitudes piden el cliente y un consecutivo global no repetido. Al
aprobarse, se guarda el PDF OYS-FO-09 de salida; al confirmar la devolución de
todos sus elementos, se genera por separado el PDF de retorno con cantidad
recibida, condición, estado, observaciones y usuario de almacén. Los consumibles
aparecen en la salida junto con su cantidad y su devolución conserva la cantidad
recibida. La salida puede descargarse como PDF previo antes de la aprobación;
al confirmar la devolución de todos los elementos, el navegador descarga
automáticamente el PDF actualizado. Ambos formatos conservan el logo, usan fechas
`AAAA-MM-DD` y expresan la condición física como **Bueno** o **Malo**.
Administración asigna por separado los permisos de **Modificar inventario**,
**Administrar catálogos**, **Revisar checklist y generar PDF previo**,
**Aprobar o rechazar solicitudes** y **Registrar devoluciones**. El rol existente
**Inventario** recibe esos permisos operativos al aplicar las migraciones, pero
no puede administrar usuarios ni roles. Otros roles solo reciben las capacidades
que se les asignen.

Administración puede eliminar permanentemente solicitudes y préstamos de prueba.
Al eliminar un préstamo también se borran la solicitud vinculada, sus detalles y
formatos PDF; los activos que sigan prestados recuperan su estado y ubicación
anteriores, y los ya devueltos conservan su estado actual.

Los PDF se generan rellenando la hoja `LISTADO` de la plantilla y convirtiéndola
con LibreOffice. Se usa el Excel versionado en la raíz del proyecto
`OYS-FO-09 LISTADO DE HERRAMIENTAS PARA SERVICIOS (8).xlsx`, tanto localmente
como en Railway. Si ese archivo no está disponible, se usa la copia incluida en
`backend/apps/movimientos/OYS-FO-09.xlsx`. Para seleccionar otro Excel,
configura `OYS_TEMPLATE_PATH`. El logo se incorpora como PNG para que también
aparezca en la conversión a PDF. En Windows puedes instalar LibreOffice con:

```powershell
winget install --id TheDocumentFoundation.LibreOffice --exact
```

Si no se detecta automáticamente, configura la ruta al ejecutable en
PowerShell antes de iniciar Django:

```powershell
$env:LIBREOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
```

En Railway, sigue la guía de despliegue para instalar LibreOffice en el servicio
backend. La plantilla trae 30 filas para herramientas; si una solicitud supera
ese límite, el sistema agrega filas, repite el encabezado y extiende el área de
impresión para no omitir activos.

## Usuarios, permisos y reportes

Solo los usuarios con rol **Administrador** (o superusuario de Django sin un rol
activo asignado) pueden administrar usuarios y roles. La administración de
catálogos y las operaciones de inventario y préstamos se delegan mediante
permisos independientes. El permiso de movimientos permite enviar solicitudes;
la aprobación, revisión del checklist y registro de devoluciones son permisos
separados. Al devolver el último activo del préstamo, se descarga el PDF
actualizado de retorno. Un rol activo distinto de Administrador prevalece sobre
la marca de superusuario dentro de la aplicación; una cuenta sin rol puede usar
su condición de superusuario para administrar la aplicación. Las cuentas se
desactivan en vez de eliminarse para conservar el historial.

El módulo **Reportes** incluye inventario por estado/categoría/ubicación,
préstamos, vencimientos e historial de devoluciones, con exportación a Excel y
PDF. Desde `backend/`, después de actualizar el proyecto, instala las
dependencias y aplica las migraciones:

```sh
python -m pip install -r requirements.txt
python manage.py migrate
```
