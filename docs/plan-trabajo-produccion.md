# Plan de trabajo para producción

## Objetivo

Preparar la aplicación para una entrega de producción segura, verificable y reversible, sin ejecutar despliegues ni publicar secretos en el repositorio.

## Regla general

Cada acción debe ejecutarse con un prompt independiente. El resultado esperado debe quedar documentado antes de pasar a la siguiente tarea.

---

## Fase 1: Validación del entorno de producción

### Prompt 1.1 — Configurar el entorno de Railway

> Configura un proyecto nuevo de Railway con dos servicios independientes: backend y frontend. Añade PostgreSQL como servicio de base de datos. Configura las variables del servicio backend y frontend únicamente mediante las herramientas de Railway. No añadas secretos al repositorio ni al archivo de configuración.

**Evidencia requerida:**

- Servicios backend, frontend y PostgreSQL visibles en Railway.
- Las variables de entorno se gestionan desde Railway.
- No existen credenciales reales en el repositorio.

### Prompt 1.2 — Validar variables protegidas

> Revisa los secretos y variables necesarias para producción: `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `DJANGO_ENV`, `DEBUG` y `VITE_API_URL`. Confirma que no contienen valores de desarrollo y que no se exponen en GitHub, logs ni archivos de configuración.

**Evidencia requerida:**

- Lista de variables protegidas configuradas en Railway.
- Valores de producción sustituyen los valores locales.
- No aparecen secretos en el contenido del repositorio.

### Prompt 1.3 — Validar HTTPS y dominio

> Comprueba que el frontend y el backend tengan dominio configurado en Railway, certificados HTTPS válidos y redirección HTTPS habilitada. Verifica que el navegador muestre un certificado válido y que no haya tráfico HTTP abierto.

**Evidencia requerida:**

- HTTPS activo en frontend y backend.
- Certificado válido.
- Redirección HTTPS verificada.
- Dominio registrado y accesible.

---

## Fase 2: Validación del backend

### Prompt 2.1 — Validar health check

> Accede a `https://DOMINIO_BACKEND/health/` mediante HTTP. Confirma que devuelve HTTP 200, el contenido JSON `{"status":"ok"}` y no incluye trazas, detalles internos o credenciales.

**Evidencia requerida:**

- HTTP 200.
- JSON válido.
- Sin traceback ni errores internos.

### Prompt 2.2 — Verificar base de datos

> Comprueba la conexión entre el backend y PostgreSQL mediante una petición real a la API. Ejecuta una operación de lectura y escritura válida, valida el registro creado y confirma que los cambios persisten en la base de datos.

**Evidencia requerida:**

- Operación API exitosa.
- Registro persistido.
- No se producen errores de conexión.
- Log del servicio sin credenciales ni URL completa de PostgreSQL.

### Prompt 2.3 — Ejecutar migraciones de producción

> Ejecuta las migraciones de Django en el entorno de producción y verifica que no haya migraciones pendientes. Si la aplicación usa una compilación o despliegue de Railway, ejecuta el comando de migración durante el proceso de despliegue y no desde una terminal local con credenciales de producción.

**Evidencia requerida:**

- Migraciones ejecutadas correctamente.
- Resultado `No migrations to apply` o migraciones aplicadas sin errores.
- Registro de migración sin secretos.

### Prompt 2.4 — Verificar JWT

> Prueba la autenticación JWT contra el backend de producción. Realiza login válido, login inválido, refresh válido, refresh inválido, solicitud autenticada sin token y solicitud autenticada con token expirado. Registra el código HTTP y el resultado obtenido.

**Evidencia requerida:**

- Login válido devuelve access y refresh.
- Login inválido devuelve HTTP 401.
- Refresh válido funciona.
- Refresh inválido devuelve HTTP 401.
- Petición sin token devuelve HTTP 401.
- Token expirado devuelve HTTP 401.
- Los tokens no aparecen en logs.

### Prompt 2.5 — Validar seguridad de CORS y CSRF

> Desde el dominio frontend, realiza una petición autorizada al backend. Después intenta abrir una petición desde un origen no autorizado. Confirma que el origen permitido funciona y que el origen rechazado recibe un error HTTP de CORS o una respuesta segura.

**Evidencia requerida:**

- Origen permitido: acceso correcto.
- Origen no permitido: bloqueado.
- No aparecen secretos ni trazas en la respuesta.

---

## Fase 3: Validación del frontend

### Prompt 3.1 — Verificar carga del frontend

> Abre el dominio frontend con un navegador. Confirma que la página carga, se muestra el formulario de login y todos los recursos principales responden con HTTP 200. Comprueba que no haya errores de JavaScript en la consola.

**Evidencia requerida:**

- Página cargada sin errores.
- Recursos principales disponibles.
- No aparecen errores 404 ni 500.
- Sin fallos en consola.

### Prompt 3.2 — Verificar configuración de API

> Comprueba que el frontend utiliza únicamente `VITE_API_URL` configurado para producción. Comprueba que la URL del backend apunta al dominio HTTPS correcto y no a `localhost`, una IP local o una URL de desarrollo.

**Evidencia requerida:**

- `VITE_API_URL` apunta al backend de producción.
- La configuración usada por el navegador corresponde al dominio correcto.
- No hay rutas locales en producción.

### Prompt 3.3 — Validar flujo completo

> Inicia sesión desde el frontend, crea un activo, consulta la lista y cierra sesión. Confirma que la interfaz muestra los errores esperados y que el contenido se actualiza correctamente.

**Evidencia requerida:**

