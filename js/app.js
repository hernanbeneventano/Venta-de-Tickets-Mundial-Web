// ============================================================
//  COPA 26 · LÓGICA
//  Navegación entre vistas + render + flujo de compra.
//  (El estado vive en memoria; al recargar la página se reinicia.)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged, fetchSignInMethodsForEmail, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

// ---------- Estado ----------
let MIS_ENTRADAS = [];          // entradas compradas
let filtroGrupo = "TODOS";      // filtro de la lista de partidos
const API_BASE_URL = (window.API_BASE_URL || "https://mundialapi-zbsj.onrender.com/api").replace(/\/$/, "");
let currentUser = null;
let userId = "guest";
let authStateResolved = false;
const firebaseConfig = {
  apiKey: "AIzaSyAy0gCGtzPxw5FsmYCSS2NgGFHzAZTf4Yw",
  authDomain: "app-venta-de-tickets-mundial.firebaseapp.com",
  projectId: "app-venta-de-tickets-mundial",
  storageBucket: "app-venta-de-tickets-mundial.firebasestorage.app",
  messagingSenderId: "94417842841",
  appId: "1:94417842841:web:93a42272ed98381669be08",
  measurementId: "G-GYH06V613X"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
console.debug("Firebase config:", firebaseApp.options);

async function initializeAuthPersistence() {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch (error) {
    console.warn("No se pudo configurar la persistencia de sesión:", error);
  }
}

void initializeAuthPersistence();
const compra = {                // selección actual en la vista Comprar
  matchId: PARTIDOS[0].id,
  catId: CATEGORIAS[1].id,
  qty: 1,
};
const pago = {
  metodo: "Tarjeta de Crédito",
};
const CARGO_SERVICIO = 12;      // USD por entrada

const IS_AUTH_PAGE = window.location.pathname.endsWith("auth.html");
const IS_MAIN_PAGE = window.location.pathname.endsWith("index.html") || window.location.pathname.endsWith("/");

function currentPageName() {
  if (IS_AUTH_PAGE) return "auth";
  if (IS_MAIN_PAGE) return "main";
  return "main";
}

function ensureAuthRedirect() {
  if (currentPageName() === "auth" && currentUser) {
    window.location.href = "index.html";
    return true;
  }
  return false;
}

function setupNavigationHooks() {
  if (!IS_MAIN_PAGE) return;
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a[href='auth.html']");
    if (!anchor) return;
    if (!currentUser) return;
    event.preventDefault();
    window.location.href = "index.html";
  });
}

setupNavigationHooks();

// ---------- Atajos ----------
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const money = (n) => "$" + n.toLocaleString("en-US");

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function fecha(iso) {
  const d = new Date(iso + "T12:00:00");
  return { dia: d.getDate(), mes: MESES[d.getMonth()], semana: DIAS[d.getDay()] };
}
function fechaLarga(iso) {
  const f = fecha(iso);
  return `${f.semana} ${f.dia} de ${f.mes}.`;
}
function getMatch(id) { return PARTIDOS.find((m) => m.id === id); }
function getCat(id)   { return CATEGORIAS.find((c) => c.id === id); }
function precioDesde(){ return Math.min(...CATEGORIAS.map((c) => c.precio)); }

function logoutCurrentUser() {
  signOut(auth)
    .then(() => {
      currentUser = null;
      userId = "guest";
      renderAuthView();
      if (IS_MAIN_PAGE) {
        window.location.href = "auth.html";
        return;
      }
      renderApp();
      cargarMisEntradasDesdeApi();
      toast("Se cerró la sesión.");
    })
    .catch((error) => console.warn("Error al cerrar sesión:", error));
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    throw new Error(data?.message || data || `Error ${response.status}`);
  }

  return data;
}

