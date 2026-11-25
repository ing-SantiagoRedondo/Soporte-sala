// Pruebas de administración (RF02, RF03) y reportes (RF11).
// Requisitos: servidor corriendo y usuarios creados (npm run seed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { api, login } from './helpers.js';

test('administración y reportes', async (t) => {
  const sufijo = Date.now();
  let admin, supervisor, usuario, tecA, tecB, solicitudId;

  await t.test('preparación: logins y un usuario común', async () => {
    admin = await login('admin@soporte.com', 'Admin12345');
    supervisor = await login('supervisor@soporte.com', 'Supervisor12345');
    const correo = `comun${sufijo}@correo.com`;
    const r = await api('/auth/registro', { metodo: 'POST', body: { nombre: 'Común', correo, password: '12345678' } });
    assert.equal(r.status, 201);
    usuario = await login(correo, '12345678');
  });

  await t.test('un usuario común no accede a administración ni reportes', async () => {
    assert.equal((await api('/usuarios', { token: usuario.token })).status, 403);
    assert.equal((await api('/admin/categorias', { token: usuario.token })).status, 403);
    assert.equal((await api('/reportes/resumen', { token: usuario.token })).status, 403);
  });

  await t.test('el administrador crea usuarios con rol y se validan los datos', async () => {
    const crear = (nombre, correo, extra = {}) => api('/usuarios', {
      metodo: 'POST', token: admin.token,
      body: { nombre, correo, password: 'Clave12345', rol: 'TECNICO', ...extra },
    });
    const a = await crear('Técnico A', `teca${sufijo}@soporte.com`);
    const b = await crear('Técnico B', `tecb${sufijo}@soporte.com`);
    assert.equal(a.status, 201);
    assert.equal(a.data.rol, 'TECNICO');
    tecA = a.data;
    tecB = b.data;

    assert.equal((await crear('Dup', `teca${sufijo}@soporte.com`)).status, 409);
    assert.equal((await crear('Débil', `debil${sufijo}@soporte.com`, { password: '123' })).status, 400);
    assert.equal((await crear('Rol malo', `malo${sufijo}@soporte.com`, { rol: 'ROOT' })).status, 400);
  });

  await t.test('el administrador no puede quitarse su propio rol ni desactivarse', async () => {
    const rol = await api(`/usuarios/${admin.usuario.id}`, { metodo: 'PATCH', token: admin.token, body: { rol: 'USUARIO' } });
    assert.equal(rol.status, 409);
    const off = await api(`/usuarios/${admin.usuario.id}`, { metodo: 'PATCH', token: admin.token, body: { activo: false } });
    assert.equal(off.status, 409);
  });

  await t.test('un usuario desactivado ya no puede iniciar sesión', async () => {
    const r = await api(`/usuarios/${tecA.id}`, { metodo: 'PATCH', token: admin.token, body: { activo: false } });
    assert.equal(r.status, 200);
    assert.equal(r.data.activo, false);
    const intento = await api('/auth/login', { metodo: 'POST', body: { correo: tecA.correo, password: 'Clave12345' } });
    assert.equal(intento.status, 401);
  });

  await t.test('un técnico con solicitudes abiertas no puede desactivarse', async () => {
    const cats = await api('/catalogos/categorias', { token: usuario.token });
    const sol = await api('/solicitudes', {
      metodo: 'POST', token: usuario.token,
      body: { categoria_id: cats.data[0].id, descripcion: 'Prueba de reportes', prioridad: 'BAJA' },
    });
    assert.equal(sol.status, 201);
    solicitudId = sol.data.id;

    const asig = await api(`/solicitudes/${solicitudId}/asignar`, {
      metodo: 'PATCH', token: admin.token, body: { responsable_id: tecB.id },
    });
    assert.equal(asig.status, 200);

    const off = await api(`/usuarios/${tecB.id}`, { metodo: 'PATCH', token: admin.token, body: { activo: false } });
    assert.equal(off.status, 409);
  });

  await t.test('categorías: crear, duplicado y desactivar', async () => {
    const nombre = `Categoría ${sufijo}`;
    const c = await api('/admin/categorias', { metodo: 'POST', token: admin.token, body: { nombre, descripcion: 'Prueba' } });
    assert.equal(c.status, 201);
    assert.equal((await api('/admin/categorias', { metodo: 'POST', token: admin.token, body: { nombre } })).status, 409);

    const off = await api(`/admin/categorias/${c.data.id}`, { metodo: 'PATCH', token: admin.token, body: { activa: false } });
    assert.equal(off.status, 200);
    const activas = await api('/catalogos/categorias', { token: usuario.token });
    assert.ok(!activas.data.some((x) => x.id === c.data.id));
  });

  await t.test('equipos: crear y editar', async () => {
    const e = await api('/admin/equipos', {
      metodo: 'POST', token: admin.token, body: { codigo: `PC-${sufijo}`, tipo: 'PC', ubicacion: 'Sala 2' },
    });
    assert.equal(e.status, 201);
    const mal = await api('/admin/equipos', { metodo: 'POST', token: admin.token, body: { codigo: `X-${sufijo}`, tipo: 'NAVE' } });
    assert.equal(mal.status, 400);
    const ed = await api(`/admin/equipos/${e.data.id}`, { metodo: 'PATCH', token: admin.token, body: { ubicacion: 'Sala 3' } });
    assert.equal(ed.data.ubicacion, 'Sala 3');
  });

  await t.test('reportes: resumen y listado con filtros', async () => {
    const r = await api('/reportes/resumen', { token: supervisor.token });
    assert.equal(r.status, 200);
    assert.ok(r.data.total >= 1);
    for (const clave of ['por_estado', 'por_categoria', 'por_prioridad', 'por_responsable']) {
      assert.ok(Array.isArray(r.data[clave]), `falta ${clave}`);
    }

    const lista = await api(`/reportes/solicitudes?estado=ASIGNADA&responsable_id=${tecB.id}`, { token: supervisor.token });
    assert.equal(lista.status, 200);
    assert.equal(lista.data.length, 1);
    assert.equal(lista.data[0].id, solicitudId);

    const rango = await api('/reportes/resumen?desde=2020-01-01&hasta=2099-12-31', { token: admin.token });
    assert.equal(rango.status, 200);
  });

  await t.test('reportes: filtros inválidos se rechazan', async () => {
    assert.equal((await api('/reportes/resumen?desde=hoy', { token: supervisor.token })).status, 400);
    assert.equal((await api('/reportes/resumen?estado=INVENTADO', { token: supervisor.token })).status, 400);
    assert.equal((await api('/reportes/solicitudes?categoria_id=abc', { token: supervisor.token })).status, 400);
  });
});
