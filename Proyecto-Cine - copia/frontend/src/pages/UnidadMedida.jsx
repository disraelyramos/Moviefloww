// src/pages/UnidadMedida.jsx
import React, { useState, useEffect } from 'react';
import { FaPlus, FaBalanceScale, FaSave, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import '../styles/categorias.css'; 

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const UnidadMedida = () => {
  const [unidadesBD, setUnidadesBD] = useState([]);       //  oficiales de BD
  const [unidadesNuevas, setUnidadesNuevas] = useState([]); //  temporales
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // 📌 Cargar desde BD al montar
  useEffect(() => {
    cargarUnidadesBD();
  }, []);

  const cargarUnidadesBD = async () => {
    try {
      const res = await axios.get(`${API_BASE}/unidadmedida`);
      setUnidadesBD(res.data);
    } catch (error) {
      console.error('Error cargando unidades:', error);
      toast.error('Error al cargar unidades');
    }
  };

  // 📌 Generar código provisional
  const generarCodigoLocal = () => {
    const totalNuevas = unidadesNuevas.length + 1;
    return `UM${String(totalNuevas).padStart(3, '0')}`;
  };

  // ➕ Agregar nueva unidad
  const agregarUnidad = () => {
    if (!nombre.trim()) {
      toast.error('El nombre de la unidad de medida es obligatorio');
      return;
    }

    const nuevaUnidad = {
      codigo: generarCodigoLocal(),
      nombre: nombre.trim(),
      isNew: true
    };

    setUnidadesNuevas(prev => [...prev, nuevaUnidad]);
    setNombre('');
    toast.success(`Unidad agregada (Código provisional: ${nuevaUnidad.codigo})`);
  };

  // 💾 Guardar nuevas en BD
  const guardarUnidades = async () => {
    if (unidadesNuevas.length === 0) {
      toast.info('No hay unidades nuevas para guardar');
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/unidadmedida/lote`, {
        unidades: unidadesNuevas.map(({ nombre }) => ({ nombre }))
      });

      toast.success(res.data.message);

      // 🔄 Refrescar con datos del backend
      setUnidadesBD(res.data.unidadesTodas);
      setUnidadesNuevas([]);
    } catch (error) {
      console.error('Error al guardar unidades:', error);
      toast.error(error.response?.data?.message || 'Error al guardar unidades');
    }
  };

  // 🔍 Buscar en BD
  const buscarUnidades = async (texto) => {
    setBusqueda(texto);
    if (!texto.trim()) {
      cargarUnidadesBD();
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/unidadmedida/buscar`, {
        params: { q: texto }
      });
      setUnidadesBD(res.data);
    } catch (error) {
      console.error('Error al buscar unidades:', error);
      toast.error('Error al buscar unidades');
    }
  };

  // 🗑 Eliminar unidad
  const eliminarUnidad = async (codigo, isNew) => {
    if (isNew) {
      setUnidadesNuevas(prev => prev.filter(um => um.codigo !== codigo));
      toast.info(`Unidad ${codigo} eliminada de la lista temporal`);
    } else {
      try {
        await axios.delete(`${API_BASE}/unidadmedida/${codigo}`);
        setUnidadesBD(prev => prev.filter(um => um.CODIGO !== codigo));
        toast.info(`Unidad ${codigo} eliminada`);
      } catch (error) {
        console.error('Error al eliminar unidad:', error);
        toast.error('No se pudo eliminar la unidad');
      }
    }
  };

  return (
    <div className="categorias-container">
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Unidad de Medida</h3>
        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />
        <input
          type="text"
          placeholder="Ej: Litro, Gramo, Unidad"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button className="btn-azul" onClick={agregarUnidad}>
          <FaBalanceScale /> Agregar Unidad
        </button>
        <button className="btn-verde" onClick={guardarUnidades}>
          <FaSave /> Guardar Todo
        </button>
      </div>

      {/* Lista oficial BD */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Unidades de Medida Registradas</h3>
          <span className="badge">{unidadesBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar unidad..."
            value={busqueda}
            onChange={(e) => buscarUnidades(e.target.value)}
          />
        </div>

        {/* Lista BD */}
        <div className="lista-categorias">
          {unidadesBD.map((um) => (
            <div className="item-categoria" key={um.CODIGO}>
              <div>
                <FaBalanceScale /> <strong>{um.CODIGO}</strong>
                <p>{um.NOMBRE}</p>
              </div>
              <button
                className="btn-rojo"
                onClick={() => eliminarUnidad(um.CODIGO, false)}
              >
                <FaTrash /> Eliminar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lista temporal nuevas */}
      {unidadesNuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3> Nuevas Unidades</h3>
            <span className="badge">{unidadesNuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {unidadesNuevas.map((um) => (
              <div className="item-categoria" key={um.codigo}>
                <div>
                  <FaBalanceScale /> <strong>{um.codigo}</strong>
                  <p>{um.nombre}</p>
                </div>
                <button
                  className="btn-rojo"
                  onClick={() => eliminarUnidad(um.codigo, true)}
                >
                  <FaTrash /> Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnidadMedida;