function obtenerHora(fechaIso) {
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return "00:00";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function mapPartidoApi(p) {
  const fechaRaw = p.fecha || "";
  const d = new Date(fechaRaw);
  const fechaIso = Number.isNaN(d.getTime()) ? fechaRaw : d.toISOString().slice(0, 10);
  const estadioRaw = p.estadio || "";
  const ciudadMatch = estadioRaw.match(/\((.*?)\)/);
  const ciudad = ciudadMatch ? ciudadMatch[1].split(",")[0].trim() : "Ciudad sin definir";
  const estadio = estadioRaw.replace(/\s*\(.*\)\s*$/, "").trim() || estadioRaw || "Estadio sin definir";

  return {
    id: p.id,
    local: p.equipo1 || "Equipo",
    localFlag: p.flag1 || "",
    visita: p.equipo2 || "Equipo",
    visitaFlag: p.flag2 || "",
    grupo: p.grupo || "A",
    fecha: fechaIso,
    hora: obtenerHora(fechaRaw),
    estadio,
    ciudad,
    destacado: false,
    precio: Number(p.precio) || 0,
  };
}

function mapCategoriasDesdePartidos() {
  const precios = PARTIDOS.map((p) => Number(p.precio) || 0).filter(Boolean);
  const base = precios.length ? Math.max(...precios) : 230;
  return [
    { id: "cat1", nombre: "Categoría 1", detalle: "Tribuna premium", precio: Math.max(120, Math.round(base * 1.45)) },
    { id: "cat2", nombre: "Categoría 2", detalle: "Tribuna media", precio: Math.max(100, Math.round(base * 1.15)) },
    { id: "cat3", nombre: "Categoría 3", detalle: "General", precio: Math.max(90, Math.round(base * 0.8)) },
    { id: "cat4", nombre: "Categoría 4", detalle: "Acceso general", precio: Math.max(70, Math.round(base * 0.5)) },
  ];
}

function mapCompraApiToEntrada(compra) {
  const match = getMatch(compra.partidoId) || {
    local: "Partido",
    visita: "",
    fecha: "",
    hora: "",
    estadio: "",
    ciudad: "",
    grupo: "",
  };
  const precioUnitario = Number(compra.total) / Math.max(1, Number(compra.cantidad) || 1);
  const nombreCat = precioUnitario >= 250 ? "Tribuna premium" : precioUnitario >= 180 ? "Tribuna media" : "General";
  return {
    id: compra.id,
    match,
    cat: { nombre: nombreCat },
    asiento: `A-${String(Math.abs(compra.total) % 40 + 1)}`,
    codigo: `CP26-${String(compra.id || "WEB").slice(0, 6).toUpperCase()}`,
  };
}

async function cargarDatosDesdeApi() {
  try {
    const partidosApi = await apiFetch("/partidos");
    const partidos = Array.isArray(partidosApi) ? partidosApi : [];
    PARTIDOS.splice(0, PARTIDOS.length, ...partidos.map(mapPartidoApi));
    CATEGORIAS.splice(0, CATEGORIAS.length, ...mapCategoriasDesdePartidos());

    if (!PARTIDOS.some((m) => m.id === compra.matchId) && PARTIDOS.length) {
      compra.matchId = PARTIDOS[0].id;
    }

    renderApp();
    await cargarMisEntradasDesdeApi();
  } catch (error) {
    console.error("No se pudo conectar con la API:", error);
    toast("No se pudo conectar con la API. Se muestran los datos locales.");
  }
}

async function cargarMisEntradasDesdeApi() {
  if (!currentUser) {
    MIS_ENTRADAS = [];
    actualizarContador();
    renderEntradas();
    return;
  }

  try {
    const comprasApi = await apiFetch(`/compras/usuario/${encodeURIComponent(userId)}`);
    const compras = Array.isArray(comprasApi) ? comprasApi : [];
    MIS_ENTRADAS = compras.map(mapCompraApiToEntrada);
  } catch (error) {
    console.warn("No se pudieron cargar las compras desde la API:", error);
    MIS_ENTRADAS = [];
  }

  actualizarContador();
  renderEntradas();
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function isProtectedView(vista) {
  return ["comprar", "entradas"].includes(vista);
}

function irA(vista) {
  if (isProtectedView(vista) && !currentUser && authStateResolved) {
    window.location.href = "auth.html";
    return;
  }

  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + vista));
  $$(".nav__link").forEach((l) => l.classList.toggle("is-active", l.dataset.view === vista));
  $("#nav").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Delegación: cualquier elemento con data-view navega
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-view]");
  if (el) { e.preventDefault(); irA(el.dataset.view); }
});

