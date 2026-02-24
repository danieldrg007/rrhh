import { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  UploadCloud, QrCode, LayoutDashboard, Users, RefreshCw, 
  CheckCircle, AlertCircle, Menu, X, Plus, Trash2, Briefcase, Building, Hash,
  Lock, Mail, LogOut, Edit2, XCircle, UserPlus, ArrowLeft
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  // ─── AUTH STATE ───────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usuarioId, setUsuarioId]             = useState(null);   // <── clave multi-tenant
  const [empresaNombre, setEmpresaNombre]     = useState("");
  const [authView, setAuthView]               = useState("login"); // "login" | "registro"

  const [loginData, setLoginData]     = useState({ email: '', password: '' });
  const [loginError, setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regData, setRegData]         = useState({ email: '', password: '', empresa: '' });
  const [regStatus, setRegStatus]     = useState("");
  const [regLoading, setRegLoading]   = useState(false);

  // ─── APP STATE ────────────────────────────────────────────────
  const [modo, setModo]               = useState('dashboard');
  const [isMenuOpen, setIsMenuOpen]   = useState(false);
  const [file, setFile]               = useState(null);
  const [statusExcel, setStatusExcel] = useState("");
  const [loading, setLoading]         = useState(false);
  const [statusQR, setStatusQR]       = useState("");
  const [idManual, setIdManual]       = useState("");

  const [registros, setRegistros]         = useState([]);
  const [estadisticas, setEstadisticas]   = useState({ resumen: [], datos_grafica: [] });
  const [cargandoRegistros, setCargandoRegistros] = useState(false);

  const [empleados, setEmpleados]         = useState([]);
  const [statusEmpleados, setStatusEmpleados] = useState("");
  const [nuevoEmpleado, setNuevoEmpleado] = useState({ id_empleado: '', nombre: '', puesto: '', departamento: '' });
  const [modoEdicion, setModoEdicion]     = useState(false);

  // ─── HELPER: headers con autenticación multi-tenant ──────────
  const authHeaders = (extra = {}) => ({
    "Content-Type": "application/json",
    "x-user-id": usuarioId,
    ...extra,
  });

  // ─── AUTH HANDLERS ────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true); setLoginError("");
    try {
      const res  = await fetch(`${API}/api/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      const data = await res.json();
      if (res.ok) {
        setUsuarioId(data.usuario_id);
        setEmpresaNombre(data.empresa);
        setIsAuthenticated(true);
      } else {
        setLoginError(data.detail || "Credenciales incorrectas.");
      }
    } catch {
      setLoginError("Error de conexión con el servidor.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegistro = async (e) => {
    e.preventDefault();
    setRegLoading(true); setRegStatus("");
    try {
      const res  = await fetch(`${API}/api/registro/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regData),
      });
      const data = await res.json();
      if (res.ok) {
        setRegStatus("exito:" + (data.mensaje || "Cuenta creada. Inicia sesión."));
        setRegData({ email: '', password: '', empresa: '' });
        setTimeout(() => setAuthView("login"), 2000);
      } else {
        setRegStatus("error:" + (data.detail || "Error al registrar."));
      }
    } catch {
      setRegStatus("error:Error de conexión con el servidor.");
    } finally {
      setRegLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsuarioId(null);
    setEmpresaNombre("");
    setLoginData({ email: '', password: '' });
    setModo('dashboard');
    setAuthView("login");
  };

  // ─── EXCEL ────────────────────────────────────────────────────
  const handleFileChange = (e) => { setFile(e.target.files[0]); setStatusExcel(""); };

  const uploadFile = async () => {
    if (!file) { setStatusExcel("Error: Selecciona un archivo."); return; }
    const formData = new FormData(); formData.append("file", file);
    setLoading(true); setStatusExcel("Procesando documento...");
    try {
      const res  = await fetch(`${API}/api/subir-asistencia/`, {
        method: "POST",
        headers: { "x-user-id": usuarioId },   // sin Content-Type para multipart
        body: formData,
      });
      const data = await res.json();
      if (res.ok) { setStatusExcel(`Éxito: ${data.filas_registradas} registros procesados.`); setFile(null); }
      else setStatusExcel(`Error: ${data.detail}`);
    } catch { setStatusExcel("Error de conexión."); }
    finally { setLoading(false); }
  };

  // ─── QR ───────────────────────────────────────────────────────
  const registrarAsistencia = async (idEscaneado) => {
    const idEmpleado = parseInt(idEscaneado);
    if (isNaN(idEmpleado)) { setStatusQR("Error: ID inválido."); return; }
    setStatusQR("Autenticando...");
    try {
      const res  = await fetch(`${API}/api/registrar-qr/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ id_empleado: idEmpleado, id_capacitacion: 1 }),
      });
      const data = await res.json();
      if (res.ok) { setStatusQR(`Éxito: ${data.mensaje.replace(/✅ |❌ |⚠️ /g, '')}`); setIdManual(""); }
      else setStatusQR(`Error: ${data.detail}`);
    } catch { setStatusQR("Error de conexión."); }
  };

  const handleScan = (resultado) => {
    if (resultado && resultado[0]) registrarAsistencia(resultado[0].rawValue);
  };

  // ─── DASHBOARD ────────────────────────────────────────────────
  const cargarRegistros = async () => {
    setCargandoRegistros(true);
    try {
      const [resTabla, resStats] = await Promise.all([
        fetch(`${API}/api/registros-qr/`, { headers: authHeaders() }),
        fetch(`${API}/api/estadisticas/`,  { headers: authHeaders() }),
      ]);
      setRegistros((await resTabla.json()).reverse());
      setEstadisticas(await resStats.json());
    } catch (err) { console.error(err); }
    finally { setCargandoRegistros(false); }
  };

  // ─── EMPLEADOS ────────────────────────────────────────────────
  const cargarEmpleados = async () => {
    try {
      const res = await fetch(`${API}/api/empleados/`, { headers: authHeaders() });
      setEmpleados(await res.json());
    } catch (err) { console.error(err); }
  };

  const guardarEmpleado = async (e) => {
    e.preventDefault();
    if (!nuevoEmpleado.id_empleado || !nuevoEmpleado.nombre || !nuevoEmpleado.puesto || !nuevoEmpleado.departamento) {
      setStatusEmpleados("Alerta: Todos los campos son obligatorios."); return;
    }
    setStatusEmpleados(modoEdicion ? "Actualizando datos..." : "Procesando alta...");
    try {
      const url    = modoEdicion
        ? `${API}/api/empleados/${nuevoEmpleado.id_empleado}`
        : `${API}/api/empleados/`;
      const method = modoEdicion ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ ...nuevoEmpleado, id_empleado: parseInt(nuevoEmpleado.id_empleado) }),
      });
      const data   = await res.json();
      if (res.ok) { setStatusEmpleados(`Éxito: ${data.mensaje}`); cancelarEdicion(); cargarEmpleados(); }
      else setStatusEmpleados(`Error: ${data.detail}`);
    } catch { setStatusEmpleados("Error de conexión."); }
  };

  const eliminarEmpleado = async (id, nombre) => {
    if (!window.confirm(`¿Confirma la baja definitiva de: ${nombre}?`)) return;
    try {
      const res = await fetch(`${API}/api/empleados/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) cargarEmpleados();
    } catch (err) { console.error(err); }
  };

  const iniciarEdicion = (emp) => {
    setNuevoEmpleado({ id_empleado: emp.id_empleado, nombre: emp.nombre, puesto: emp.puesto, departamento: emp.departamento });
    setModoEdicion(true); setStatusEmpleados("");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setNuevoEmpleado({ id_empleado: '', nombre: '', puesto: '', departamento: '' });
    setModoEdicion(false); setStatusEmpleados("");
  };

  // ─── EFFECTS ──────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      if (modo === 'dashboard') cargarRegistros();
      if (modo === 'empleados') cargarEmpleados();
    }
  }, [modo, isAuthenticated]);

  const cambiarPestana = (id) => {
    setModo(id); setIsMenuOpen(false);
    setStatusExcel(""); setStatusQR(""); setStatusEmpleados("");
    cancelarEdicion();
  };

  // ─── NAV BUTTON ───────────────────────────────────────────────
  const NavButton = ({ id, icon: Icon, text }) => (
    <button
      onClick={() => cambiarPestana(id)}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors w-full md:w-auto
        ${modo === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
    >
      <Icon size={18} /> {text}
    </button>
  );

  // ═══════════════════════════════════════════════════════════════
  // VISTAS DE AUTENTICACIÓN
  // ═══════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-10">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-md mb-4">
              <span className="text-white font-bold text-3xl">H</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">RRHH</h1>
            <p className="text-sm text-slate-500 mt-1">
              {authView === "login" ? "Acceso restringido al personal autorizado" : "Crea tu cuenta de empresa"}
            </p>
          </div>

          {/* ── FORMULARIO LOGIN ── */}
          {authView === "login" && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail size={18} className="text-slate-400" /></div>
                  <input
                    type="email" required
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    className="pl-10 w-full border border-slate-300 rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="correo@empresa.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock size={18} className="text-slate-400" /></div>
                  <input
                    type="password" required
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    className="pl-10 w-full border border-slate-300 rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {loginError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm border border-red-100">
                  <AlertCircle size={16} /> {loginError}
                </div>
              )}

              <button
                type="submit" disabled={loginLoading}
                className={`w-full py-2.5 rounded-lg text-white font-medium transition-colors shadow-sm ${loginLoading ? 'bg-slate-400' : 'bg-slate-800 hover:bg-slate-900'}`}
              >
                {loginLoading ? "Verificando..." : "Iniciar Sesión"}
              </button>

              <p className="text-center text-sm text-slate-500">
                ¿No tienes cuenta?{" "}
                <button type="button" onClick={() => { setAuthView("registro"); setLoginError(""); }}
                  className="text-blue-600 hover:underline font-medium">
                  Regístrate aquí
                </button>
              </p>
            </form>
          )}

          {/* ── FORMULARIO REGISTRO ── */}
          {authView === "registro" && (
            <form onSubmit={handleRegistro} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Empresa</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Building size={18} className="text-slate-400" /></div>
                  <input
                    type="text" required
                    value={regData.empresa}
                    onChange={(e) => setRegData({ ...regData, empresa: e.target.value })}
                    className="pl-10 w-full border border-slate-300 rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Empresa S.A. de C.V."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Mail size={18} className="text-slate-400" /></div>
                  <input
                    type="email" required
                    value={regData.email}
                    onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                    className="pl-10 w-full border border-slate-300 rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="admin@empresa.com"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock size={18} className="text-slate-400" /></div>
                  <input
                    type="password" required minLength={6}
                    value={regData.password}
                    onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                    className="pl-10 w-full border border-slate-300 rounded-lg py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>

              {regStatus && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${regStatus.startsWith("exito") ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                  {regStatus.startsWith("exito") ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  {regStatus.replace(/^exito:|^error:/, '')}
                </div>
              )}

              <button
                type="submit" disabled={regLoading}
                className={`w-full py-2.5 rounded-lg text-white font-medium transition-colors shadow-sm flex items-center justify-center gap-2 ${regLoading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                <UserPlus size={18} /> {regLoading ? "Creando cuenta..." : "Crear Cuenta"}
              </button>

              <button type="button" onClick={() => { setAuthView("login"); setRegStatus(""); }}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 py-2">
                <ArrowLeft size={16} /> Volver al inicio de sesión
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-400">© 2026 Sistema de Gestión de Recursos Humanos.<br />Todos los derechos reservados.</p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // SISTEMA PRINCIPAL
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* NAV */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo + empresa */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-lg">H</span>
              </div>
              <div className="hidden sm:block">
                <span className="text-xl font-bold tracking-tight text-slate-800">RRHH</span>
                {empresaNombre && <span className="ml-2 text-xs text-slate-400 font-normal">· {empresaNombre}</span>}
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              <NavButton id="dashboard" icon={LayoutDashboard} text="Dashboard" />
              <NavButton id="excel"     icon={UploadCloud}     text="Carga Masiva" />
              <NavButton id="qr"        icon={QrCode}          text="Lector de Acceso" />
              <NavButton id="empleados" icon={Users}           text="Directorio" />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleLogout}
                className="hidden sm:flex items-center gap-2 text-slate-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium">
                <LogOut size={18} /> Salir
              </button>
              <div className="md:hidden">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                  {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden absolute w-full bg-white border-b border-slate-200 shadow-xl px-4 pt-2 pb-4 space-y-2">
            <NavButton id="dashboard" icon={LayoutDashboard} text="Dashboard" />
            <NavButton id="excel"     icon={UploadCloud}     text="Carga Masiva" />
            <NavButton id="qr"        icon={QrCode}          text="Lector de Acceso" />
            <NavButton id="empleados" icon={Users}           text="Directorio" />
            <div className="border-t border-slate-100 my-2 pt-2"></div>
            <button onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 w-full transition-colors">
              <LogOut size={18} /> Cerrar Sesión
            </button>
          </div>
        )}
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── EXCEL ── */}
        {modo === 'excel' && (
          <div className="max-w-xl mx-auto bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <UploadCloud className="text-blue-600" /> Importación de Reportes Diarios
            </h2>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50 mb-6 hover:bg-slate-100 transition-colors">
              <input type="file" accept=".xlsx" onChange={handleFileChange}
                className="block w-full text-sm text-slate-500 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100" />
            </div>
            <button onClick={uploadFile} disabled={loading}
              className={`w-full py-2.5 rounded-lg text-white font-medium transition-colors ${loading ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {loading ? 'Sincronizando...' : 'Procesar Documento'}
            </button>
            {statusExcel && (
              <div className={`mt-4 p-4 rounded-lg text-sm flex items-start gap-2 ${statusExcel.includes('Éxito') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {statusExcel.includes('Éxito') ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
                <span>{statusExcel.replace(/Éxito: |Error: /g, '')}</span>
              </div>
            )}
          </div>
        )}

        {/* ── QR ── */}
        {modo === 'qr' && (
          <div className="max-w-xl mx-auto bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <QrCode className="text-blue-600" /> Terminal de Autenticación
            </h2>
            <div className="w-full aspect-square max-w-[280px] mx-auto bg-slate-900 rounded-xl border-4 border-slate-800 mb-8 overflow-hidden relative shadow-inner">
              <Scanner onScan={handleScan} allowMultiple={true} scanDelay={2000} onError={(e) => console.log(e)} />
              <div className="absolute inset-0 pointer-events-none border-[1px] border-white/20 m-8 rounded"></div>
            </div>
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <input type="number" placeholder="Ingreso manual de ID" value={idManual}
                onChange={(e) => setIdManual(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => registrarAsistencia(idManual)}
                className="w-full sm:w-auto bg-slate-800 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-slate-900 transition-colors">
                Verificar
              </button>
            </div>
            {statusQR && (
              <div className={`mt-4 p-4 rounded-lg text-sm flex items-start gap-2 ${statusQR.includes('Error') || statusQR.includes('Alerta') ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                {statusQR.includes('Éxito') ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
                <span>{statusQR.replace(/Éxito: |Error: |Alerta: /g, '')}</span>
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {modo === 'dashboard' && (
          <div className="w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <h2 className="text-2xl font-bold text-slate-800">Métricas de Asistencia</h2>
              <button onClick={cargarRegistros}
                className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors shadow-sm w-full sm:w-auto justify-center">
                <RefreshCw size={16} className={cargandoRegistros ? "animate-spin" : ""} /> Actualizar Datos
              </button>
            </div>

            {cargandoRegistros && estadisticas.resumen.length === 0 ? (
              <div className="flex justify-center py-12"><RefreshCw size={32} className="animate-spin text-slate-400" /></div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                  {estadisticas.resumen.map((item, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">{item.titulo}</span>
                      <span className={`text-4xl font-light tracking-tight ${item.titulo.includes('Faltan') ? 'text-red-600' : 'text-slate-800'}`}>{item.valor}</span>
                    </div>
                  ))}
                </div>

                {estadisticas.datos_grafica.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm mb-8 h-80">
                    <h3 className="text-slate-800 font-semibold mb-6">Volumen de Registros por Hora</h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={estadisticas.datos_grafica}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={30} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="asistencias" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                    <h3 className="text-sm font-semibold text-slate-800">Últimos accesos registrados</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 text-left font-medium text-slate-500">ID</th>
                          <th className="px-6 py-3 text-left font-medium text-slate-500">Marca de Tiempo</th>
                          <th className="px-6 py-3 text-left font-medium text-slate-500">Estatus</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {registros.length === 0 ? (
                          <tr><td colSpan="3" className="px-6 py-12 text-center text-slate-400">Sin datos de asistencia.</td></tr>
                        ) : registros.map((reg, i) => (
                          <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{reg.id_empleado}</td>
                            <td className="px-6 py-4 text-slate-500">{reg.hora_escaneo}</td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Autorizado</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── EMPLEADOS ── */}
        {modo === 'empleados' && (
          <div className="w-full max-w-5xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Directorio de Empleados</h2>
                <p className="text-slate-500 text-sm mt-1">Gestión administrativa de personal</p>
              </div>
            </div>

            <div className={`p-6 sm:p-8 rounded-xl shadow-sm border transition-colors ${modoEdicion ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-sm font-semibold uppercase tracking-wider mb-6 flex items-center gap-2 ${modoEdicion ? 'text-blue-800' : 'text-slate-800'}`}>
                {modoEdicion ? <Edit2 size={18} className="text-blue-600" /> : <Users size={18} className="text-blue-600" />}
                {modoEdicion ? 'Modificando Registro' : 'Registro de Nuevo Personal'}
              </h3>
              <form onSubmit={guardarEmpleado}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">ID (Nómina)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Hash size={14} className="text-slate-400" /></div>
                      <input type="number" value={nuevoEmpleado.id_empleado}
                        onChange={e => setNuevoEmpleado({ ...nuevoEmpleado, id_empleado: e.target.value })}
                        disabled={modoEdicion}
                        className={`pl-9 w-full border rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${modoEdicion ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'border-slate-300'}`}
                        placeholder="Ej. 101" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Nombre Completo</label>
                    <input type="text" value={nuevoEmpleado.nombre}
                      onChange={e => setNuevoEmpleado({ ...nuevoEmpleado, nombre: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nombre completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Puesto</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Briefcase size={14} className="text-slate-400" /></div>
                      <input type="text" value={nuevoEmpleado.puesto}
                        onChange={e => setNuevoEmpleado({ ...nuevoEmpleado, puesto: e.target.value })}
                        className="pl-9 w-full border border-slate-300 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Puesto" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Departamento</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Building size={14} className="text-slate-400" /></div>
                      <input type="text" value={nuevoEmpleado.departamento}
                        onChange={e => setNuevoEmpleado({ ...nuevoEmpleado, departamento: e.target.value })}
                        className="pl-9 w-full border border-slate-300 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Departamento" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button type="submit"
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${modoEdicion ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-800 hover:bg-slate-900'}`}>
                      {modoEdicion ? <CheckCircle size={16} /> : <Plus size={16} />}
                      {modoEdicion ? 'Guardar Cambios' : 'Procesar Alta'}
                    </button>
                    {modoEdicion && (
                      <button type="button" onClick={cancelarEdicion}
                        className="flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                        <XCircle size={16} /> Cancelar
                      </button>
                    )}
                  </div>
                  {statusEmpleados && (
                    <div className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${statusEmpleados.includes('Error') || statusEmpleados.includes('Alerta') ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {statusEmpleados.includes('Éxito') ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                      <span>{statusEmpleados.replace(/Éxito: |Error: |Alerta: /g, '')}</span>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                <h3 className="text-sm font-semibold text-slate-800">Plantilla Activa</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium text-slate-500 whitespace-nowrap">ID</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500 whitespace-nowrap">Nombre</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500 whitespace-nowrap">Puesto</th>
                      <th className="px-6 py-3 text-left font-medium text-slate-500 whitespace-nowrap">Departamento</th>
                      <th className="px-6 py-3 text-right font-medium text-slate-500 whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {empleados.length === 0 ? (
                      <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-400">El directorio está vacío.</td></tr>
                    ) : empleados.map((emp) => (
                      <tr key={emp.id_empleado}
                        className={`transition-colors ${modoEdicion && nuevoEmpleado.id_empleado === emp.id_empleado ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'}`}>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">#{emp.id_empleado}</td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">{emp.nombre}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">{emp.puesto}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">{emp.departamento}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => iniciarEdicion(emp)}
                              className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-md transition-colors" title="Modificar datos">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => eliminarEmpleado(emp.id_empleado, emp.nombre)}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-md transition-colors" title="Dar de baja">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;