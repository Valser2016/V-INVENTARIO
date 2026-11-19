# Frontend de Valser Activos

Interfaz React para iniciar sesión, consultar el inventario y registrar activos.
Está construida con React, Vite y React Router; las solicitudes HTTP usan Axios.

## Requisitos

- Node.js 20 o superior.
- El backend Django disponible en una URL accesible.

## Desarrollo local

Desde esta carpeta:

```sh
npm ci
npm run dev
```

Vite muestra la dirección local en la terminal (por defecto
`http://localhost:5173`). Para apuntar a otro backend, crea `.env.local` aquí
con la URL base de la API:

```dotenv
VITE_API_URL=http://localhost:8000/api
```

La variable `VITE_API_URL` se incorpora al bundle durante el build; no incluyas
secretos en variables `VITE_*`.

## Validación y build

```sh
npm run lint
npm test
npm run build
```

Los archivos de producción se generan en `dist/`. En Railway, Railpack ejecuta
Vite Preview para servir ese directorio y atender las rutas de la aplicación de
página única.

Consulta el [README principal](../README.md) para iniciar localmente el backend,
PostgreSQL y frontend.
