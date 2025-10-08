// src/controllers/unidadmedida.controller.js
const db = require('../config/db');
const oracledb = require('oracledb');
const xss = require('xss');
const { validationResult } = require('express-validator');

/**
 * 📌 Agregar varias unidades de medida en lote
 */
exports.agregarUnidadesMedidaLote = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    let { unidades } = req.body;
    if (!Array.isArray(unidades) || unidades.length === 0) {
        return res.status(400).json({ message: 'Debe enviar al menos una unidad de medida.' });
    }

    unidades = unidades.map(um => ({
        codigo: xss(um.codigo?.trim() || ''),
        nombre: xss(um.nombre?.trim() || '')
    })).filter(um => um.nombre);

    if (unidades.length === 0) {
        return res.status(400).json({ message: 'Todas las unidades deben tener un nombre válido.' });
    }

    let connection;
    try {
        connection = await db.getConnection();

        // Verificar duplicados
        const nombres = unidades.map(u => u.nombre.toLowerCase());
        const placeholders = nombres.map((_, i) => `:n${i}`).join(', ');

        const dupCheck = await connection.execute(
            `SELECT LOWER(NOMBRE) AS NOMBRE
             FROM UNIDAD_MEDIDA
             WHERE LOWER(NOMBRE) IN (${placeholders})`,
            Object.fromEntries(nombres.map((n, i) => [`n${i}`, n])),
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (dupCheck.rows.length > 0) {
            const duplicados = dupCheck.rows.map(r => r.NOMBRE).join(', ');
            return res.status(400).json({ message: `El nombre ya existe: ${duplicados}` });
        }

        // Obtener último código
        const result = await connection.execute(
            `SELECT CODIGO 
             FROM UNIDAD_MEDIDA 
             ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        let ultimoNumero = 0;
        if (result.rows.length > 0) {
            const ultimoCodigo = result.rows[0].CODIGO;
            ultimoNumero = parseInt(ultimoCodigo.replace("UM", ""), 10) || 0;
        }

        // Generar nuevos códigos
        const unidadesFinal = unidades.map((u, idx) => ({
            codigo: `UM${String(ultimoNumero + idx + 1).padStart(3, '0')}`,
            nombre: u.nombre
        }));

        // Insertar
        for (const um of unidadesFinal) {
            await connection.execute(
                `INSERT INTO UNIDAD_MEDIDA (CODIGO, NOMBRE) 
                 VALUES (:codigo, :nombre)`,
                { codigo: um.codigo, nombre: um.nombre },
                { autoCommit: false }
            );
        }

        await connection.commit();

        // 🔹 Traer todas las unidades actualizadas
        const todasUnidades = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE
             FROM UNIDAD_MEDIDA
             ORDER BY CODIGO ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.status(201).json({
            message: `${unidadesFinal.length} unidades de medida agregadas correctamente.`,
            unidadesNuevas: unidadesFinal,     // solo las recién insertadas
            unidadesTodas: todasUnidades.rows  // TODAS las unidades en BD
        });
    } catch (error) {
        console.error('Error al guardar unidades de medida en lote:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ message: 'Error al guardar unidades de medida.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 🔍 Buscar unidades de medida
 */
exports.buscarUnidadMedida = async (req, res) => {
    const query = xss(req.query.q?.trim() || '');
    if (!query) return res.json([]);

    let connection;
    try {
        connection = await db.getConnection();
        const result = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE
             FROM UNIDAD_MEDIDA
             WHERE LOWER(CODIGO) LIKE :q OR LOWER(NOMBRE) LIKE :q
             ORDER BY CODIGO ASC`,
            { q: `%${query.toLowerCase()}%` },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al buscar unidades de medida:', error);
        res.status(500).json({ message: 'Error al buscar unidades de medida.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 🗑 Eliminar unidad de medida
 */
exports.eliminarUnidadMedida = async (req, res) => {
    const codigo = xss(req.params.codigo?.trim() || '');
    if (!codigo) return res.status(400).json({ message: 'Código no válido.' });

    let connection;
    try {
        connection = await db.getConnection();
        const result = await connection.execute(
            `DELETE FROM UNIDAD_MEDIDA WHERE CODIGO = :codigo`,
            { codigo },
            { autoCommit: true }
        );

        if (result.rowsAffected === 0) {
            return res.status(404).json({ message: 'Unidad de medida no encontrada.' });
        }

        res.json({ message: `Unidad de medida ${codigo} eliminada correctamente.` });
    } catch (error) {
        console.error('Error al eliminar unidad de medida:', error);
        res.status(500).json({ message: 'Error al eliminar unidad de medida.' });
    } finally {
        if (connection) await connection.close();
    }
};

/**
 * 📋 Listar todas las unidades de medida
 */
exports.listarUnidadesMedida = async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const result = await connection.execute(
            `SELECT ID, CODIGO, NOMBRE
             FROM UNIDAD_MEDIDA
             ORDER BY CODIGO ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al listar unidades de medida:', error);
        res.status(500).json({ message: 'Error al listar unidades de medida.' });
    } finally {
        if (connection) await connection.close();
    }
};
