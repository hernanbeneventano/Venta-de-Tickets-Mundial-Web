// ============================================================
//  DATOS DEL TORNEO
//  Editá este archivo para cambiar partidos, sedes y precios.
// ============================================================

// Categorías de tribuna (precio en USD por entrada)
const CATEGORIAS = [
  { id: "cat1", nombre: "Categoría 1", detalle: "Lateral premium · platea baja", precio: 450 },
  { id: "cat2", nombre: "Categoría 2", detalle: "Tribuna media · vista central", precio: 280 },
  { id: "cat3", nombre: "Categoría 3", detalle: "Cabecera · detrás del arco", precio: 180 },
  { id: "cat4", nombre: "Categoría 4", detalle: "General · acceso al estadio", precio: 95 },
];

// Lista de partidos
const PARTIDOS = [
  {
    id: "m01",
    local: "Argentina", localFlag: "🇦🇷",
    visita: "México", visitaFlag: "🇲🇽",
    grupo: "A",
    fecha: "2026-06-11", hora: "20:00",
    estadio: "Estadio Azteca", ciudad: "Ciudad de México",
    destacado: true,
  },
  {
    id: "m02",
    local: "Estados Unidos", localFlag: "🇺🇸",
    visita: "Gales", visitaFlag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    grupo: "B",
    fecha: "2026-06-12", hora: "18:00",
    estadio: "SoFi Stadium", ciudad: "Los Ángeles",
    destacado: false,
  },
  {
    id: "m03",
    local: "Brasil", localFlag: "🇧🇷",
    visita: "Croacia", visitaFlag: "🇭🇷",
    grupo: "C",
    fecha: "2026-06-13", hora: "16:00",
    estadio: "MetLife Stadium", ciudad: "Nueva York",
    destacado: false,
  },
  {
    id: "m04",
    local: "Francia", localFlag: "🇫🇷",
    visita: "Canadá", visitaFlag: "🇨🇦",
    grupo: "D",
    fecha: "2026-06-13", hora: "21:00",
    estadio: "BC Place", ciudad: "Vancouver",
    destacado: false,
  },
  {
    id: "m05",
    local: "España", localFlag: "🇪🇸",
    visita: "Japón", visitaFlag: "🇯🇵",
    grupo: "E",
    fecha: "2026-06-14", hora: "15:00",
    estadio: "AT&T Stadium", ciudad: "Dallas",
    destacado: false,
  },
  {
    id: "m06",
    local: "Inglaterra", localFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    visita: "Senegal", visitaFlag: "🇸🇳",
    grupo: "F",
    fecha: "2026-06-15", hora: "19:00",
    estadio: "Mercedes-Benz Stadium", ciudad: "Atlanta",
    destacado: false,
  },
  {
    id: "m07",
    local: "Alemania", localFlag: "🇩🇪",
    visita: "Marruecos", visitaFlag: "🇲🇦",
    grupo: "G",
    fecha: "2026-06-16", hora: "17:00",
    estadio: "Hard Rock Stadium", ciudad: "Miami",
    destacado: false,
  },
  {
    id: "m08",
    local: "Portugal", localFlag: "🇵🇹",
    visita: "Uruguay", visitaFlag: "🇺🇾",
    grupo: "H",
    fecha: "2026-06-17", hora: "20:00",
    estadio: "Arrowhead Stadium", ciudad: "Kansas City",
    destacado: false,
  },
];