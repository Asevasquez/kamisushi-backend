// backend/utils/productoChecklist.js
//
// Auditoría de Producto: el checklist (10 secciones, 75 preguntas), el cálculo del
// puntaje y el plan de acción según el porcentaje. Es la ÚNICA fuente de verdad: el
// servidor valida y calcula con esto, y la app y el dashboard muestran lo que el
// servidor devuelve (la copia del checklist para la app se genera desde este archivo).
//
// Reglas de puntaje
//  - Cada sección vale 10 puntos, tenga las preguntas que tenga.
//  - Puntos de la sección = 10 × Sí ÷ (Sí + No). "N/A" no suma ni resta.
//  - Si una sección completa es N/A no cuenta (ni en el numerador ni en el denominador).
//  - % total = suma de puntos ÷ (10 × secciones que aplican) × 100.
//  - % de una sección = puntos × 10.

// [n, texto, lleva observación]
const DATOS = [
  ['arroz', 'Arroz y mise', [
    [1, 'Arrocera en buen estado y limpia'],
    [2, 'Arroz con sabor, textura y color correcto'],
    [3, 'Poncheras de arroz alusadas y rotuladas'],
    [4, 'Mise alusada por piso y rotulada'],
    [5, 'Realizan correcto sellado de puntas'],
    [6, 'Armado de camas aceptable para un buen cierre del roll'],
    [7, 'Mise en su tiempo de vida útil, rotación', true],
  ]],
  ['salsas', 'Salsas, aliños y plaquetas', [
    [8, 'Cuentan con todo el stock de salsas'],
    [9, 'Salsas rotuladas'],
    [10, 'Sabor, color y textura según receta'],
    [11, 'Cuentan con plaquetas de palta, en su correcto peso y tamaño', true],
    [12, 'Cuentan con plaquetas de queso, en su correcto peso y tamaño', true],
    [13, 'Cuentan con plaquetas de salmón, en su correcto peso y tamaño', true],
    [14, 'Plaquetas rotuladas'],
  ]],
  ['ceviche', 'Ceviche y salmón', [
    [15, 'Cuentan con stock de ceviche rotulado'],
    [16, 'El ceviche está en condiciones de color, aroma y sabor'],
    [17, 'Se registra la presentación según receta con todos los ingredientes y cortes adecuados', true],
    [18, 'Porcionan el salmón de manera correcta, almacenado y rotulado como corresponde'],
  ]],
  ['cuartoCaliente', 'Cuarto caliente', [
    [19, 'Mantienen montados pasos de apanado 3 rollos 3 pollo'],
    [20, 'Los ingredientes están colados y en condiciones'],
    [21, 'La textura del huevo es la adecuada'],
    [22, 'Los recipientes están limpios y sin presencia de residuos u hongos'],
    [23, 'Cortes del pollo correctos'],
    [24, 'Apanan y esterillan pollo y tiras de manera correcta'],
  ]],
  ['materiasPrimas', 'Materias primas y limpieza durante el turno', [
    [25, 'Almacenamiento de materias primas según temperatura'],
    [26, 'Tienen recipientes suficientes para los productos'],
    [27, 'No mantienen productos dentro de latas'],
    [28, 'Mantienen limpieza de tabla y cuchillo'],
    [29, 'Realizan constante lavado de manos o cambio de guantes'],
    [30, 'Descongelan pollo y reineta de manera correcta', true],
    [31, 'No refrigeran rollos o pollo apanado', true],
    [32, 'Sanitizan y almacenan vegetales según procedimiento'],
    [33, 'Ciboulette en buenas condiciones y corte adecuado'],
    [34, 'Cebollín en buenas condiciones y corte adecuado'],
    [35, 'Se detectan insumos que no son de Kamver', true],
  ]],
  ['productosTerminados', 'Productos terminados', [
    [36, 'Realizan envolturas según estándar (californias)'],
    [37, 'Cortes de rollos parejos y sin romper el producto', true],
    [38, 'Gramajes y presentación adecuados'],
    [39, 'Producto en presentación igual a la de redes sociales'],
    [40, 'Almacenamiento adecuado de productos terminados'],
  ]],
  ['empaque', 'Empaque', [
    [41, 'Maestros marcan 243 con número de pedido'],
    [42, 'Mantienen stock de todos los envases de productos'],
    [43, 'Mantienen stock de alusa en el local'],
    [44, 'Vendedoras usan check list'],
  ]],
  ['equipos', 'Equipos e infraestructura', [
    [45, 'Mesones y superficies en buen estado'],
    [46, 'Equipos de frío con termómetro adicional'],
    [47, 'Refrigeradores organizados y limpios', true],
    [48, 'Congeladora organizada y limpia', true],
    [49, 'Freidora en temperatura 160° a 180°'],
    [50, 'Canastos de las freidoras limpios y sin residuos'],
    [51, 'Manejan a lo menos 2 grameras funcionales en el local'],
    [52, 'Sushi case rotulada y limpia'],
  ]],
  ['implementos', 'Implementos y gráficas', [
    [53, 'Esterillas bien alusadas y en buen estado (sin presencia de hongos)'],
    [54, 'Mantienen esterillas separadas por área'],
    [55, 'Cuentan con tablas de colores'],
    [56, 'Tablas en buen estado'],
    [57, 'Cuentan con tablas para mise'],
    [58, 'Cuchillos en buen estado y separados por área'],
    [59, 'Cuentan con colador de acero para el aceite'],
    [60, 'Cuentan con jarro medidor graduado en buen estado para el vinagre'],
    [61, 'Cuentan con paleta de acero inoxidable para el arroz'],
    [62, 'Cuentan con todas las gráficas de apoyo visual en gramajes', true],
    [63, 'Cuentan con todas las gráficas de protocolos y prohibiciones en cocina', true],
    [64, 'Cuentan con el recetario actualizado de salsas'],
    [65, 'Paños de repaso limpios y en buenas condiciones'],
  ]],
  ['bpm', 'Libro de BPM, registros condiciones de higiene', [
    [66, 'Registro de cambio de aceite'],
    [67, 'Registro de control de plagas'],
    [68, 'BPM al día', true],
    [69, 'Personal con EPP', true],
    [70, 'Personal sin joyas'],
    [71, 'Personal con uñas cortas y limpias en caso que no usen guantes'],
    [72, 'Personal con uniformes o ropa negra y limpia'],
    [73, 'Cuentan con jabonera y jabón disponible'],
    [74, 'Cuentan con dispensador de Nova y Nova disponible'],
    [75, 'Cuentan con lavalozas'],
  ]],
];