const navToggle = $("#navToggle");
if (navToggle) {
  navToggle.addEventListener("click", () => $("#nav").classList.toggle("is-open"));
}

// ============================================================
//  TICKET (HTML reutilizable)
// ============================================================
function qrSVG() {
  // QR falso decorativo: patrón pseudo-aleatorio estable
  let cells = "";
  for (let i = 0; i < 49; i++) {
    const x = (i % 7) * 10, y = Math.floor(i / 7) * 10;
    if ((i * 7 + 3) % 5 < 2 || i % 9 === 0) cells += `<rect x="${x}" y="${y}" width="10" height="10"/>`;
  }
  return `<svg class="qr" viewBox="0 0 70 70" fill="var(--ink)">
    <rect x="0" y="0" width="20" height="20" fill="none" stroke="var(--ink)" stroke-width="4"/>
    <rect x="50" y="0" width="20" height="20" fill="none" stroke="var(--ink)" stroke-width="4"/>
    <rect x="0" y="50" width="20" height="20" fill="none" stroke="var(--ink)" stroke-width="4"/>
    ${cells}</svg>`;
}

function renderFlag(flagUrl, altText) {
  if (!flagUrl) return `<span class="flag flag--text" aria-label="${altText}">${altText.slice(0, 2)}</span>`;
  return `<img class="flag flag--img" src="${flagUrl}" alt="${altText}" loading="lazy" />`;
}

function ticketHTML(m, { cat, asiento, codigo } = {}) {
  const f = fecha(m.fecha);
  return `
  <div class="ticket-stub">
    <div class="ticket-stub__main">
      <div class="ticket-stub__teams">
        ${renderFlag(m.localFlag, m.local)}
        <span class="ticket-stub__vs">VS</span>
        ${renderFlag(m.visitaFlag, m.visita)}
      </div>
      <div class="ticket-stub__match">${m.local} — ${m.visita}</div>
      <div class="ticket-stub__grid">
        <div><div class="k">Fecha</div><div class="v">${f.dia} ${f.mes} · ${m.hora}</div></div>
        <div><div class="k">Grupo</div><div class="v">Grupo ${m.grupo}</div></div>
        <div><div class="k">Estadio</div><div class="v">${m.estadio}</div></div>
        <div><div class="k">${cat ? "Tribuna" : "Ciudad"}</div><div class="v">${cat ? cat.nombre : m.ciudad}</div></div>
      </div>
    </div>
    <div class="ticket-stub__tear">
      ${qrSVG()}
      <div class="ticket-stub__seat">
        ${asiento ? `<b>${asiento}</b>ASIENTO` : `<b>${m.grupo}</b>GRUPO`}
        ${codigo ? `<div style="margin-top:6px">${codigo}</div>` : ""}
      </div>
    </div>
  </div>`;
}

// ============================================================
//  VISTA: PARTIDOS
// ============================================================
function renderHero() {
  const m = PARTIDOS.find((p) => p.destacado) || PARTIDOS[0];
  $("#heroTitle").textContent = `${m.local} vs ${m.visita}`;
  $("#heroMeta").textContent = `${fechaLarga(m.fecha)} · ${m.hora} h · ${m.estadio}, ${m.ciudad}`;
  $("#heroTicket").innerHTML = ticketHTML(m, { cat: getCat("cat1") });
  $("#heroBtn").onclick = () => abrirCompra(m.id);
}

function renderChips() {
  const grupos = ["TODOS", ...new Set(PARTIDOS.map((m) => m.grupo))];
  $("#grupoChips").innerHTML = grupos
    .map((g) => `<button class="chip ${g === filtroGrupo ? "is-active" : ""}" data-grupo="${g}">${g === "TODOS" ? "Todos" : "Grupo " + g}</button>`)
    .join("");
  $$("#grupoChips .chip").forEach((c) =>
    c.addEventListener("click", () => { filtroGrupo = c.dataset.grupo; renderChips(); renderMatches(); })
  );
}

