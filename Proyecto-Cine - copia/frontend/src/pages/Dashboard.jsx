import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import RegistrarUsuario from './RegistrarUsuario';
import AsignarModulos from './AsignarModulos';
import AsignarFunciones from './AsignarFunciones'; // ✅ agregado
import CrearCategorias from './CrearCategorias';
import RegistrarClasificacion from './RegistrarClasificacion';
import AgregarNuevaPelicula from './AgregarNuevaPelicula';
import Categorias from './Categorias';
import UnidadMedida from './UnidadMedida';
import Productos from  './Productos';
import AsignarModulosClientes from  './AsignarModulosClientes';
import CrearNuevaVenta from "../pages/vista personal de ventas/CrearNuevaVenta";
import CortedeCaja from  './CortedeCaja';
import AperturaCaja from "../pages/vista personal de ventas/AperturaCaja";
import CierredeCaja from "../pages/cierre-de-caja/CierredeCaja";
import lotes from './lotes';
import NuevoCombo from "../pages/Combos/NuevoCombo";

import GestionarSalas from './GestionarSalas';

import '../styles/dashboard.css';

// 🔠 Capitaliza los nombres para visualización
const formatoTitulo = (texto) => {
  if (!texto) return '';
  return texto
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letra => letra.toUpperCase());
};

// 🧩 Submódulos con vista implementada
const submoduloComponents = {
  registrar_usuarios: RegistrarUsuario,
  asignacion_de_modulos: AsignarModulos,
  asignar_funciones: AsignarFunciones, // ✅ agregado
  crear_categoria: CrearCategorias,
  crear_clasificacion: RegistrarClasificacion,
  agregar_nueva_pelicula:AgregarNuevaPelicula,
  nueva_categoría:Categorias,
  crear_unidad_de_medida:UnidadMedida,
  agregar_nuevo_producto:Productos,
  gestionar_salas: GestionarSalas,
  control_módulos_cliente: AsignarModulosClientes,
  crear_nueva_venta: CrearNuevaVenta,
  corte_de_caja: CortedeCaja,
  control_de_caja: AperturaCaja,
  cierre_de_caja:CierredeCaja,
  crear_nuevo_lote:lotes,
  nuevo_combo:NuevoCombo,
  // 👉 futuros submódulos con vista irán aquí
};

const Dashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [modulesData, setModulesData] = useState([]);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState(null);

  // 📌 Cargar menú desde la API
  useEffect(() => {
    const loadMenu = async () => {
      if (!user?.role_id) return;

      try {
        const res = await axios.get(`http://localhost:3001/api/menu/${user.role_id}`);
        setModulesData(res.data);

        // Restaurar selección previa
        const savedModuleId = localStorage.getItem('selectedModuleId');
        const savedSubmoduleId = localStorage.getItem('selectedSubmoduleId');

        if (savedModuleId) setExpandedModuleId(parseInt(savedModuleId));
        if (savedSubmoduleId) setSelectedSubmoduleId(parseInt(savedSubmoduleId));
      } catch (err) {
        console.error('Error cargando menú:', err);
      }
    };

    loadMenu();
  }, [user]);

  // 📌 Expandir/colapsar módulos
  const toggleModule = (id) => {
    if (expandedModuleId === id) {
      setExpandedModuleId(null);
      localStorage.removeItem('selectedModuleId');
    } else {
      setExpandedModuleId(id);
      localStorage.setItem('selectedModuleId', id);
    }
    setSelectedSubmoduleId(null);
    localStorage.removeItem('selectedSubmoduleId');
  };

  // 📌 Seleccionar submódulo
  const handleSubmoduleClick = (id) => {
    setSelectedSubmoduleId(id);
    localStorage.setItem('selectedSubmoduleId', id);
  };

  // 📌 Cerrar sesión
  const handleLogout = () => {
    localStorage.clear();
    logout();
  };

  const selectedModule = modulesData.find(m => m.id === expandedModuleId);
  const selectedSubmodule = selectedModule?.submodulos.find(s => s.id === selectedSubmoduleId);

  return (
    <div className="dashboard-container">
      {/* Botón de logout */}
      <button className="logout-btn" onClick={handleLogout}>
        Cerrar sesión
      </button>

      {/* Menú lateral */}
      <nav className="sidebar">
        <h3>Menu</h3>
        <ul>
          {modulesData.map(mod => (
            <li key={mod.id}>
              <div
                className={`menu-module ${expandedModuleId === mod.id ? 'expanded active' : ''}`}
                onClick={() => toggleModule(mod.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggleModule(mod.id)}
              >
                <i className={`fas ${mod.icon}`} style={{ marginRight: '8px' }}></i>
                {formatoTitulo(mod.name)}
              </div>

              {expandedModuleId === mod.id && mod.submodulos.length > 0 && (
                <ul className="submenu">
                  {mod.submodulos.map(sub => (
                    <li
                      key={sub.id}
                      className={`submodulo-item ${sub.id === selectedSubmoduleId ? 'active' : ''}`}
                      onClick={() => handleSubmoduleClick(sub.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmoduleClick(sub.id)}
                    >
                      <i className={`fas ${sub.icon}`} style={{ marginRight: '6px' }}></i>
                      {formatoTitulo(sub.name)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Contenido principal */}
      <main className="main-content">
        {selectedSubmodule ? (
          (() => {
            const SubmoduloComponent = submoduloComponents[selectedSubmodule.name];
            return SubmoduloComponent ? (
              <SubmoduloComponent idAdmin={user?.id || parseInt(localStorage.getItem('id_admin'))} />
            ) : (
              <>
                <h2>{formatoTitulo(selectedSubmodule.name)}</h2>
                <p>Esta vista aún no tiene contenido asignado.</p>
              </>
            );
          })()
        ) : (
          <h2>Bienvenido al sistema : {user?.rol_nombre || ''}</h2>   
        )}
      </main>
    </div>
  );
};

export default Dashboard;