const SECCIONES = DATOS.map(([id, nombre, preguntas]) => ({
  id,
  nombre,
  preguntas: preguntas.map(([n, texto, obs]) => ({ n, texto, obs: !!obs })),
}));

const PREGUNTAS = SECCIONES.flatMap((s) => s.preguntas.map((p) => ({ ...p, seccionId: s.id })));
const PREGUNTA_POR_N = new Map(PREGUNTAS.map((p) => [p.n, p]));
const TOTAL_PREGUNTAS = PREGUNTAS.length; // 75
const VALORES = ['si', 'no', 'na'];
const MAX_OBSERVACION = 500;
const MAX_OBSERVACION_EQUIPO = 2000;

// ─── Categorías y plan de acción (tabla definida por el negocio) ─────────────
const CATEGORIAS = ['EXCELENTE', 'MUY BUENO', 'BUENO', 'REGULAR', 'MALO', 'PÉSIMO'];

function categoriaDe(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) return null;
  if (pct >= 100) return 'EXCELENTE';
  if (pct >= 95) return 'MUY BUENO';
  if (pct >= 80) return 'BUENO';
  if (pct >= 70) return 'REGULAR';
  if (pct >= 60) return 'MALO';
  return 'PÉSIMO';
}

const ACCION_RECLAMOS = 'Según listado de reclamos de producto enviar video o imagen de producto o proceso corregido';

const PLAN_ACCION = {
  'EXCELENTE': {
    rango: '100%',
    acciones: [
      'Mantener los controles diarios del turno y compartir una buena práctica que pueda replicarse en otros locales.',
      ACCION_RECLAMOS,
    ],
  },
  'MUY BUENO': {
    rango: '95% a menos de 100%',
    acciones: [
      'Corregir los puntos observados y revisar a diario que el equipo aplique la corrección.',
      ACCION_RECLAMOS,
    ],
  },
  'BUENO': {
    rango: '80% a menos de 95%',
    acciones: [
      'Corregir las deficiencias y hacer seguimiento diario en terreno. Priorizar los procesos con mayor impacto en el producto, como gramaje, preparación o presentación.',
      ACCION_RECLAMOS,
      'Registrar compromisos por cada deficiencia detectada en supervisión',
    ],
  },
  'REGULAR': {
    rango: '70% a menos de 80%',
    acciones: [
      'Hacer una capacitación práctica sobre los puntos deficientes. El líder demuestra el proceso, el equipo lo repite y el administrador valida el resultado. Se adjuntan evidencias',
      'Realizar prueba a equipo de cocina práctica',
      'Registrar compromisos por cada deficiencia y solicitar una revisión de supervisión.',
    ],
  },
  'MALO': {
    rango: '60% a menos de 70%',
    acciones: [
      'Hacer una capacitación prioritaria teórica y práctica con el equipo de cocina de cuarto frío o cuarto caliente según informe',
      'Hacer una capacitación prioritaria teórica con el equipo de cocina de cuarto frío o cuarto caliente según informe',
      'Hacer prueba práctica y escrita a los equipos',
      'Registrar compromisos por cada deficiencia y solicitar una revisión de supervisión.',
    ],
  },
  'PÉSIMO': {
    rango: 'Menos de 60%',
    acciones: [
      'Ingresar al local al ranking de capacitación urgente',
      'Convocar una reunión de Gerencia con el administrador y el subadministrador para acordar compromisos, responsables y fechas.',
      'Registrar compromisos por cada deficiencia',
      'Supervisión general de operaciones',
    ],
  },
};
const TITULO_PLAN = 'Acción inmediata en cocina';

