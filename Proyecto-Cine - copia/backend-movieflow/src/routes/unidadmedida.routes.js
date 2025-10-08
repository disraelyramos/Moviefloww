const express = require('express');
const { body } = require('express-validator');
const unidadMedidaController = require('../controllers/unidadmedida.controller');

const router = express.Router();

//  Guardar varias unidades de medida en lote
router.post(
  '/lote',
  [
    body('unidades')
      .isArray({ min: 1 }).withMessage('Debe enviar al menos una unidad de medida'),
    body('unidades.*.nombre')
      .trim()
      .notEmpty().withMessage('El nombre es obligatorio')
      .isLength({ min: 2, max: 50 }).withMessage('El nombre debe tener entre 2 y 50 caracteres')
  ],
  unidadMedidaController.agregarUnidadesMedidaLote
);

// Buscar unidades de medida
router.get('/buscar', unidadMedidaController.buscarUnidadMedida);

//  Listar todas las unidades de medida
router.get('/', unidadMedidaController.listarUnidadesMedida);

// Eliminar unidad de medida
router.delete('/:codigo', unidadMedidaController.eliminarUnidadMedida);

module.exports = router;