function renderMatches() {
  const lista = PARTIDOS.filter((m) => filtroGrupo === "TODOS" || m.grupo === filtroGrupo);
  $("#matchGrid").innerHTML = lista.map((m) => {
    const f = fecha(m.fecha);
    return `
    <article class="card">
      <div class="card__top">
        <span class="tag">Grupo ${m.grupo}</span>
        <span class="card__date">${f.dia} ${f.mes.toUpperCase()} · ${m.hora}</span>
      </div>
      <div class="card__teams">
        <div class="team">${renderFlag(m.localFlag, m.local)} <span class="team__name">${m.local}</span></div>
        <div class="card__sep">VS</div>
        <div class="team">${renderFlag(m.visitaFlag, m.visita)} <span class="team__name">${m.visita}</span></div>
      </div>
      <div class="card__venue">📍 ${m.estadio}, ${m.ciudad}</div>
      <div class="card__foot">
        <div class="card__price"><span>desde</span><b>${money(precioDesde())}</b></div>
        <button class="btn btn--field" data-buy="${m.id}">Comprar</button>
      </div>
    </article>`;
  }).join("");

  $$("#matchGrid [data-buy]").forEach((b) =>
    b.addEventListener("click", () => abrirCompra(b.dataset.buy))
  );
}

// ============================================================
//  VISTA: COMPRAR
// ============================================================
function abrirCompra(matchId) {
  compra.matchId = matchId;
  compra.qty = 1;
  $("#buyMatch").value = matchId;
  renderCats();
  renderResumen();
  irA("comprar");
}

function renderMatchSelect() {
  const select = $("#buyMatch");
  select.innerHTML = PARTIDOS.map((m) => {
    const f = fecha(m.fecha);
    return `<option value="${m.id}">${m.local} vs ${m.visita} · ${f.dia} ${f.mes} ${m.hora}h</option>`;
  }).join("");
  select.value = compra.matchId;
  select.onchange = (e) => { compra.matchId = e.target.value; renderResumen(); };
}

function renderCats() {
  $("#buyCats").innerHTML = CATEGORIAS.map((c) => `
    <button class="cat ${c.id === compra.catId ? "is-active" : ""}" data-cat="${c.id}">
      <span class="cat__dot"></span>
      <span class="cat__txt"><b>${c.nombre}</b><span>${c.detalle}</span></span>
      <span class="cat__price">${money(c.precio)}</span>
    </button>`).join("");
  $$("#buyCats .cat").forEach((el) =>
    el.addEventListener("click", () => { compra.catId = el.dataset.cat; renderCats(); renderResumen(); })
  );
}

function renderResumen() {
  const m = getMatch(compra.matchId);
  const c = getCat(compra.catId);
  const sub = c.precio * compra.qty;
  const fee = CARGO_SERVICIO * compra.qty;
  $("#qtyValue").textContent = compra.qty;
  $("#sumMatch").textContent = `${m.local} vs ${m.visita}`;
  $("#sumCat").textContent = c.nombre;
  $("#sumQty").textContent = compra.qty;
  $("#sumFee").textContent = money(fee);
  $("#sumPayment").textContent = pago.metodo;
  $("#sumTotal").textContent = money(sub + fee);
}

function getSelectedPaymentMethod() {
  const selected = $("input[name='paymentMethod']:checked");
  return selected ? selected.value : "Tarjeta de Crédito";
}

function renderPaymentForm() {
  pago.metodo = getSelectedPaymentMethod();
  const cardGroup = $("#cardFields");
  const walletGroup = $("#walletFields");

  if (cardGroup) cardGroup.hidden = pago.metodo !== "Tarjeta de Crédito";
  if (walletGroup) walletGroup.hidden = pago.metodo === "Tarjeta de Crédito";

  clearPaymentError();
}

