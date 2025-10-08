const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Importar rutas
const authRoutes = require('./src/routes/auth.routes');
const authGoogleRoutes = require('./src/routes/authGoogle.routes');
const menuRoutes = require('./src/routes/menu.routes');
const usuariosRoutes = require('./src/routes/usuarios.routes');
const estadosRoutes = require('./src/routes/estados.routes');
const rolesRoutes = require('./src/routes/roles.routes');
const asignarMenuRoutes = require('./src/routes/asignarmenu.routes');
const categoriasRoutes = require('./src/routes/categorias.routes'); // ✅ Añadido
const clasificacionesRoutes = require('./src/routes/clasificaciones.routes');
const peliculasRoutes = require('./src/routes/peliculas.routes');
const categoriaProductosRoutes = require('./src/routes/categoriaproductos.routes');
const unidadMedidaRoutes = require('./src/routes/unidadmedida.routes');
const productoEstadosRoutes = require('./src/routes/productoestado.routes');
const calculoProductoRoutes = require('./src/routes/calculo-producto.routes');
const actualizarProductoRoutes = require('./src/routes/actualizar-producto.routes');
const eventosReservadosRoutes = require('./src/routes/eventosReservados.routes');
const modulosClienteRoutes = require("./src/routes/modulosCliente.routes");
const estadosProductosRoutes = require('./src/routes/estados-productos.routes');
const nuevoProductoRoutes = require('./src/routes/nuevoproducto.routes');
const personalVentasRoutes = require("./src/routes/ventas/personal-ventas.routes");
const ticketPDFRoutes = require("./src/routes/ventas/ticketpdf.routes");
const estadoVentaRoutes = require("./src/routes/ventas/estadoVenta.routes");
const corteCajaRoutes = require("./src/routes/ventas/corte-caja.routes");
const turnosHorariosRoutes = require("./src/routes/ventas/TurnosHorarios.routes");
const aperturaCajaRoutes = require("./src/routes/ventas/AperturaCaja.routes");
const cajaRoutes = require("./src/routes/caja/Caja.routes");

const registrarCierreRoutes = require("./src/routes/caja/registrarCierre.routes");
const pdfRoutes = require("./src/routes/pdf/inicioaperturaCaja.routes");
const CierredelasCajasRoutes = require("./src/routes/caja/CierredelasCajas.routes");
const lotesRoutes = require('./src/routes/lotes.routes');
const combosRoutes = require('./src/routes/combo/combos.routes');



// Ruta base
app.get('/', (req, res) => {
  res.send('API CinePeliz funcionando correctamente 🎬');
});

// Rutas
app.use('/login', authRoutes);
app.use('/api/auth', authGoogleRoutes);
app.use('/api', menuRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/estados', estadosRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api', asignarMenuRoutes);
app.use('/api', categoriasRoutes); // ✅ Añadido
app.use('/api/clasificaciones', clasificacionesRoutes);
app.use('/api', peliculasRoutes);
app.use('/api/categoria-productos', categoriaProductosRoutes);
app.use('/api/unidadmedida', unidadMedidaRoutes);
app.use('/api/producto-estados', productoEstadosRoutes);
app.use('/api/calculo-productos', calculoProductoRoutes);
app.use('/api/actualizar-producto', actualizarProductoRoutes);
app.use('/api/salas', require('./src/routes/salas.routes'));
app.use('/api/eventos-reservados', eventosReservadosRoutes);
app.use("/api/modulos-clientes", modulosClienteRoutes);
app.use('/api/estados-productos', estadosProductosRoutes);
app.use('/api/productos', nuevoProductoRoutes);
app.use("/api/personal-ventas", personalVentasRoutes);
app.use("/api/ticket-pdf", ticketPDFRoutes);
app.use("/api/estado-venta", estadoVentaRoutes);
app.use("/api/corte-caja", corteCajaRoutes);
app.use("/api/ventas", turnosHorariosRoutes);
app.use("/api/ventas", aperturaCajaRoutes);
app.use("/api/cajas", cajaRoutes);
app.use("/api/registrar-cierre", registrarCierreRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/cierredelascajas", CierredelasCajasRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/auth', require('./src/routes/auth/verifyAdmin.routes'));
app.use('/api/producto-por-lote', require('./src/routes/inventario/productoPorLote.routes'));
app.use(combosRoutes);
app.use("/api", require("./src/routes/pdf/detalles.routes"));



const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const funcionesRoutes = require('./src/routes/funciones.routes');
app.use('/api/funciones', funcionesRoutes);

// Puerto
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor backend corriendo en http://localhost:${PORT}`);
});
