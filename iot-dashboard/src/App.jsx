import React, { useEffect, useState } from "react";
// Importamos AreaChart y componentes necesarios para la gráfica suave y rellena
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { API_BASE, ADDRESSES } from "./config";
import "./App.css";

const ROLES = {
  owner: { key: "owner", label: "Owner (Administrador)" },
  company: { key: "company", label: "Company A" },
  government: { key: "government", label: "Government" },
};

function App() {
  const [role, setRole] = useState("company"); // vista por defecto
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | entities | companyMgmt

  // Datos simulados (cache en memoria desde /events) - Se mantienen por si quieres usarlos, aunque la gráfica usa chainData
  const [simEvents, setSimEvents] = useState([]);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);

  // Datos on-chain (pullDataByCompany / pullDataByGovernment)
  const [chainData, setChainData] = useState([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState(null);

  // --- Formularios (Owner) ---
  const [entityForm, setEntityForm] = useState({
    address: "",
    name: "",
    id: "",
    entityType: "company",
  });
  const [entitySubmitting, setEntitySubmitting] = useState(false);
  const [entityMessage, setEntityMessage] = useState("");

  // --- Formularios (Company - Site) ---
  const [siteForm, setSiteForm] = useState({
    siteId: "",
    lat: "",
    lon: "",
    benchmark: "",
  });
  const [siteSubmitting, setSiteSubmitting] = useState(false);
  const [siteMessage, setSiteMessage] = useState("");

  // --- Formularios (Company - Sensor) ---
  const [sensorForm, setSensorForm] = useState({
    sensorId: "",
  });
  const [sensorSubmitting, setSensorSubmitting] = useState(false);
  const [sensorMessage, setSensorMessage] = useState("");

  // --- CONFIG de direcciones por rol ---
  const currentAddress =
    role === "owner"
      ? ADDRESSES.owner
      : role === "company"
      ? ADDRESSES.company
      : ADDRESSES.government;

  // ======================================================
  // 1) Cargar datos simulados desde /events
  // ======================================================
  const loadSimEvents = async () => {
    try {
      setSimLoading(true);
      setSimError(null);

      const res = await fetch(`${API_BASE}/events`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setSimEvents(json.events || []);
    } catch (err) {
      console.error("Error cargando /events:", err);
      setSimError(err.message);
    } finally {
      setSimLoading(false);
    }
  };

  // ======================================================
  // 2) Cargar datos on-chain según el rol
  // ======================================================
  const loadChainData = async () => {
    try {
      setChainLoading(true);
      setChainError(null);

      // Owner: no puede llamar directamente pullDataByCompany / Government
      if (role === "owner") {
        setChainData([]);
        return;
      }

      let url = "";

      if (role === "company") {
        // /company/data?company=0x...
        url = `${API_BASE}/company/data?company=${encodeURIComponent(
          ADDRESSES.company
        )}`;
      } else if (role === "government") {
        // /government/data?gov=0x...&company=0x...
        url = `${API_BASE}/government/data?gov=${encodeURIComponent(
          ADDRESSES.government
        )}&company=${encodeURIComponent(ADDRESSES.company)}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setChainData(json.data || json.events || []); 
    } catch (err) {
      console.error("Error cargando datos on-chain:", err);
      setChainError(err.message);
    } finally {
      setChainLoading(false);
    }
  };

  // Cargar datos cuando cambia el rol o la pestaña es dashboard
  useEffect(() => {
    if (activeTab === "dashboard") {
      loadSimEvents();
      loadChainData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeTab]);

  // Helpers de formato
  const formatDate = (ts) => {
    if (!ts) return "-";
    const d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  };

  const avgValue = (arr) =>
    arr.length === 0
      ? 0
      : arr.reduce((acc, x) => acc + Number(x.value || 0), 0) / arr.length;

  // ======================================================
  // NUEVAS FUNCIONES PARA LA GRÁFICA Y MAX VALUE
  // ======================================================
  
  // Calcular valor máximo
  const getMaxValue = (data) => {
    if (!data || data.length === 0) return 0;
    const values = data.map((e) => Number(e.value));
    return Math.max(...values);
  };

  // Preparar datos para Recharts (AreaChart)
  // 1. Clonamos [...chainData] para no mutar el estado.
  // 2. Ordenamos por timestamp (ascendente) para que la línea vaya de izquierda a derecha correctamente.
  const chartData = [...chainData]
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
    .map((e) => ({
      time: new Date(Number(e.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
      value: Number(e.value),
      sensorId: e.sensorId
    }));

  // ======================================================
  // Handlers Owner: /owner/entity (CÓDIGO COMPLETO RESTAURADO)
  // ======================================================
  const handleEntitySubmit = async (e) => {
    e.preventDefault();
    setEntityMessage("");
    setEntitySubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/owner/entity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: entityForm.address.trim(),
          name: entityForm.name.trim(),
          id: entityForm.id.trim(),
          entityType: entityForm.entityType,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.details || json.error || "Error en /owner/entity");
      }

      setEntityMessage(`Entidad registrada. Tx: ${json.txHash}`);
      setEntityForm({ address: "", name: "", id: "", entityType: "company" });
    } catch (err) {
      console.error("Error /owner/entity:", err);
      setEntityMessage(`Error: ${err.message}`);
    } finally {
      setEntitySubmitting(false);
    }
  };

  // ======================================================
  // Handlers Company: /company/site (CÓDIGO COMPLETO RESTAURADO)
  // ======================================================
  const handleSiteSubmit = async (e) => {
    e.preventDefault();
    setSiteMessage("");
    setSiteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/company/site`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: siteForm.siteId.trim(),
          lat: siteForm.lat.trim(),
          lon: siteForm.lon.trim(),
          benchmark: Number(siteForm.benchmark),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.details || json.error || "Error en /company/site");
      }

      setSiteMessage(`Site registrado. Tx: ${json.txHash}`);
      setSiteForm({ siteId: "", lat: "", lon: "", benchmark: "" });
    } catch (err) {
      console.error("Error /company/site:", err);
      setSiteMessage(`Error: ${err.message}`);
    } finally {
      setSiteSubmitting(false);
    }
  };

  // ======================================================
  // Handlers Company: /company/sensor (CÓDIGO COMPLETO RESTAURADO)
  // ======================================================
  const handleSensorSubmit = async (e) => {
    e.preventDefault();
    setSensorMessage("");
    setSensorSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/company/sensor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sensorId: sensorForm.sensorId.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.details || json.error || "Error en /company/sensor"
        );
      }

      setSensorMessage(`Sensor registrado. Tx: ${json.txHash}`);
      setSensorForm({ sensorId: "" });
    } catch (err) {
      console.error("Error /company/sensor:", err);
      setSensorMessage(`Error: ${err.message}`);
    } finally {
      setSensorSubmitting(false);
    }
  };

  // ======================================================
  // RENDER
  // ======================================================
  return (
    <div className="app-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <h1 className="app-title">BioT Dashboard</h1>

        <section className="sidebar-section">
          <h2 className="sidebar-title">Rol actual</h2>
          <div className="role-buttons">
            {Object.values(ROLES).map((r) => (
              <button
                key={r.key}
                className={`role-btn ${role === r.key ? "active" : ""}`}
                onClick={() => setRole(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="current-address">
            <span>Address:</span>
            <code>{currentAddress}</code>
          </div>
        </section>

        <section className="sidebar-section">
          <h2 className="sidebar-title">Secciones</h2>
          <button
            className={`nav-btn ${
              activeTab === "dashboard" ? "nav-active" : ""
            }`}
            onClick={() => setActiveTab("dashboard")}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${
              activeTab === "entities" ? "nav-active" : ""
            }`}
            onClick={() => setActiveTab("entities")}
          >
            🛡️ Gestión de entidades (Owner)
          </button>
          <button
            className={`nav-btn ${
              activeTab === "companyMgmt" ? "nav-active" : ""
            }`}
            onClick={() => setActiveTab("companyMgmt")}
          >
            🏭 Gestión Company (sites / sensores)
          </button>
        </section>
      </aside>

      {/* Main content */}
      <main className="main">
        {activeTab === "dashboard" && (
          <section className="tab-panel">
            <header className="panel-header">
              <h2>Dashboard de datos</h2>
              <button
                className="refresh-btn"
                onClick={() => {
                  loadSimEvents();
                  loadChainData();
                }}
              >
                🔄 Actualizar
              </button>
            </header>
{/* 1. GRÁFICA (ARRIBA - ANCHO COMPLETO) */}
            <div className="table-card" style={{ marginBottom: '1.5rem', minHeight: '350px' }}>
              <h3>Tendencia CO2 en Tiempo Real (On-Chain)</h3>
              {chainLoading ? <p>Cargando gráfica...</p> : chainError ? <p className="error-text">{chainError}</p> : role === "owner" ? <p className="info-text">Selecciona rol de Company o Government.</p> : chartData.length === 0 ? <p className="info-text">No hay datos.</p> : (
                <div style={{ width: '100%', height: '280px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis dataKey="time" minTickGap={30} tick={{fill: '#94a3b8'}} />
                      <YAxis tick={{fill: '#94a3b8'}} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#fff" }} />
                      <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" dot={false} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 2. SECCIÓN INFERIOR DIVIDIDA: TABLA (IZQ) Y CARDS (DER) */}
            <div className="dashboard-row">
              
              {/* IZQUIERDA: TABLA HISTORIAL */}
              <div className="table-card" style={{ flex: 3 }}>
                <h3>Historial de Transacciones</h3>
                {chainData.length === 0 ? <p className="info-text">Sin datos disponibles.</p> : (
                  <div className="table-wrapper" style={{ maxHeight: '400px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Sensor</th>
                          <th>Site</th>
                          <th>Valor</th>
                          <th>Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chainData.slice().reverse().map((d, idx) => (
                          <tr key={idx}>
                            <td>{d.sensorId}</td>
                            <td>{d.siteId}</td>
                            <td><strong>{d.value}</strong></td>
                            <td>{formatDate(d.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* DERECHA: KPI CARDS APILADAS */}
              <div className="cards-column" style={{ flex: 1 }}>
                <div className="card">
                  <h3>Pico Máximo</h3>
                  {chainLoading ? <p>...</p> : role === "owner" ? <span className="metric-sub">-</span> : (
                    <>
                      <p className="metric-big" style={{ color: '#ef4444' }}>{getMaxValue(chainData)}</p>
                      <p className="metric-label">CO2 más alto</p>
                    </>
                  )}
                </div>

                <div className="card">
                  <h3>Promedio</h3>
                  {chainLoading ? <p>...</p> : role === "owner" ? <span className="metric-sub">-</span> : (
                    <>
                      <p className="metric-big" style={{ color: '#38bdf8' }}>{avgValue(chainData).toFixed(1)}</p>
                      <p className="metric-label">Valor medio</p>
                    </>
                  )}
                </div>

                <div className="card">
                  <h3>Registros</h3>
                  {chainLoading ? <p>...</p> : role === "owner" ? <span className="metric-sub">-</span> : (
                    <>
                      <p className="metric-big" style={{ color: '#22c55e' }}>{chainData.length}</p>
                      <p className="metric-label">Total eventos</p>
                    </>
                  )}
                </div>
              </div>
            </div>

          </section>
        )}

        {/* PESTAÑA ENTITIES (Restaurada completa) */}
        {activeTab === "entities" && (
          <section className="tab-panel">
            <h2>Gestión de entidades (Owner)</h2>
            <p className="info-text">
              Este panel llama al endpoint <code>POST /owner/entity</code> y
              ejecuta <code>addEntity</code> en el contrato usando la cuenta de
              Owner.
            </p>
            <form className="form-grid" onSubmit={handleEntitySubmit}>
              <div className="form-field">
                <label>Dirección de la entidad</label>
                <input
                  type="text"
                  value={entityForm.address}
                  onChange={(e) =>
                    setEntityForm({ ...entityForm, address: e.target.value })
                  }
                  placeholder="0x..."
                  required
                />
              </div>
              <div className="form-field">
                <label>Nombre</label>
                <input
                  type="text"
                  value={entityForm.name}
                  onChange={(e) =>
                    setEntityForm({ ...entityForm, name: e.target.value })
                  }
                  placeholder="Empresa A / Gobierno X"
                  required
                />
              </div>
              <div className="form-field">
                <label>ID / NIF</label>
                <input
                  type="text"
                  value={entityForm.id}
                  onChange={(e) =>
                    setEntityForm({ ...entityForm, id: e.target.value })
                  }
                  placeholder="RUC / ID institucional"
                  required
                />
              </div>
              <div className="form-field">
                <label>Tipo de entidad</label>
                <select
                  value={entityForm.entityType}
                  onChange={(e) =>
                    setEntityForm({
                      ...entityForm,
                      entityType: e.target.value,
                    })
                  }
                >
                  <option value="company">Company</option>
                  <option value="government">Government</option>
                </select>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  disabled={entitySubmitting}
                  className="primary-btn"
                >
                  {entitySubmitting ? "Enviando..." : "Registrar entidad"}
                </button>
              </div>
            </form>
            {entityMessage && (
              <p
                className={
                  entityMessage.startsWith("Error")
                    ? "error-text"
                    : "success-text"
                }
              >
                {entityMessage}
              </p>
            )}
          </section>
        )}

        {/* PESTAÑA COMPANY MGMT (Restaurada completa) */}
        {activeTab === "companyMgmt" && (
          <section className="tab-panel">
            <h2>Gestión Company (Sites / Sensores)</h2>
            <p className="info-text">
              Estos formularios usan la cuenta <code>COMPANY_A</code> para
              llamar a <code>registerSite</code> y <code>registerSensor</code>{" "}
              en el contrato.
            </p>

            <div className="two-columns">
              {/* Registrar Site */}
              <div className="card">
                <h3>Registrar Site</h3>
                <form onSubmit={handleSiteSubmit}>
                  <div className="form-field">
                    <label>Site ID</label>
                    <input
                      type="text"
                      value={siteForm.siteId}
                      onChange={(e) =>
                        setSiteForm({
                          ...siteForm,
                          siteId: e.target.value,
                        })
                      }
                      placeholder="siteA / planta1"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Latitud</label>
                    <input
                      type="text"
                      value={siteForm.lat}
                      onChange={(e) =>
                        setSiteForm({ ...siteForm, lat: e.target.value })
                      }
                      placeholder="-1.2345"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Longitud</label>
                    <input
                      type="text"
                      value={siteForm.lon}
                      onChange={(e) =>
                        setSiteForm({ ...siteForm, lon: e.target.value })
                      }
                      placeholder="-78.1234"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Benchmark (umbral)</label>
                    <input
                      type="number"
                      min="1"
                      value={siteForm.benchmark}
                      onChange={(e) =>
                        setSiteForm({
                          ...siteForm,
                          benchmark: e.target.value,
                        })
                      }
                      placeholder="800"
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="submit"
                      disabled={siteSubmitting}
                      className="primary-btn"
                    >
                      {siteSubmitting ? "Enviando..." : "Registrar site"}
                    </button>
                  </div>
                </form>
                {siteMessage && (
                  <p
                    className={
                      siteMessage.startsWith("Error")
                        ? "error-text"
                        : "success-text"
                    }
                  >
                    {siteMessage}
                  </p>
                )}
              </div>

              {/* Registrar Sensor */}
              <div className="card">
                <h3>Registrar Sensor</h3>
                <form onSubmit={handleSensorSubmit}>
                  <div className="form-field">
                    <label>Sensor ID</label>
                    <input
                      type="text"
                      value={sensorForm.sensorId}
                      onChange={(e) =>
                        setSensorForm({
                          ...sensorForm,
                          sensorId: e.target.value,
                        })
                      }
                      placeholder="sensorA / sensorB"
                      required
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      type="submit"
                      disabled={sensorSubmitting}
                      className="primary-btn"
                    >
                      {sensorSubmitting ? "Enviando..." : "Registrar sensor"}
                    </button>
                  </div>
                </form>
                {sensorMessage && (
                  <p
                    className={
                      sensorMessage.startsWith("Error")
                        ? "error-text"
                        : "success-text"
                    }
                  >
                    {sensorMessage}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;