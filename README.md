# Soporte Sala

Sistema web de gestión de solicitudes de soporte técnico para la sala de cómputo.

## Tecnologías

- Backend: Node.js, Express y PostgreSQL.
- Base de datos: Neon PostgreSQL.
- Frontend: HTML, CSS y JavaScript puro.
- Autenticación: JWT y contraseñas protegidas con bcrypt.

## Requisitos

- Node.js 18 o superior.
- Una base de datos PostgreSQL (por ejemplo, Neon).

## Configuración

1. Entra a `backend`.
2. Instala dependencias con `npm install`.
3. Copia `backend/.env.example` como `backend/.env`.
4. Completa `DATABASE_URL` y `JWT_SECRET` en el archivo `.env`.
5. Verifica que el esquema de `database/schema.sql` esté aplicado en la base de datos.
6. Ejecuta `npm run seed` si necesitas crear los usuarios iniciales definidos por el script.
7. Inicia el servidor con `npm run dev`.
8. Abre `http://localhost:3000`.

El servidor Express sirve el frontend desde la carpeta `frontend`, por lo que la interfaz y la API usan el mismo origen.

## Roles

- `USUARIO`: registra solicitudes, consulta su seguimiento y agrega observaciones.
- `TECNICO`: consulta solicitudes asignadas, inicia su atención y registra soluciones.
- `SUPERVISOR`: consulta solicitudes, asigna técnicos, realiza seguimiento y consulta reportes.
- `ADMINISTRADOR`: administra usuarios, categorías, equipos y reportes, además de las funciones de supervisión.

## Módulos del frontend

- Inicio con indicadores según las solicitudes visibles para el rol.
- Solicitudes: registro, búsqueda, filtros, detalle, asignación, cambios de estado, observaciones e historial.
- Usuarios: creación, edición, activación y desactivación (administrador).
- Categorías y equipos: creación, edición y activación/desactivación (administrador).
- Reportes: indicadores, agrupaciones y exportación CSV (supervisor y administrador).
- Notificaciones: consulta y marcado como leídas.

## Pruebas

Desde `backend` ejecuta:

```bash
npm test
```

## Seguridad

No subas archivos `.env`, contraseñas, tokens ni cadenas de conexión a GitHub. Usa `.env.example` como plantilla y configura las credenciales reales únicamente en tu entorno local o en el servicio de despliegue.
