// ────────────────────────────────────────────────────────────
// Catálogo de preguntas del módulo de Mentorías.
// Es la única fuente de verdad: la app y el dashboard lo leen desde
// GET /api/mentorias/preguntas, así que para cambiar un texto o una
// sugerencia basta con editar este archivo y redesplegar el backend.
// ────────────────────────────────────────────────────────────

const PUNTAJE_MAX_PREGUNTA = 10;

// Bajo este puntaje la pregunta exige plan de acción y genera un compromiso.
const UMBRAL_PLAN_ACCION = 7;

const PREGUNTAS_MENTORIA = [
  {
    numero: 1,
    ambito: 'Limpieza y orden del local',
    pregunta: '¿El local se encuentra limpio y ordenado, con las tareas de limpieza diaria y profunda al día?',
    resumen: 'Local limpio y ordenado, limpieza diaria y profunda al día',
    preguntaAccion: '¿Qué acciones coordinará para corregir los pendientes y asegurar que la limpieza se mantenga?',
    sugerencias: [
      'Coordinar apoyo para realizar una limpieza profunda y definir una fecha de ejecución.',
      'Elaborar junto al administrador un calendario de limpieza con responsables y revisión diaria de evidencias.',
    ],
  },
  {
    numero: 2,
    ambito: 'Calidad de los productos',
    pregunta: '¿Los productos cumplen con los estándares de sabor, gramaje, presentación y preparación establecidos?',
    resumen: 'Sabor, gramaje, presentación y preparación según estándar',
    preguntaAccion: '¿Cómo apoyará al administrador y al equipo de cocina para corregir las fallas detectadas?',
    sugerencias: [
      'Coordinar la visita de un maestro para reforzar las preparaciones deficientes en una fecha acordada.',
      'Revisar preparaciones junto al equipo, corregir los procedimientos y verificar muestras después del refuerzo.',
    ],
  },
  {
    numero: 3,
    ambito: 'Rutas de flyers',
    pregunta: '¿El administrador organiza y ejecuta rutas diarias de flyers con cobertura suficiente, responsables definidos y evidencias de ejecución?',
    resumen: 'Rutas diarias con cobertura, responsables y evidencias',
    preguntaAccion: '¿Qué hará para activar las rutas y verificar su cumplimiento?',
    sugerencias: [
      'Acompañar al administrador en una ruta para enseñar cómo organizarla, abordar a potenciales clientes y registrar resultados.',
      'Coordinar apoyo de un repartidor o integrante del equipo, definiendo sectores, horarios y metas de distribución.',
    ],
  },
  {
    numero: 4,
    ambito: 'Estrategias de ventas',
    pregunta: '¿El administrador aplica estrategias concretas para aumentar las ventas y revisa sus resultados?',
    resumen: 'Estrategias concretas para vender y revisión de resultados',
    preguntaAccion: '¿Qué estrategias implementará junto al administrador y cómo evaluará su efectividad?',
    sugerencias: [
      'Compartir estrategias que hayan funcionado en otros locales y acordar cuáles implementar, con fechas y evidencias.',
      'Preparar junto al administrador un plan semanal de ventas y revisar los resultados para ajustar las acciones.',
    ],
  },
  {
    numero: 5,
    ambito: 'Indicadores y metas',
    pregunta: '¿El administrador conoce sus ventas, ticket promedio, reclamos, anulaciones y tiempos de atención, y tiene metas diarias o semanales con acciones para alcanzarlas?',
    resumen: 'Conoce ventas, ticket, reclamos, anulaciones y tiempos; tiene metas',
    preguntaAccion: '¿Cómo lo ayudará a comprender sus indicadores y convertirlos en un plan de acción?',
    sugerencias: [
      'Coordinar una reunión con el analista encargado para revisar resultados, definir metas y aclarar dudas.',
      'Establecer una reunión semanal con el equipo para revisar avances, desviaciones y acciones correctivas.',
    ],
  },
  {
    numero: 6,
    ambito: 'Control antes de la entrega y BPM',
    pregunta: '¿El administrador verifica que se cumplan los controles de calidad antes de entregar los pedidos y las buenas prácticas de manufactura (BPM) durante la operación, incluyendo temperatura, conservación y vigencia de los productos?',
    resumen: 'Control previo a la entrega y BPM: temperatura, conservación y vigencia',
    preguntaAccion: '¿Qué controles implementará junto al administrador para corregir las fallas y asegurar su cumplimiento?',
    sugerencias: [
      'Elaborar y aplicar junto al alumno una pauta de control de pedidos y BPM, con responsables por turno.',
      'Coordinar una capacitación práctica y realizar una revisión posterior para verificar la aplicación de lo aprendido.',
    ],
  },
  {
    numero: 7,
    ambito: 'Liderazgo y coordinación',
    pregunta: '¿El administrador entrega instrucciones claras, delega con responsables definidos, enseña al corregir y mantiene al equipo alineado con las prioridades del local?',
    resumen: 'Instrucciones claras, delegación y equipo alineado',
    preguntaAccion: '¿Cómo lo acompañará para mejorar su liderazgo y la coordinación del equipo?',
    sugerencias: [
      'Coordinar una capacitación de liderazgo con ejercicios de delegación, comunicación y corrección de errores.',
      'Observar una jornada de trabajo y practicar situaciones de conflicto para entregar retroalimentación y acordar mejoras.',
    ],
  },
  {
    numero: 8,
    ambito: 'Atención y servicio al cliente',
    pregunta: '¿El equipo de ventas cumple los protocolos de atención y atiende con amabilidad, claridad y disposición para resolver las necesidades del cliente?',
    resumen: 'Protocolos de atención con amabilidad y claridad',
    preguntaAccion: '¿Qué acciones realizará para corregir las fallas de atención y verificar la mejora?',
    sugerencias: [
      'Revisar junto al administrador una muestra de chats y atenciones, identificando errores y reforzando las respuestas adecuadas.',
      'Coordinar una capacitación con día y hora definidos, seguida de una evaluación mediante cliente incógnito.',
    ],
  },
  {
    numero: 9,
    ambito: 'Planificación de la producción',
    pregunta: '¿El administrador planifica la producción según la venta esperada y el consumo, evitando faltantes, sobreproducción y mermas?',
    resumen: 'Producción según venta esperada, sin faltantes ni mermas',
    preguntaAccion: '¿Cómo lo ayudará a organizar una producción acorde con la demanda del local?',
    sugerencias: [
      'Elaborar junto al alumno un plan de producción por día y turno, utilizando ventas históricas, consumo y stock disponible.',
      'Revisar junto al equipo los faltantes, sobrantes y mermas para ajustar cantidades y mejorar la eficiencia.',
    ],
  },
  {
    numero: 10,
    ambito: 'Motivación y desarrollo del equipo',
    pregunta: '¿El administrador reconoce el desempeño, identifica las habilidades de su equipo y realiza acciones para motivarlo y desarrollarlo?',
    resumen: 'Reconoce desempeño y desarrolla habilidades del equipo',
    preguntaAccion: '¿Qué acciones implementará para fortalecer la motivación y potenciar las habilidades del equipo?',
    sugerencias: [
      'Realizar una reunión con el equipo para reconocer logros, escuchar dificultades y acordar compromisos.',
      'Elaborar junto al administrador un plan de desarrollo con capacitaciones, metas individuales y seguimiento semanal.',
    ],
  },
];

const PUNTAJE_MAX_TOTAL = PREGUNTAS_MENTORIA.length * PUNTAJE_MAX_PREGUNTA; // 100

// Mismos tramos que Revisiones y Auditoría.
function obtenerCategoria(pct) {
  if (pct >= 100) return 'EXCELENTE';
  if (pct >= 95) return 'MUY BUENO';
  if (pct >= 80) return 'BUENO';
  if (pct >= 70) return 'REGULAR';
  if (pct >= 60) return 'MALO';
  return 'PÉSIMO';
}

function preguntaPorNumero(numero) {
  return PREGUNTAS_MENTORIA.find((p) => p.numero === Number(numero));
}

module.exports = {
  PREGUNTAS_MENTORIA,
  PUNTAJE_MAX_PREGUNTA,
  PUNTAJE_MAX_TOTAL,
  UMBRAL_PLAN_ACCION,
  obtenerCategoria,
  preguntaPorNumero,
};