function installPaymentListeners() {
  $$("input[name='paymentMethod']").forEach((input) => {
    input.addEventListener("change", () => {
      renderPaymentForm();
      renderResumen();
    });
  });

  const cardNumberInput = $("#cardNumber");
  if (cardNumberInput) {
    cardNumberInput.addEventListener("input", (event) => {
      const digits = event.target.value.replace(/\D/g, "").slice(0, 19);
      event.target.value = formatCardNumber(digits);
    });
  }

  const cardHolderInput = $("#cardHolder");
  if (cardHolderInput) {
    cardHolderInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, "");
    });
  }

  const cardCvvInput = $("#cardCvv");
  if (cardCvvInput) {
    cardCvvInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 3);
    });
  }

  const cardExpiryInput = $("#cardExpiry");
  if (cardExpiryInput) {
    cardExpiryInput.addEventListener("input", (event) => {
      const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
      event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });
  }

  const walletAliasInput = $("#walletAlias");
  if (walletAliasInput) {
    walletAliasInput.addEventListener("input", (event) => {
      event.target.value = event.target.value.replace(/[^a-zA-Z0-9.]/g, "");
    });
  }
}

function showPaymentError(message) {
  const el = $("#buyPaymentError");
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function clearPaymentError() {
  showPaymentError("");
}

function formatCardNumber(value) {
  return String(value).replace(/\D/g, "").match(/.{1,4}/g)?.join(" ") || "";
}

function validatePayment() {
  const metodo = getSelectedPaymentMethod();
  if (metodo === "Tarjeta de Crédito") {
    const cardNumber = $("#cardNumber").value.replace(/\D/g, "");
    const titular = $("#cardHolder").value.trim();
    const cvv = $("#cardCvv").value.trim();
    const expiry = $("#cardExpiry").value.trim();
    const regexTitular = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

    if (!cardNumber) {
      showPaymentError("Ingresá el número de tarjeta.");
      return false;
    }
    if (!/^\d{13,19}$/.test(cardNumber)) {
      showPaymentError("El número de tarjeta debe tener entre 13 y 19 dígitos.");
      return false;
    }
    if (!titular) {
      showPaymentError("Ingresá el nombre del titular.");
      return false;
    }
    if (!regexTitular.test(titular)) {
      showPaymentError("El nombre del titular solo puede contener letras y espacios.");
      return false;
    }
    if (!/^\d{3}$/.test(cvv)) {
      showPaymentError("El CVV debe tener 3 dígitos.");
      return false;
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      showPaymentError("La fecha de vencimiento debe tener formato MM/AA.");
      return false;
    }

    const [monthStr, yearStr] = expiry.split("/");
    const month = Number(monthStr);
    const year = Number(`20${yearStr}`);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    if (month < 1 || month > 12) {
      showPaymentError("El mes de vencimiento es inválido.");
      return false;
    }
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      showPaymentError("La tarjeta está vencida.");
      return false;
    }

    return true;
  }

  const alias = $("#walletAlias").value.trim();
  if (!alias) {
    showPaymentError("Ingresá alias o CVU de la billetera.");
    return false;
  }
  if (!/^[a-zA-Z0-9.]+$/.test(alias)) {
    showPaymentError("El alias/CVU solo puede contener letras, números y puntos.");
    return false;
  }
  return true;
}

function buildPaymentPayload() {
  const metodoPago = getSelectedPaymentMethod();
  let pagoTitular = null;
  let pagoTarjetaMascara = null;
  let pagoCvuAlias = null;

  if (metodoPago === "Tarjeta de Crédito") {
    const cardNumber = $("#cardNumber").value.replace(/\D/g, "");
    pagoTitular = $("#cardHolder").value.trim();
    pagoTarjetaMascara = `**** **** **** ${cardNumber.slice(-4)}`;
  } else {
    pagoCvuAlias = $("#walletAlias").value.trim();
  }

  return {
    metodoPago,
    pago_titular: pagoTitular,
    pago_tarjeta_mascara: pagoTarjetaMascara,
    pago_cvu_alias: pagoCvuAlias,
  };
}

