const oracledb = require('oracledb');
const db = require('../config/db');
const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };

exports.listarSalas = async (_req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const rs = await cn.execute(
      `SELECT ID_SALA   AS "id",
        NOMBRE    AS "nombre",
        CAPACIDAD AS "capacidad"
        FROM SALAS
        ORDER BY NOMBRE`,
      {},
      OUT_OBJ
    );
    res.json(rs.rows || []);
  } catch (e) {
    console.error('listarSalas', e);
    res.status(500).json({ message: 'Error al listar salas' });
  } finally { try{ if(cn) await cn.close(); } catch{} }
};

exports.crearSala = async (req, res) => {
  let cn;
  try {
    const { nombre, capacidad } = req.body;
    if (!nombre || Number(capacidad) <= 0)
      return res.status(400).json({ message: 'Nombre y capacidad válidos requeridos' });

    cn = await db.getConnection();

    const dup = await cn.execute(
      `SELECT COUNT(*) AS T FROM SALAS WHERE UPPER(NOMBRE)=UPPER(:n)`,
      { n: nombre }, OUT_OBJ
    );
    if (dup.rows[0].T > 0)
      return res.status(409).json({ message: 'Ya existe una sala con ese nombre' });

    const r = await cn.execute(
      `INSERT INTO SALAS (NOMBRE, CAPACIDAD)
       VALUES (:n, :c)
       RETURNING ID_SALA INTO :outId`,
      { n: nombre, c: Number(capacidad), outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      { autoCommit: true }
    );
    res.status(201).json({ id: r.outBinds.outId[0], nombre, capacidad: Number(capacidad) });
  } catch (e) {
    console.error('crearSala', e);
    res.status(500).json({ message: 'Error al crear sala' });
  } finally { try{ if(cn) await cn.close(); } catch{} }
};

exports.actualizarSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { nombre, capacidad } = req.body;
    if (!id || !nombre || Number(capacidad) <= 0)
      return res.status(400).json({ message: 'Datos inválidos' });

    cn = await db.getConnection();

    const dup = await cn.execute(
      `SELECT COUNT(*) AS T FROM SALAS
        WHERE UPPER(NOMBRE)=UPPER(:n) AND ID_SALA<>:id`,
      { n: nombre, id }, OUT_OBJ
    );
    if (dup.rows[0].T > 0)
      return res.status(409).json({ message: 'Ya existe una sala con ese nombre' });

    await cn.execute(
      `UPDATE SALAS SET NOMBRE=:n, CAPACIDAD=:c WHERE ID_SALA=:id`,
      { n: nombre, c: Number(capacidad), id },
      { autoCommit: true }
    );
    res.json({ id, nombre, capacidad: Number(capacidad) });
  } catch (e) {
    console.error('actualizarSala', e);
    res.status(500).json({ message: 'Error al actualizar sala' });
  } finally { try{ if(cn) await cn.close(); } catch{} }
};

exports.eliminarSala = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    cn = await db.getConnection();

    const dep = await cn.execute(
      `SELECT COUNT(*) AS T FROM FUNCIONES WHERE ID_SALA=:id`,
      { id }, OUT_OBJ
    );
    if (dep.rows[0].T > 0)
      return res.status(409).json({ message: 'No se puede eliminar: la sala tiene funciones asignadas' });

    await cn.execute(`DELETE FROM SALAS WHERE ID_SALA=:id`, { id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (e) {
    console.error('eliminarSala', e);
    res.status(500).json({ message: 'Error al eliminar sala' });
  } finally { try{ if(cn) await cn.close(); } catch{} }
};
