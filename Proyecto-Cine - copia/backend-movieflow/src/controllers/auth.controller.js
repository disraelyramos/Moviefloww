const db = require('../config/db');
const bcrypt = require('bcrypt');
const oracledb = require('oracledb');

exports.login = async (req, res) => {
  const { username, password } = req.body;
  let connection;

  try {
    const cleanUsername = username.trim();
    connection = await db.getConnection();

    const result = await connection.execute(
      `SELECT 
         u.id AS "ID",
         u.usuario AS "usuario", 
         u.password_hash AS "password_hash", 
         u.estado AS "estado", 
         u.role_id AS "role_id",
         r.nombre AS "ROL_NOMBRE"                -- 👈 agregado
       FROM usuarios u
       JOIN roles r ON r.id = u.role_id          -- 👈 agregado
       WHERE u.usuario = :usuario`,
      [cleanUsername],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    if (user.estado !== 1) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    await connection.execute(
      `UPDATE usuarios 
       SET ultimo_login = SYSTIMESTAMP 
       WHERE usuario = :usuario`,
      [cleanUsername],
      { autoCommit: true }
    );

    return res.json({
      message: `Bienvenido al sistema ${user.ROL_NOMBRE}`, // 👈 mensaje personalizado
      id: user.ID,
      role_id: user.role_id,
      rol_nombre: user.ROL_NOMBRE                        // 👈 opcional para frontend
    });

  } catch (error) {
    return res.status(500).json({ message: 'Error interno del servidor' });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
};
