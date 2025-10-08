const db = require('../config/db');
const oracledb = require('oracledb');

async function registrarAuditoria({ id_admin, id_usuario_editado, campo_modificado, valor_anterior, valor_nuevo }) {
  let connection;

  try {
    // Validación de campos obligatorios
    if (!id_admin || !id_usuario_editado || !campo_modificado) {
      console.error('[AUDITORIA] Campos requeridos faltantes:', {
        id_admin,
        id_usuario_editado,
        campo_modificado
      });
      return;
    }

    console.log('[AUDITORIA] Intentando registrar auditoría con los datos:');
    console.log({
      id_admin,
      id_usuario_editado,
      campo_modificado,
      valor_anterior,
      valor_nuevo
    });

    connection = await db.getConnection();
    console.log('[AUDITORIA] Conexión a la base de datos establecida');

    const result = await connection.execute(
      `INSERT INTO REGISTRO_AUDITORIA (
        ID_ADMIN,
        ID_USUARIO_EDITADO,
        CAMPO_MODIFICADO,
        VALOR_ANTERIOR,
        VALOR_NUEVO,
        FECHA_HORA_MODIFICACION
      ) VALUES (
        :id_admin,
        :id_usuario_editado,
        :campo_modificado,
        :valor_anterior,
        :valor_nuevo,
        SYSTIMESTAMP
      )`,
      {
        id_admin,
        id_usuario_editado,
        campo_modificado,
        valor_anterior,
        valor_nuevo
      },
      { autoCommit: true }
    );

    console.log(`[AUDITORIA] Auditoría registrada correctamente. Filas afectadas: ${result.rowsAffected}`);
  } catch (error) {
    console.error('[AUDITORIA] Error al registrar auditoría:', error);
  } finally {
    if (connection) {
      await connection.close();
      console.log('[AUDITORIA] Conexión cerrada');
    }
  }
}

module.exports = {
  registrarAuditoria
};
