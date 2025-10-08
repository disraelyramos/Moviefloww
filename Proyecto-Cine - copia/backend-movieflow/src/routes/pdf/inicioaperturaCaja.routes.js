const express = require("express");
const router = express.Router();

const aperturaCajaPDFController = require("../../controllers/pdf/inicioaperturaCaja.controller");
const corteCajaPDFController    = require("../../controllers/pdf/corteCaja.controller");

// Rutas explícitas (sin regex)
router.get("/apertura-caja/:id_apertura", aperturaCajaPDFController.generarAperturaCajaPDF);
router.get("/corte-caja/:id_cierre",     corteCajaPDFController.generarCorteCajaPDF);

// (Opcional) si quieres compatibilidad con la vieja: /api/pdf/:id_apertura
// ⚠️ Déjala al final para que no tape a las anteriores
// router.get("/:id_apertura", aperturaCajaPDFController.generarAperturaCajaPDF);

module.exports = router;