// Copia lista para guardar junto a la auditoría (así el historial no cambia si el plan se edita después)
function planDe(categoria) {
  const p = PLAN_ACCION[categoria];
  return p ? { categoria, rango: p.rango, acciones: [...p.acciones] } : null;
}

// ─── Cálculo ────────────────────────────────────────────────────────────────
const redondear1 = (x) => Math.round(x * 10) / 10;
const redondear2 = (x) => Math.round(x * 100) / 100;

// respuestas: { [n]: 'si' | 'no' | 'na' } — debe traer las 75 (ver validarRespuestas)
function calcularResultado(respuestas) {
  let suma = 0;
  let aplican = 0;
  const secciones = SECCIONES.map((s) => {
    let si = 0, no = 0, na = 0;
    for (const p of s.preguntas) {
      const v = respuestas[p.n];
      if (v === 'si') si++; else if (v === 'no') no++; else na++;
    }
    const base = si + no;
    const exacto = base > 0 ? (10 * si) / base : null;
    if (exacto !== null) { suma += exacto; aplican++; }
    const porcentaje = exacto === null ? null : redondear1(exacto * 10);
    return {
      id: s.id, nombre: s.nombre, preguntas: s.preguntas.length, si, no, na,
      puntos: exacto === null ? null : redondear2(exacto),
      porcentaje,
      categoria: categoriaDe(porcentaje),
    };
  });
  if (aplican === 0) return null;
  const porcentajeTotal = redondear1((suma / (10 * aplican)) * 100);
  return {
    secciones,
    seccionesQueAplican: aplican,
    puntosTotal: redondear2(suma),
    porcentajeTotal,
    categoria: categoriaDe(porcentajeTotal),
  };
}

// Valida la lista que manda la app: [{ n, valor, observacion }] con las 75 preguntas, cada una una vez.
// Devuelve { ok:true, mapa, respuestas:[normalizadas] } o { ok:false, error }.
function validarRespuestas(lista) {
  if (!Array.isArray(lista)) return { ok: false, error: 'Las respuestas deben enviarse como una lista' };
  const mapa = {};
  const respuestas = [];
  for (const r of lista) {
    const n = Number(r && r.n);
    const p = PREGUNTA_POR_N.get(n);
    if (!p) return { ok: false, error: `Pregunta ${r && r.n} no existe en el checklist` };
    if (mapa[n] !== undefined) return { ok: false, error: `La pregunta ${n} está repetida` };
    if (!VALORES.includes(r.valor)) return { ok: false, error: `Pregunta ${n}: responde Sí, No o N/A` };
    mapa[n] = r.valor;
    const out = { n, valor: r.valor };
    if (p.obs) {
      const obs = String(r.observacion || '').trim().replace(/[ \t]+/g, ' ').slice(0, MAX_OBSERVACION);
      if (obs) out.observacion = obs; // solo las preguntas marcadas guardan observación
    }
    respuestas.push(out);
  }
  const faltan = PREGUNTAS.filter((p) => mapa[p.n] === undefined).map((p) => p.n);
  if (faltan.length > 0) {
    return { ok: false, error: `Faltan ${faltan.length} pregunta${faltan.length === 1 ? '' : 's'} por responder (${faltan.slice(0, 5).join(', ')}${faltan.length > 5 ? '…' : ''})` };
  }
  respuestas.sort((a, b) => a.n - b.n);
  return { ok: true, mapa, respuestas };
}

module.exports = {
  SECCIONES, PREGUNTAS, PREGUNTA_POR_N, TOTAL_PREGUNTAS, VALORES, MAX_OBSERVACION, MAX_OBSERVACION_EQUIPO,
  CATEGORIAS, categoriaDe, PLAN_ACCION, TITULO_PLAN, planDe,
  calcularResultado, validarRespuestas, redondear1, redondear2,
};
