// src/pages/lotes.jsx
import React, { useState, useEffect } from 'react';
import { FaPlus, FaTags, FaSave } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
// puedes reutilizar el mismo css de categorías:
import '../styles/categorias.css'; // o crea ../styles/lotes.css si prefieres

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const Lotes = () => {
  const [lotesBD, setLotesBD] = useState([]);         // Lotes en BD
  const [lotesNuevos, setLotesNuevos] = useState([]); // Lotes temporales (pendientes)
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarLotesBD();
  }, []);

  const cargarLotesBD = async () => {
    try {
      const res = await axios.get(`${API_BASE}/lotes`);
      setLotesBD(res.data); // [{ID, CODIGO_LOTE, NOMBRE, FECHA_REGISTRO}]
    } catch (error) {
      console.error('Error cargando lotes:', error);
      toast.error('Error al cargar lotes');
    }
  };

  // Código local SOLO visual (el real lo genera backend)
  const generarCodigoLocal = () => {
    const hoy = new Date().toISOString().slice(0,10).replace(/-/g,''); // YYYYMMDD
    const siguiente = String(lotesNuevos.length + 1).padStart(3, '0');
    return `LOTE-${hoy}-${siguiente}`;
  };

  // Agregar a lista temporal
  const agregarLote = () => {
    if (!nombre.trim()) {
      toast.error('El nombre del lote es obligatorio');
      return;
    }
    const existe = lotesNuevos.some(l => l.nombre.toLowerCase() === nombre.trim().toLowerCase());
    if (existe) {
      toast.info('Ese nombre de lote ya está en la lista temporal');
      return;
    }

    const nuevo = {
      codigoLocal: generarCodigoLocal(), // solo visual
      nombre: nombre.trim(),
      isNew: true
    };
    setLotesNuevos(prev => [...prev, nuevo]);
    setNombre('');
    toast.success(`Lote agregado (código provisional: ${nuevo.codigoLocal})`);
  };

  // Guardar en BD
  const guardarLotes = async () => {
    if (lotesNuevos.length === 0) {
      toast.info('No hay lotes nuevos para guardar');
      return;
    }
    try {
      const payload = {
        lotes: lotesNuevos.map(l => ({ nombre: l.nombre }))
      };
      const res = await axios.post(`${API_BASE}/lotes`, payload);
      toast.success(res.data.message || 'Lotes guardados');

      setLotesBD(res.data.lotesTodos || []);
      setLotesNuevos([]);
    } catch (error) {
      console.error('Error al guardar lotes:', error);
      toast.error(error.response?.data?.message || 'Error al guardar lotes');
    }
  };

  // Buscar en BD
  const buscarLotes = async (texto) => {
    setBusqueda(texto);
    if (!texto.trim()) {
      cargarLotesBD();
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/lotes/buscar`, { params: { q: texto } });
      setLotesBD(res.data);
    } catch (error) {
      console.error('Error al buscar lotes:', error);
      toast.error('Error al buscar lotes');
    }
  };

  // Quitar de lista temporal
  const quitarTemporal = (codigoLocal) => {
    setLotesNuevos(prev => prev.filter(l => l.codigoLocal !== codigoLocal));
    toast.info('Lote eliminado de la lista temporal');
  };

  return (
    <div className="categorias-container">{/* reutilizamos estilos */}
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Lote</h3>
        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />
        <input
          type="text"
          placeholder='Ej: "Lote A", "Lote B"'
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button className="btn-azul" onClick={agregarLote}>
          <FaTags /> Agregar Lote
        </button>
        <button className="btn-verde" onClick={guardarLotes}>
          <FaSave /> Guardar Todo
        </button>
      </div>

      {/* Lista oficial (BD) */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Lotes Registrados</h3>
          <span className="badge">{lotesBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar lote por código o nombre..."
            value={busqueda}
            onChange={(e) => buscarLotes(e.target.value)}
          />
        </div>

        {/* Lista BD */}
        <div className="lista-categorias">
          {lotesBD.map((l) => (
            <div className="item-categoria" key={l.ID || l.CODIGO_LOTE}>
              <div>
                <FaTags /> <strong>{l.CODIGO_LOTE}</strong>
                <p>{l.NOMBRE}</p>
                {l.FECHA_REGISTRO && <small>Creado: {l.FECHA_REGISTRO}</small>}
              </div>
              {/* No hay eliminar en BD (política de no borrar) */}
            </div>
          ))}
        </div>
      </div>

      {/* Lista temporal (nuevos) */}
      {lotesNuevos.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Lotes Nuevos</h3>
            <span className="badge">{lotesNuevos.length}</span>
          </div>
          <div className="lista-categorias">
            {lotesNuevos.map((l) => (
              <div className="item-categoria" key={l.codigoLocal}>
                <div>
                  <FaTags /> <strong>{l.codigoLocal}</strong>
                  <p>{l.nombre}</p>
                </div>
                <button className="btn-rojo" onClick={() => quitarTemporal(l.codigoLocal)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Lotes;
