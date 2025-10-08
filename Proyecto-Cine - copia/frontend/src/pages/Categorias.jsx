import React, { useState, useEffect } from 'react';
import { FaPlus, FaTags, FaSave, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import axios from 'axios';
import '../styles/categorias.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const Categorias = () => {
  const [categoriasBD, setCategoriasBD] = useState([]);     // ✅ Categorías en BD
  const [categoriasNuevas, setCategoriasNuevas] = useState([]); // ✅ Nuevas (pendientes)
  const [nombre, setNombre] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // 📌 Cargar categorías desde BD al iniciar
  useEffect(() => {
    cargarCategoriasBD();
  }, []);

  const cargarCategoriasBD = async () => {
    try {
      const res = await axios.get(`${API_BASE}/categoria-productos`);
      setCategoriasBD(res.data);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      toast.error('Error al cargar categorías');
    }
  };

  // 📌 Generar código provisional local
  const generarCodigoLocal = () => {
    const totalNuevas = categoriasNuevas.length + 1;
    return `CAT${String(totalNuevas).padStart(3, '0')}`;
  };

  // ➕ Agregar nueva categoría (temporal)
  const agregarCategoria = () => {
    if (!nombre.trim()) {
      toast.error('El nombre de la categoría es obligatorio');
      return;
    }

    const nuevaCategoria = {
      codigo: generarCodigoLocal(),
      nombre: nombre.trim(),
      isNew: true
    };

    setCategoriasNuevas(prev => [...prev, nuevaCategoria]);
    setNombre('');
    toast.success(`Categoría agregada (Código provisional: ${nuevaCategoria.codigo})`);
  };

  // 💾 Guardar nuevas en BD
  const guardarCategorias = async () => {
    if (categoriasNuevas.length === 0) {
      toast.info('No hay categorías nuevas para guardar');
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/categoria-productos/lote`, {
        categorias: categoriasNuevas.map(({ nombre }) => ({ nombre }))
      });

      toast.success(res.data.message);

      // 🔄 Actualizar BD y limpiar lista temporal
      setCategoriasBD(res.data.categoriasTodas);
      setCategoriasNuevas([]);
    } catch (error) {
      console.error('Error al guardar categorías:', error);
      toast.error(error.response?.data?.message || 'Error al guardar categorías');
    }
  };

  // 🔍 Buscar en BD (opcional)
  const buscarCategorias = async (texto) => {
    setBusqueda(texto);
    if (!texto.trim()) {
      cargarCategoriasBD();
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/categoria-productos/buscar`, {
        params: { q: texto }
      });
      setCategoriasBD(res.data);
    } catch (error) {
      console.error('Error al buscar categorías:', error);
      toast.error('Error al buscar categorías');
    }
  };

  // 🗑 Eliminar categoría
  const eliminarCategoria = async (codigo, isNew) => {
    if (isNew) {
      setCategoriasNuevas(prev => prev.filter(cat => cat.codigo !== codigo));
      toast.info(`Categoría ${codigo} eliminada de la lista temporal`);
    } else {
      try {
        await axios.delete(`${API_BASE}/categoria-productos/${codigo}`);
        setCategoriasBD(prev => prev.filter(cat => cat.CODIGO !== codigo));
        toast.info(`Categoría ${codigo} eliminada`);
      } catch (error) {
        console.error('Error al eliminar categoría:', error);
        toast.error('No se pudo eliminar la categoría (puede estar asociada a un producto)');
      }
    }
  };

  return (
    <div className="categorias-container">
      {/* Formulario agregar */}
      <div className="card agregar-categoria">
        <h3><FaPlus /> Agregar Categoría</h3>
        <input
          type="text"
          placeholder="Código generado automáticamente"
          value={generarCodigoLocal()}
          readOnly
        />
        <input
          type="text"
          placeholder="Ej: jugos, bebidas calientes, caja"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <button className="btn-azul" onClick={agregarCategoria}>
          <FaTags /> Agregar Categoría
        </button>
        <button className="btn-verde" onClick={guardarCategorias}>
          <FaSave /> Guardar Todo
        </button>
      </div>

      {/* Lista oficial (BD) */}
      <div className="card categorias-agregadas">
        <div className="header-lista">
          <h3>📄 Categorías Registradas</h3>
          <span className="badge">{categoriasBD.length}</span>
        </div>

        {/* Buscador */}
        <div className="buscador">
          <input
            type="text"
            placeholder="Buscar categoría..."
            value={busqueda}
            onChange={(e) => buscarCategorias(e.target.value)}
          />
        </div>

        {/* Lista de BD */}
        <div className="lista-categorias">
          {categoriasBD.map((cat) => (
            <div className="item-categoria" key={cat.CODIGO}>
              <div>
                <FaTags /> <strong>{cat.CODIGO}</strong>
                <p>{cat.NOMBRE}</p>
              </div>
              <button
                className="btn-rojo"
                onClick={() => eliminarCategoria(cat.CODIGO, false)}
              >
                <FaTrash /> Eliminar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Lista temporal (nuevas) */}
      {categoriasNuevas.length > 0 && (
        <div className="card categorias-agregadas">
          <div className="header-lista">
            <h3>🆕 Categorías Nuevas</h3>
            <span className="badge">{categoriasNuevas.length}</span>
          </div>
          <div className="lista-categorias">
            {categoriasNuevas.map((cat) => (
              <div className="item-categoria" key={cat.codigo}>
                <div>
                  <FaTags /> <strong>{cat.codigo}</strong>
                  <p>{cat.nombre}</p>
                </div>
                <button
                  className="btn-rojo"
                  onClick={() => eliminarCategoria(cat.codigo, true)}
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

export default Categorias;