// Stepper de cantidad
const qtyPlus = $("#qtyPlus");
if (qtyPlus) {
  qtyPlus.addEventListener("click", () => { if (compra.qty < 6) { compra.qty++; renderResumen(); } });
}
const qtyMinus = $("#qtyMinus");
if (qtyMinus) {
  qtyMinus.addEventListener("click", () => { if (compra.qty > 1) { compra.qty--; renderResumen(); } });
}

if (IS_MAIN_PAGE) {
  installPaymentListeners();
}

// Confirmar compra
const buyConfirm = $("#buyConfirm");
if (buyConfirm) {
  buyConfirm.addEventListener("click", async () => {
    if (!currentUser) {
      toast("Necesitás iniciar sesión para confirmar una compra.");
      window.location.href = "auth.html";
      return;
    }

    clearPaymentError();
    if (!validatePayment()) {
      return;
    }

    const m = getMatch(compra.matchId);
    const c = getCat(compra.catId);
    const payment = buildPaymentPayload();

    try {
      const payload = {
        userId,
        partidoId: m.id,
        equipo1: m.local,
        equipo2: m.visita,
        cantidad: compra.qty,
        total: (c.precio + CARGO_SERVICIO) * compra.qty,
        metodoPago: payment.metodoPago,
        fechaCompra: Date.now(),
        pago_titular: payment.pago_titular,
        pago_tarjeta_mascara: payment.pago_tarjeta_mascara,
        pago_cvu_alias: payment.pago_cvu_alias,
      };

      await apiFetch("/compras", { method: "POST", body: JSON.stringify(payload) });
      await cargarMisEntradasDesdeApi();
      toast(`¡Listo! Registramos <b>${compra.qty}</b> entrada${compra.qty > 1 ? "s" : ""} en la API.`);
      compra.qty = 1;
      renderResumen();
      irA("entradas");
    } catch (error) {
      toast(`No se pudo registrar la compra: ${error.message}`);
    }
  });
}

// ============================================================
//  VISTA: MIS ENTRADAS
// ============================================================
function renderEntradas() {
  const wrap = $("#ticketsWrap");
  const empty = $("#ticketsEmpty");
  if (MIS_ENTRADAS.length === 0) {
    wrap.innerHTML = ""; empty.style.display = "block";
    $("#entradasCount").textContent = "";
    return;
  }
  empty.style.display = "none";
  $("#entradasCount").textContent = `${MIS_ENTRADAS.length} entrada${MIS_ENTRADAS.length > 1 ? "s" : ""}`;
  wrap.innerHTML = MIS_ENTRADAS
    .map((t) => ticketHTML(t.match, { cat: t.cat, asiento: t.asiento, codigo: t.codigo }))
    .join("");
}

function actualizarContador() {
  const n = MIS_ENTRADAS.length;
  const badge = $("#navCount");
  badge.textContent = n;
  badge.hidden = n === 0;
}

// ============================================================
//  VISTA: HORARIOS (agenda por día)
// ============================================================
function renderAgenda() {
  const porDia = {};
  PARTIDOS.slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .forEach((m) => { (porDia[m.fecha] ||= []).push(m); });

  $("#agenda").innerHTML = Object.entries(porDia).map(([iso, lista]) => {
    const f = fecha(iso);
    const slots = lista.map((m) => `
      <div class="slot">
        <div class="slot__time">${m.hora}<span>HS LOCAL</span></div>
        <div class="slot__match">${m.local} vs ${m.visita}
          <small>📍 ${m.estadio}, ${m.ciudad}</small>
        </div>
        <span class="slot__grupo">Grupo ${m.grupo}</span>
      </div>`).join("");
    return `
      <div class="day">
        <div class="day__head">
          <span class="day__num">${String(f.dia).padStart(2, "0")}</span>
          <span class="day__label">${f.semana} · ${f.mes}. 2026</span>
        </div>
        ${slots}
      </div>`;
  }).join("");
}

// ============================================================
//  TOAST
// ============================================================
let toastTimer;
function toast(html) {
  const t = $("#toast");
  t.innerHTML = html; t.hidden = false;
  requestAnimationFrame(() => t.classList.add("is-show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("is-show");
    setTimeout(() => (t.hidden = true), 250);
  }, 3200);
}

