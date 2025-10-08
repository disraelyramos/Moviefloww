const oracledb = require('oracledb');
const db = require('../config/db');

const OUT_OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const toMinutes = (hhmm) => {
const [h, m] = String(hhmm).split(':').map(Number);
return (h || 0) * 60 + (m || 0);
};

/** GET /api/funciones/select-data
 * *  Catálogos para el modal: películas, salas, formatos, idiomas
*/
exports.getSelectData = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();

    // 👇 Nota: alias entre comillas para mantener nombres en minúsculas
    const [pelis, salas, formatos, idiomas] = await Promise.all([
      cn.execute(
        `SELECT
           ID_PELICULA       AS "id",
           TITULO            AS "titulo",
           DURACION_MINUTOS  AS "duracion"
         FROM PELICULA
         ORDER BY TITULO`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      cn.execute(
        `SELECT
           ID_SALA    AS "id",
           NOMBRE     AS "nombre",
           CAPACIDAD  AS "capacidad"
         FROM SALAS
         ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      cn.execute(
        `SELECT
           ID_FORMATO AS "id",
           NOMBRE     AS "nombre"
         FROM FORMATO
         ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      cn.execute(
        `SELECT
           ID_IDIOMA  AS "id",
           NOMBRE     AS "nombre"
         FROM IDIOMAS
         ORDER BY NOMBRE`,
        [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
    ]);

    res.json({
      peliculas: pelis.rows,  // [{ id, titulo, duracion }]
      salas: salas.rows,      // [{ id, nombre, capacidad }]
      formatos: formatos.rows,// [{ id, nombre }]
      idiomas: idiomas.rows,  // [{ id, nombre }]
    });
  } catch (e) {
    console.error('select-data funciones ->', e);
    res.status(500).json({ message: 'Error al cargar catálogos' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

/** GET /api/funciones?fecha=YYYY-MM-DD (opcional) */
exports.listarFunciones = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const fecha = (req.query.fecha || '').trim();
    const where = [];
    const bind = {};
    if (fecha) { where.push(`f.FECHA = TO_DATE(:fecha,'YYYY-MM-DD')`); bind.fecha = fecha; }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const sql = `
            SELECT
            f.ID_FUNCION AS "id",
            f.ID_PELICULA AS "peliculaId",
            f.ID_SALA     AS "salaId",
            f.ID_FORMATO  AS "formatoId",
            f.ID_IDIOMA   AS "idiomaId",

            TO_CHAR(f.FECHA,'YYYY-MM-DD') AS "fecha",
            TO_CHAR(f.FECHA + f.HORA_INICIO,'HH24:MI') AS "horaInicio",
            TO_CHAR(
            f.FECHA + f.HORA_FINAL
            + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                    THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END,
            'HH24:MI'
            ) AS "horaFinal",
            CASE WHEN f.HORA_FINAL <= f.HORA_INICIO THEN 1 ELSE 0 END AS "overnight",

            f.PRECIO AS "precio",

            p.TITULO AS "peliculaTitulo",
            CASE WHEN p.IMAGEN_URL IS NULL THEN NULL
                ELSE DBMS_LOB.SUBSTR(p.IMAGEN_URL, 4000, 1) END AS "imagenUrl",

            fo.NOMBRE AS "formato",
            i.NOMBRE  AS "idioma"

            FROM FUNCIONES f
            JOIN PELICULA p ON p.ID_PELICULA = f.ID_PELICULA
            JOIN FORMATO fo ON fo.ID_FORMATO = f.ID_FORMATO
            JOIN IDIOMAS i  ON i.ID_IDIOMA   = f.ID_IDIOMA
            ${whereSql}
            ORDER BY f.FECHA, f.ID_SALA, f.HORA_INICIO
        `;
    const r = await cn.execute(sql, bind, OUT_OBJ);
    res.json(r.rows);
  } catch (e) {
    console.error('listar funciones ->', e);
    res.status(500).json({ message: 'Error al listar funciones' });
  } finally { try { if (cn) await cn.close(); } catch {} }
    };

    /** POST /api/funciones
     *  body: { id_pelicula, id_sala, id_formato, id_idioma, fecha:'YYYY-MM-DD', horaInicio:'HH:MM', horaFinal:'HH:MM', precio }
     */
exports.crearFuncion = async (req, res) => {
  let cn;
  try {
    const { id_pelicula, id_sala, id_formato, id_idioma, fecha, horaInicio, horaFinal, precio } = req.body;
    if (!id_pelicula || !id_sala || !id_formato || !id_idioma)
      return res.status(400).json({ message: 'Faltan campos' });
    if (!fecha || !horaInicio || !horaFinal)
      return res.status(400).json({ message: 'Fecha y horas son obligatorias' });

    const iniMin = toMinutes(horaInicio);      // 0..1439
    const finMin = toMinutes(horaFinal);       // 0..1439
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin; // si fin <= ini -> día siguiente
    const dur = finAdj - iniMin;               // duración en minutos

    if (dur <= 0 || dur > 1440)
      return res.status(400).json({ message: 'Duración inválida' });

    cn = await db.getConnection();

    // --- Validar solape en SALA/FECHA considerando overnight ---
    // Instante de inicio y fin de la función nueva
    const newStart = `
      (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
    `;
    const newEnd = `
      (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
    `;

    const solape = await cn.execute(
      `
      SELECT COUNT(*) AS "T"
        FROM FUNCIONES f
       WHERE f.ID_SALA = :id_sala
         AND (
           -- inicio/fin existentes ajustados si cruzan medianoche
           NOT (
             (
               (f.FECHA + f.HORA_FINAL + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
               <= ${newStart}
             )
             OR
             (
               (f.FECHA + f.HORA_INICIO)
               >= ${newEnd}
             )
           )
         )
         AND f.FECHA = TO_DATE(:fecha,'YYYY-MM-DD')
      `,
      { id_sala: Number(id_sala), fecha, iniMin, finAdj },  // ojo: usamos finAdj
      OUT_OBJ
    );
    if (solape.rows[0].T > 0)
      return res.status(409).json({ message: 'La sala ya tiene una función que se solapa en ese horario' });

    // --- Insert ---
    const r = await cn.execute(
      `
      INSERT INTO FUNCIONES (
        ID_PELICULA, ID_SALA, ID_FORMATO, ID_IDIOMA,
        FECHA, HORA_INICIO, HORA_FINAL, PRECIO
      ) VALUES (
        :id_pelicula, :id_sala, :id_formato, :id_idioma,
        TO_DATE(:fecha,'YYYY-MM-DD'),
        NUMTODSINTERVAL(:iniMin,'MINUTE'),
        NUMTODSINTERVAL(:finMin,'MINUTE'),   -- guardamos HH:MM del día, sin +1 día
        :precio
      )
      RETURNING ID_FUNCION INTO :outId
      `,
      {
        id_pelicula: Number(id_pelicula),
        id_sala: Number(id_sala),
        id_formato: Number(id_formato),
        id_idioma: Number(id_idioma),
        fecha,
        iniMin, finMin,                          // almacenamos finMin “puro”
        precio: Number(precio),
        outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    res.status(201).json({
      id: r.outBinds.outId[0],
      id_pelicula: Number(id_pelicula),
      id_sala: Number(id_sala),
      id_formato: Number(id_formato),
      id_idioma: Number(id_idioma),
      fecha,
      hora_inicio: horaInicio,
      hora_final: horaFinal,
      precio: Number(precio)
    });

  } catch (e) {
    console.error('crear función ->', e);
    res.status(500).json({ message: 'Error al crear función' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

exports.crearFuncionesMasivas = async (req, res) => {
  let cn;
  try {
    const {
      id_pelicula, id_sala, id_formato, id_idioma,
      fechas,             // Array explícito ['YYYY-MM-DD', ...]
      horaInicio, horaFinal,
      precio,
      allOrNothing = false // si true: todo o nada (rollback si hay algún conflicto)
    } = req.body;

    if (!id_pelicula || !id_sala || !id_formato || !id_idioma)
      return res.status(400).json({ message: 'Faltan campos' });
    if (!Array.isArray(fechas) || !fechas.length)
      return res.status(400).json({ message: 'Debes enviar al menos una fecha' });
    if (!horaInicio || !horaFinal)
      return res.status(400).json({ message: 'Fecha(s) y horas son obligatorias' });

    const iniMin = toMinutes(horaInicio);
    const finMin = toMinutes(horaFinal);
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin; // permitir overnight
    const dur = finAdj - iniMin;
    if (dur <= 0 || dur > 1440) return res.status(400).json({ message: 'Duración inválida' });

    // Pequeño límite de seguridad (evitar bombear miles de inserts por error)
    if (fechas.length > 200) {
      return res.status(413).json({ message: 'Demasiadas fechas (máx 200 por lote)' });
    }

    cn = await db.getConnection();
    await cn.execute('BEGIN NULL; END;'); // asegura una tx abierta

    const OK = [];
    const CONFLICTOS = [];
    const ERRORES = [];

    // misma validación de solape que en crearFuncion (1 a 1)
    for (const fecha of fechas) {
      try {
        const solape = await cn.execute(
          `
          SELECT COUNT(*) AS "T"
            FROM FUNCIONES f
           WHERE f.ID_SALA = :id_sala
             AND f.FECHA   = TO_DATE(:fecha,'YYYY-MM-DD')
             AND NOT (
               (f.FECHA + f.HORA_FINAL
                  + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO
                         THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
                 <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
               OR
               (f.FECHA + f.HORA_INICIO)
                 >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
             )
          `,
          { id_sala: Number(id_sala), fecha, iniMin, finAdj },
          OUT_OBJ
        );

        if (solape.rows[0].T > 0) {
          CONFLICTOS.push({ fecha, reason: 'solape' });
          if (allOrNothing) {
            await cn.rollback();
            return res.status(409).json({ created: [], conflicts: CONFLICTOS, errors: ERRORES, message: 'Conflictos detectados (allOrNothing)' });
          }
          continue;
        }

        // Insert
        const r = await cn.execute(
          `
          INSERT INTO FUNCIONES (
            ID_PELICULA, ID_SALA, ID_FORMATO, ID_IDIOMA,
            FECHA, HORA_INICIO, HORA_FINAL, PRECIO
          ) VALUES (
            :id_pelicula, :id_sala, :id_formato, :id_idioma,
            TO_DATE(:fecha,'YYYY-MM-DD'),
            NUMTODSINTERVAL(:iniMin,'MINUTE'),
            NUMTODSINTERVAL(:finMin,'MINUTE'),
            :precio
          )
          RETURNING ID_FUNCION INTO :outId
          `,
          {
            id_pelicula: Number(id_pelicula),
            id_sala: Number(id_sala),
            id_formato: Number(id_formato),
            id_idioma: Number(id_idioma),
            fecha,
            iniMin, finMin,
            precio: Number(precio),
            outId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
          },
          { autoCommit: false }
        );

        OK.push({ fecha, id: r.outBinds.outId[0] });
      } catch (e) {
        ERRORES.push({ fecha, reason: e?.message || 'error' });
        if (allOrNothing) {
          await cn.rollback();
          return res.status(500).json({ created: [], conflicts: CONFLICTOS, errors: ERRORES, message: 'Error durante la inserción (allOrNothing)' });
        }
      }
    }

    await cn.commit();

    // 207 "multi-status"-like
    return res.status(200).json({
      created: OK,
      conflicts: CONFLICTOS,
      errors: ERRORES
    });
  } catch (e) {
    console.error('crear funciones masivas ->', e);
    try { if (cn) await cn.rollback(); } catch {}
    res.status(500).json({ message: 'Error al crear funciones masivas' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};


/** DELETE /api/funciones/:id (opcional) */
exports.eliminarFuncion = async (req, res) => {
  let cn;
  try {
    cn = await db.getConnection();
    const id = Number(req.params.id);
    await cn.execute(`DELETE FROM FUNCIONES WHERE ID_FUNCION = :id`, { id }, { autoCommit: true });
    res.json({ ok: true });
  } catch (e) {
    console.error('eliminar función ->', e);
    res.status(500).json({ message: 'Error al eliminar función' });
  } finally { try { if (cn) await cn.close(); } catch {} }
};

exports.actualizarFuncion = async (req, res) => {
  let cn;
  try {
    const id = Number(req.params.id);
    const { id_pelicula, id_sala, id_formato, id_idioma, fecha, horaInicio, horaFinal, precio } = req.body;

    if (!id || !id_pelicula || !id_sala || !id_formato || !id_idioma)
      return res.status(400).json({ message: 'Faltan campos' });
    if (!fecha || !horaInicio || !horaFinal)
      return res.status(400).json({ message: 'Fecha y horas son obligatorias' });

    // permitir overnight
    const toMinutes = (hhmm) => {
      const [h, m] = String(hhmm).split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const iniMin = toMinutes(horaInicio);
    const finMin = toMinutes(horaFinal);
    const finAdj = finMin <= iniMin ? finMin + 1440 : finMin;
    const dur = finAdj - iniMin;
    if (dur <= 0 || dur > 1440) return res.status(400).json({ message: 'Duración inválida' });

    cn = await db.getConnection();

    // validar solape EXCLUYENDO esta función
    const solape = await cn.execute(
      `
      SELECT COUNT(*) AS "T"
        FROM FUNCIONES f
       WHERE f.ID_SALA = :id_sala
         AND f.FECHA   = TO_DATE(:fecha,'YYYY-MM-DD')
         AND f.ID_FUNCION <> :id
         AND NOT (
           (f.FECHA + f.HORA_FINAL
              + CASE WHEN f.HORA_FINAL <= f.HORA_INICIO THEN NUMTODSINTERVAL(1,'DAY') ELSE NUMTODSINTERVAL(0,'DAY') END)
             <= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:iniMin,'MINUTE'))
           OR
           (f.FECHA + f.HORA_INICIO)
             >= (TO_DATE(:fecha,'YYYY-MM-DD') + NUMTODSINTERVAL(:finAdj,'MINUTE'))
         )
      `,
      { id, id_sala: Number(id_sala), fecha, iniMin, finAdj },
      OUT_OBJ
    );
    if (solape.rows[0].T > 0)
      return res.status(409).json({ message: 'La sala ya tiene una función que se solapa en ese horario' });

    await cn.execute(
      `
      UPDATE FUNCIONES
         SET ID_PELICULA = :id_pelicula,
             ID_SALA     = :id_sala,
             ID_FORMATO  = :id_formato,
             ID_IDIOMA   = :id_idioma,
             FECHA       = TO_DATE(:fecha,'YYYY-MM-DD'),
             HORA_INICIO = NUMTODSINTERVAL(:iniMin,'MINUTE'),
             HORA_FINAL  = NUMTODSINTERVAL(:finMin,'MINUTE'),
             PRECIO      = :precio
       WHERE ID_FUNCION = :id
      `,
      {
        id,
        id_pelicula: Number(id_pelicula),
        id_sala: Number(id_sala),
        id_formato: Number(id_formato),
        id_idioma: Number(id_idioma),
        fecha,
        iniMin, finMin,
        precio: Number(precio)
      },
      { autoCommit: true }
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('actualizar función ->', e);
    res.status(500).json({ message: 'Error al actualizar función' });
  } finally {
    try { if (cn) await cn.close(); } catch {}
  }
};