- Login exitoso.
- Acceso a rutas protegidas.
- Creación exitosa del activo.
- Consulta correcta.
- Cierre de sesión correcto.
- Tokens eliminados del navegador después de cerrar sesión.

---

## Fase 4: Validación de archivos estáticos

### Prompt 4.1 — Revisar archivos estáticos del backend

> Solicita archivos estáticos del backend, incluyendo CSS, imágenes y archivos administrativos. Confirma que todos responden con HTTP 200 y los tipos de contenido correctos.

**Evidencia requerida:**

- HTTP 200 para los archivos solicitados.
- Content-Type correcto.
- Cache-Control configurado cuando sea apropiado.

### Prompt 4.2 — Revisar archivos compilados del frontend

> Solicita los principales recursos compilados del frontend mediante la URL pública. Confirma que los assets existen, se cargan correctamente y no presentan errores de contenido o rutas incorrectas.

**Evidencia requerida:**

- Archivos disponibles.
- Sin errores 404.
- Assets cargados desde URLs válidas.

---

## Fase 5: Seguridad y registro de eventos

### Prompt 5.1 — Revisar trazas y secretos en logs

> Revisa los logs de backend y frontend. Busca contraseñas, tokens JWT, `DATABASE_URL`, claves API, rutas internas, stack traces, correos electrónicos, nombres de usuarios o datos sensibles. Elimina cualquier valor confidencial antes de compartir los registros.

**Evidencia requerida:**

- No aparecen secretos en los logs.
- No aparecen valores de producción sensibles.
- Errores visibles se reducen a mensajes sin información interna.

### Prompt 5.2 — Revisar respuesta de errores

> Solicita rutas inexistentes, errores de autenticación y errores de validación. Comprueba que el sistema devuelve respuestas controladas, sin trazas, sin información interna y sin contenido sensible.

**Evidencia requerida:**

- HTTP 400, 401 o 404 apropiados.
- Mensajes seguros para el usuario.
- Sin traceback ni detalles internos.

### Prompt 5.3 — Verificar gestión de privilegios

> Comprueba que un usuario no administrador no puede acceder a la administración, modificar datos protegidos, cambiar otros usuarios ni ejecutar operaciones administrativas. Verifica también que las rutas API protegidas requieren autenticación.

**Evidencia requerida:**

- Admin bloqueado para usuarios no autorizados.
- API protegida requiere token.
- Operaciones sensibles requieren privilegios correctos.

---

## Fase 6: Despliegue y rollback

### Prompt 6.1 — Ejecutar despliegue

> Despliega la revisión aprobada en Railway usando el workflow de GitHub Actions. No ejecutes comandos desplegables manualmente desde una terminal local. Usa únicamente las variables protegidas configuradas en el entorno de GitHub.

**Evidencia requerida:**

- Workflow completado sin errores.
- Backend y frontend desplegados.
- Health check funcional después del despliegue.
- Logs de despliegue revisados.

### Prompt 6.2 — Validar inmediatamente después del despliegue

> Después de cada despliegue, verifica HTTPS, health check, frontend, JWT, CORS, base de datos y archivos estáticos. No se considera desplegado si alguna comprobación falla.

**Evidencia requerida:**

- Resultado de cada prueba registrado.
- Versiones desplegadas identificadas.
- Errores corregidos antes de dar el sistema como disponible.

### Prompt 6.3 — Ejecutar rollback

> Si alguna comprobación de producción falla, restaura la revisión anterior desde Railway y verifica nuevamente el health check, JWT, base de datos y frontend. No despliegues nuevas versiones hasta corregir la causa.

**Evidencia requerida:**

- Versión anterior restaurada.
- Aplicación disponible nuevamente.
- Health check correcto.
- Base de datos intacta.
- Registro del incidente y de la corrección.

---

## Checklist final de aceptación

### Funcionalidad

- [ ] El frontend carga correctamente.
- [ ] El backend responde vía HTTPS.
- [ ] El health check devuelve HTTP 200.
- [ ] El health check devuelve `{"status":"ok"}`.
- [ ] JWT funciona en login, refresh y autenticación.
- [ ] La base de datos está conectada y recibe cambios.
- [ ] Las migraciones se ejecutan correctamente.
- [ ] Los archivos estáticos responden correctamente.
- [ ] El flujo de creación y consulta de activos funciona.
- [ ] El cierre de sesión elimina los tokens.

### Seguridad

- [ ] HTTPS válido en frontend y backend.
- [ ] Certificado TLS válido.
- [ ] CORS restringido al frontend autorizado.
- [ ] CSRF protegido.
- [ ] Secretos no están en el repositorio.
- [ ] No aparecen secretos, tokens ni contraseñas en logs.
- [ ] Los errores no exponen trazas ni información interna.
- [ ] Los permisos están correctamente restringidos.
- [ ] Usuarios no autorizados no pueden acceder a administración.

### Operación

- [ ] El workflow de despliegue funciona.
- [ ] Las variables de producción están configuradas.
- [ ] La aplicación está disponible públicamente.
- [ ] La aplicación responde dentro de los tiempos esperados.
- [ ] Existe un procedimiento de rollback documentado.
- [ ] Hay evidencia de cada prueba ejecutada.
- [ ] Hay evidencia del resultado del despliegue.
- [ ] El equipo acepta el cierre de la release.

---

## Criterio de cierre

La producción quedará aprobada únicamente si todas las comprobaciones funcionales, de seguridad, de base de datos, de logs y de despliegue están en verde y se registra cada resultado.
