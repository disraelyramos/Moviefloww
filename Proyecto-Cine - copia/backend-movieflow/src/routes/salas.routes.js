const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salas.controller');

router.get('/',    ctrl.listarSalas);
router.post('/',   ctrl.crearSala);
router.put('/:id', ctrl.actualizarSala);
router.delete('/:id', ctrl.eliminarSala);

module.exports = router;
