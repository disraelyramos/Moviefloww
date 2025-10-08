const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/funciones.controller');

// ⚠️ IMPORTANTE: pasa referencias, sin paréntesis
router.get('/select-data', ctrl.getSelectData);
router.get('/',            ctrl.listarFunciones);
router.post('/',           ctrl.crearFuncion);
router.put('/:id',         ctrl.actualizarFuncion); 
router.delete('/:id',      ctrl.eliminarFuncion);
router.post('/bulk', ctrl.crearFuncionesMasivas);

module.exports = router;