// ============================================================
//  INIT
// ============================================================
function getAccountInitials() {
  if (!currentUser) return "U";
  const base = currentUser.displayName || currentUser.email || "Usuario";
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return base.charAt(0).toUpperCase();
}

function renderAccountButton() {
  const button = $("#accountButton");
  const initial = $("#accountInitial");
  const menuAvatar = $("#accountMenuAvatar");
  const menuName = $("#accountMenuName");
  const menuEmail = $("#accountMenuEmail");
  const menuAction = $("#accountMenuAction");
  const logoutBtn = $("#logoutBtn");
  const initials = getAccountInitials();

  if (initial) initial.textContent = initials;
  if (menuAvatar) menuAvatar.textContent = initials;

  if (currentUser) {
    const displayName = currentUser.displayName || currentUser.email?.split("@")[0] || "Usuario";
    const email = currentUser.email || "";
    if (menuName) menuName.textContent = displayName;
    if (menuEmail) menuEmail.textContent = email;
    if (menuAction) menuAction.hidden = true;
    if (logoutBtn) logoutBtn.hidden = false;
  } else {
    if (menuName) menuName.textContent = "Usuario";
    if (menuEmail) menuEmail.textContent = "Iniciá sesión";
    if (menuAction) {
      menuAction.hidden = false;
      menuAction.textContent = "Iniciar sesión";
    }
    if (logoutBtn) logoutBtn.hidden = true;
  }

  if (button) {
    button.title = currentUser ? "Menú de cuenta" : "Iniciar sesión";
  }
}

function renderAuthView() {
  const guest = $("#authGuest");
  const logged = $("#authLoggedIn");
  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");
  const name = currentUser?.displayName || currentUser?.email || "Usuario";

  if (currentUser) {
    if (guest) guest.hidden = true;
    if (logged) logged.hidden = false;
    if ($("#authUserName")) $("#authUserName").textContent = name;
    if ($("#authUserEmail")) $("#authUserEmail").textContent = currentUser.email || "";
    if ($("#authUserInitial")) $("#authUserInitial").textContent = name.charAt(0).toUpperCase();
  } else {
    if (guest) guest.hidden = false;
    if (logged) logged.hidden = true;
    if (loginForm) loginForm.classList.add("is-active");
    if (registerForm) registerForm.classList.remove("is-active");
  }

  renderAccountButton();
}

function updateNavAuthLabel() {
  renderAccountButton();
}

function renderApp() {
  if (IS_AUTH_PAGE) {
    if (ensureAuthRedirect()) return;
    renderAuthView();
    return;
  }

  updateNavAuthLabel();
  if (!$(".view.is-active")) {
    irA("partidos");
  }

  if (!currentUser) {
    renderHero();
    renderChips();
    renderMatches();
    renderResumen();
    renderEntradas();
    renderAgenda();
    actualizarContador();
    return;
  }

  renderHero();
  renderChips();
  renderMatches();
  renderMatchSelect();
  renderCats();
  renderPaymentForm();
  renderResumen();
  renderEntradas();
  renderAgenda();
  actualizarContador();
}

function formatFirebaseAuthError(error) {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email": return "Email inválido.";
    case "auth/user-disabled": return "La cuenta está deshabilitada.";
    case "auth/user-not-found": return "No existe una cuenta con ese email.";
    case "auth/wrong-password": return "Contraseña incorrecta.";
    case "auth/email-already-in-use": return "El email ya está en uso.";
    case "auth/account-exists-with-different-credential": return "Ya existe una cuenta con ese email usando otro método de inicio de sesión.";
    case "auth/too-many-requests": return "Demasiados intentos fallidos. Intentá de nuevo más tarde.";
    case "auth/unauthorized-domain": return "Dominio no autorizado para esta app web. Agregá localhost o el dominio actual en Firebase Auth.";
    case "auth/app-not-authorized": return "La app web no está autorizada en este proyecto de Firebase.";
    case "auth/network-request-failed": return "Error de red. Verifica tu conexión.";
    case "auth/invalid-api-key": return "La clave API de Firebase es inválida.";
    default:
      if (code.startsWith("auth/")) {
        return code.replace("auth/", "").replace(/-/g, " ");
      }
      return error?.message || "Hubo un error al conectarse con Firebase Auth.";
  }
}

