const { Router } = require('express');
const ctrl = require('../controllers/eventosReservados.controller');
const router = Router();

router.post('/', ctrl.crearEventoReservado);
router.get('/',  ctrl.listarEventosReservados);

// NUEVO:
router.put('/:id', ctrl.actualizarEventoReservado);      // editar
router.patch('/:id/cancel', ctrl.cancelarEventoReservado); // cancelar (ESTADO='CANCELADO')

module.exports = router;