async function createAuthWarning(email, baseMessage) {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length === 0) return baseMessage;
    const readable = methods.map((m) => {
      if (m === "password") return "Contraseña";
      if (m === "emailLink") return "Enlace por email";
      if (m === "phone") return "Teléfono";
      return m;
    }).join(", ");
    return `${baseMessage} Métodos de acceso disponibles: ${readable}.`;
  } catch (error) {
    console.error("fetchSignInMethodsForEmail error:", error);
    return baseMessage;
  }
}

onAuthStateChanged(auth, async (user) => {
  console.debug("Firebase auth state changed:", user);
  authStateResolved = true;
  currentUser = user;
  if (currentUser) {
    userId = currentUser.uid;
  } else {
    userId = "guest";
    MIS_ENTRADAS = [];
  }

  if (ensureAuthRedirect()) return;

  renderApp();
  if (IS_MAIN_PAGE) {
    await cargarMisEntradasDesdeApi();
  }
});

function showAuthError(message) {
  const errorBox = $("#authError");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function clearAuthError() {
  showAuthError("");
}

const loginForm = $("#loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      currentUser = result.user;
      userId = currentUser.uid;
      toast("Sesión iniciada correctamente.");
      if (IS_AUTH_PAGE) {
        window.location.href = "index.html";
      } else {
        irA("partidos");
      }
    } catch (error) {
      console.error("Firebase login error:", error);
      const baseMessage = formatFirebaseAuthError(error);
      const message = await createAuthWarning(email, baseMessage);
      showAuthError(message);
      toast(message);
    }
  });
}

const registerForm = $("#registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthError();
    const name = $("#registerName").value.trim();
    const email = $("#registerEmail").value.trim();
    const password = $("#registerPassword").value;
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (result.user) {
        await updateProfile(result.user, { displayName: name });
        currentUser = result.user;
        userId = currentUser.uid;
      }
      toast(`Cuenta creada para ${name}.`);
      if (IS_AUTH_PAGE) {
        window.location.href = "index.html";
      } else {
        irA("partidos");
      }
    } catch (error) {
      console.error("Firebase registration error:", error);
      const baseMessage = formatFirebaseAuthError(error);
      const message = await createAuthWarning(email, baseMessage);
      showAuthError(message);
      toast(message);
    }
  });
}

const accountButton = $("#accountButton");
const accountMenu = $("#accountMenu");
const accountMenuAction = $("#accountMenuAction");
const logoutBtn = $("#logoutBtn");

if (accountButton) {
  accountButton.addEventListener("click", () => {
    if (!currentUser) {
      window.location.href = "auth.html";
      return;
    }
    if (accountMenu) accountMenu.hidden = !accountMenu.hidden;
  });
}

if (accountMenuAction) {
  accountMenuAction.addEventListener("click", () => {
    window.location.href = "auth.html";
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    if (accountMenu) accountMenu.hidden = true;
    logoutCurrentUser();
  });
}

document.addEventListener("click", (event) => {
  const clickedInsideAccount = accountButton?.contains(event.target) || accountMenu?.contains(event.target);
  if (!clickedInsideAccount && accountMenu) {
    accountMenu.hidden = true;
  }
});

const authTabs = $$(".auth-tab");
if (authTabs.length) {
  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      authTabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      const loginForm = $("#loginForm");
      const registerForm = $("#registerForm");
      if (loginForm) loginForm.classList.toggle("is-active", tab.dataset.authTab === "login");
      if (registerForm) registerForm.classList.toggle("is-active", tab.dataset.authTab === "register");
    });
  });
}

renderApp();
if (IS_MAIN_PAGE) {
  cargarDatosDesdeApi();
}