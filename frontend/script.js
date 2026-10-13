"use strict";

/* ============================================================
   NMT Gap AI — frontend
   Екрани: головна → діагностика → результат → план → тренування → повторна перевірка.
   Усі обчислення й перевірка відповідей — на бекенді; тут лише стан і відображення.
   ============================================================ */

// ---------- Налаштування ----------

const API_BASE = (() => {
  const fromUrl = new URLSearchParams(location.search).get("api");
  return (fromUrl || window.NMT_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
})();

const QUESTIONS_PER_TOPIC = 2;   // скільки завдань максимум на тему в діагностиці
const MAX_HINTS = 3;             // скільки сходинок у драбині підказок

// Пороги статусів (див. StatusBadge у дизайн-системі). Бекенд вважає тему слабкою при < 70%.
const STATUS = [
  { min: 75, key: "strong", icon: "✓", label: "Сильна" },
  { min: 50, key: "repeat", icon: "⚠", label: "Повторити" },
  { min: 0,  key: "gap",    icon: "!", label: "Пробіл" },
];

// Згенеровано з data/ (topics.py, extra_topics.py, skills.py, misconceptions.py).
// Використовується, лише якщо бекенд не відповідає на GET /meta.
const FALLBACK_TOPICS = {
  "fractions": "Дроби",
  "percentages": "Відсотки",
  "powers": "Степені",
  "linear_equations": "Лінійні рівняння",
  "quadratic_equations": "Квадратні рівняння",
  "negative_numbers": "Відʼємні числа",
  "divisibility": "Подільність чисел",
  "decimals": "Десяткові дроби",
  "proportions": "Відношення та пропорції",
  "absolute_value": "Модуль числа",
  "radicals": "Квадратні корені",
  "algebraic_expressions": "Буквені вирази",
  "polynomials": "Многочлени",
  "identities": "Формули скороченого множення",
  "factorization": "Розкладання на множники",
  "rational_expressions": "Раціональні вирази",
  "linear_inequalities": "Лінійні нерівності",
  "quadratic_inequalities": "Квадратні нерівності",
  "systems_equations": "Системи рівнянь",
  "arithmetic_progressions": "Арифметична прогресія",
  "geometric_progressions": "Геометрична прогресія",
  "function_values": "Значення функції",
  "linear_function": "Лінійна функція",
  "quadratic_function": "Квадратична функція",
  "exponential_equations": "Показникові рівняння",
  "logarithms": "Логарифми",
  "trigonometry": "Тригонометрія",
  "triangles": "Трикутники та кути",
  "pythagorean_theorem": "Теорема Піфагора",
  "quadrilaterals": "Чотирикутники",
  "circles": "Коло та круг",
  "coordinate_geometry": "Координати на площині",
  "solid_geometry": "Стереометрія",
  "probability": "Теорія ймовірностей",
  "statistics": "Статистика"
};

const SECTIONS = [
  {
    "id": "core",
    "name": "Швидка діагностика",
    "note": "5 ключових тем НМТ",
    "topics": [
      "fractions",
      "percentages",
      "powers",
      "linear_equations",
      "quadratic_equations"
    ]
  },
  {
    "id": "arithmetic",
    "name": "Арифметика",
    "note": null,
    "topics": [
      "fractions",
      "percentages",
      "negative_numbers",
      "divisibility",
      "decimals",
      "proportions",
      "absolute_value"
    ]
  },
  {
    "id": "algebra",
    "name": "Вирази й перетворення",
    "note": null,
    "topics": [
      "powers",
      "radicals",
      "algebraic_expressions",
      "polynomials",
      "identities",
      "factorization",
      "rational_expressions"
    ]
  },
  {
    "id": "equations",
    "name": "Рівняння й нерівності",
    "note": null,
    "topics": [
      "linear_equations",
      "quadratic_equations",
      "linear_inequalities",
      "quadratic_inequalities",
      "systems_equations",
      "exponential_equations",
      "logarithms"
    ]
  },
  {
    "id": "functions",
    "name": "Функції та прогресії",
    "note": null,
    "topics": [
      "function_values",
      "linear_function",
      "quadratic_function",
      "arithmetic_progressions",
      "geometric_progressions"
    ]
  },
  {
    "id": "geometry",
    "name": "Геометрія й тригонометрія",
    "note": null,
    "topics": [
      "triangles",
      "pythagorean_theorem",
      "quadrilaterals",
      "circles",
      "coordinate_geometry",
      "solid_geometry",
      "trigonometry"
    ]
  },
  {
    "id": "probability",
    "name": "Ймовірність і статистика",
    "note": null,
    "topics": [
      "probability",
      "statistics"
    ]
  }
];

const FALLBACK_SKILLS = {
  "fractions_basic": {
    "name": "Основні дії з дробами",
    "prerequisites": []
  },
  "percent_basic": {
    "name": "Основні дії з відсотками",
    "prerequisites": []
  },
  "powers_basic": {
    "name": "Основні властивості степенів",
    "prerequisites": []
  },
  "multiplication_same_base": {
    "name": "Множення степенів з однаковою основою",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "negative_numbers": {
    "name": "Дії з відʼємними числами",
    "prerequisites": []
  },
  "linear_equation_basic": {
    "name": "Лінійні рівняння",
    "prerequisites": [
      "negative_numbers"
    ]
  },
  "quadratic_equation_basic": {
    "name": "Квадратні рівняння",
    "prerequisites": [
      "powers_basic",
      "negative_numbers",
      "linear_equation_basic"
    ]
  },
  "divisibility_basic": {
    "name": "Дільники, НСД та НСК",
    "prerequisites": []
  },
  "decimals_basic": {
    "name": "Операції з десятковими дробами",
    "prerequisites": [
      "fractions_basic"
    ]
  },
  "proportions_basic": {
    "name": "Складання і розвʼязування пропорцій",
    "prerequisites": [
      "fractions_basic"
    ]
  },
  "absolute_value_basic": {
    "name": "Обчислення виразів із модулем",
    "prerequisites": [
      "negative_numbers"
    ]
  },
  "radicals_basic": {
    "name": "Обчислення квадратних коренів",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "algebraic_expressions_basic": {
    "name": "Підстановка значень у буквені вирази",
    "prerequisites": [
      "negative_numbers"
    ]
  },
  "polynomials_basic": {
    "name": "Дії з многочленами",
    "prerequisites": [
      "algebraic_expressions_basic"
    ]
  },
  "identities_basic": {
    "name": "Квадрат суми та різниця квадратів",
    "prerequisites": [
      "polynomials_basic"
    ]
  },
  "factorization_basic": {
    "name": "Винесення множника та різниця квадратів",
    "prerequisites": [
      "identities_basic"
    ]
  },
  "rational_expressions_basic": {
    "name": "Перетворення раціональних виразів",
    "prerequisites": [
      "fractions_basic",
      "factorization_basic"
    ]
  },
  "linear_inequalities_basic": {
    "name": "Розвʼязування лінійних нерівностей",
    "prerequisites": [
      "linear_equation_basic"
    ]
  },
  "quadratic_inequalities_basic": {
    "name": "Інтервали знаків квадратного тричлена",
    "prerequisites": [
      "quadratic_equation_basic"
    ]
  },
  "systems_equations_basic": {
    "name": "Розвʼязування систем двох рівнянь",
    "prerequisites": [
      "linear_equation_basic"
    ]
  },
  "arithmetic_progressions_basic": {
    "name": "Формула n-го члена арифметичної прогресії",
    "prerequisites": [
      "linear_equation_basic"
    ]
  },
  "geometric_progressions_basic": {
    "name": "Формула n-го члена геометричної прогресії",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "function_values_basic": {
    "name": "Обчислення значення функції за аргументом",
    "prerequisites": [
      "algebraic_expressions_basic"
    ]
  },
  "linear_function_basic": {
    "name": "Нулі та значення лінійної функції",
    "prerequisites": [
      "linear_equation_basic"
    ]
  },
  "quadratic_function_basic": {
    "name": "Вершина й екстремум параболи",
    "prerequisites": [
      "quadratic_equation_basic"
    ]
  },
  "exponential_equations_basic": {
    "name": "Зведення показникових рівнянь до спільної основи",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "logarithms_basic": {
    "name": "Означення логарифма та прості рівняння",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "trigonometry_basic": {
    "name": "Значення тригонометричних функцій особливих кутів",
    "prerequisites": []
  },
  "triangles_basic": {
    "name": "Сума кутів трикутника",
    "prerequisites": []
  },
  "pythagorean_theorem_basic": {
    "name": "Звʼязок катетів і гіпотенузи",
    "prerequisites": [
      "radicals_basic"
    ]
  },
  "quadrilaterals_basic": {
    "name": "Периметр та площа чотирикутників",
    "prerequisites": []
  },
  "circles_basic": {
    "name": "Радіус, діаметр і центральні кути",
    "prerequisites": [
      "triangles_basic"
    ]
  },
  "coordinate_geometry_basic": {
    "name": "Відстань та середина відрізка за координатами",
    "prerequisites": [
      "negative_numbers"
    ]
  },
  "solid_geometry_basic": {
    "name": "Обʼєм та площа поверхні просторових тіл",
    "prerequisites": [
      "powers_basic"
    ]
  },
  "probability_basic": {
    "name": "Класична ймовірність події",
    "prerequisites": [
      "fractions_basic"
    ]
  },
  "statistics_basic": {
    "name": "Середнє арифметичне, медіана й розмах",
    "prerequisites": [
      "negative_numbers"
    ]
  }
};

const FALLBACK_MISCONCEPTIONS = {
  "negative_numbers_mistake": {
    "topic": "negative_numbers",
    "description": "Учень плутає додавання та віднімання відʼємних чисел.",
    "recommendation": "Повторити правила дій з відʼємними числами."
  },
  "divisibility_mistake": {
    "topic": "divisibility",
    "description": "Учень плутає найменше спільне кратне з найбільшим спільним дільником.",
    "recommendation": "Порівняти поняття НСД та НСК."
  },
  "decimals_mistake": {
    "topic": "decimals",
    "description": "Учень неправильно визначає положення десяткової коми під час множення.",
    "recommendation": "Повторити множення десяткових дробів."
  },
  "proportions_mistake": {
    "topic": "proportions",
    "description": "Учень неправильно знаходить невідомий член пропорції.",
    "recommendation": "Повторити основну властивість пропорції."
  },
  "absolute_value_mistake": {
    "topic": "absolute_value",
    "description": "Учень не враховує, що модуль числа невідʼємний.",
    "recommendation": "Повторити означення модуля."
  },
  "radicals_mistake": {
    "topic": "radicals",
    "description": "Учень плутає квадрат числа з його квадратним коренем.",
    "recommendation": "Повторити означення арифметичного квадратного кореня."
  },
  "algebraic_expressions_mistake": {
    "topic": "algebraic_expressions",
    "description": "Учень знаходить суму коефіцієнтів, але забуває підставити значення змінної.",
    "recommendation": "Повторити підстановку значень у вираз."
  },
  "polynomials_mistake": {
    "topic": "polynomials",
    "description": "Учень обʼєднує коефіцієнти, але не враховує квадрат змінної.",
    "recommendation": "Повторити зведення подібних доданків."
  },
  "identities_mistake": {
    "topic": "identities",
    "description": "Учень неправильно застосовує формулу різниці квадратів.",
    "recommendation": "Повторити формули скороченого множення."
  },
  "factorization_mistake": {
    "topic": "factorization",
    "description": "Учень неправильно скорочує вираз після розкладання на множники.",
    "recommendation": "Повторити розкладання різниці квадратів."
  },
  "rational_expressions_mistake": {
    "topic": "rational_expressions",
    "description": "Учень множить дроби замість додавання.",
    "recommendation": "Повторити дії з раціональними дробами."
  },
  "linear_inequalities_mistake": {
    "topic": "linear_inequalities",
    "description": "Учень включає граничне число в строгу нерівність.",
    "recommendation": "Повторити різницю між строгими й нестрогими нерівностями."
  },
  "quadratic_inequalities_mistake": {
    "topic": "quadratic_inequalities",
    "description": "Учень неправильно враховує граничні точки нерівності.",
    "recommendation": "Повторити метод інтервалів."
  },
  "systems_equations_mistake": {
    "topic": "systems_equations",
    "description": "Учень знаходить суму змінних замість значення конкретної змінної.",
    "recommendation": "Повторити метод додавання рівнянь."
  },
  "arithmetic_progressions_mistake": {
    "topic": "arithmetic_progressions",
    "description": "Учень додає різницю n разів замість n−1.",
    "recommendation": "Повторити формулу n-го члена арифметичної прогресії."
  },
  "geometric_progressions_mistake": {
    "topic": "geometric_progressions",
    "description": "Учень сприймає геометричну прогресію як арифметичну.",
    "recommendation": "Повторити поняття знаменника геометричної прогресії."
  },
  "function_values_mistake": {
    "topic": "function_values",
    "description": "Учень неправильно підставляє значення аргументу.",
    "recommendation": "Повторити правило обчислення значень функції."
  },
  "linear_function_mistake": {
    "topic": "linear_function",
    "description": "Учень помиляється зі знаком під час пошуку нуля функції.",
    "recommendation": "Повторити побудову та властивості лінійної функції."
  },
  "quadratic_function_mistake": {
    "topic": "quadratic_function",
    "description": "Учень забуває поділити коефіцієнт b на 2a для абсциси вершини.",
    "recommendation": "Повторити формулу абсциси вершини параболи."
  },
  "exponential_equations_mistake": {
    "topic": "exponential_equations",
    "description": "Учень плутає показник степеня з результатом множення.",
    "recommendation": "Повторити властивості степенів та показникових рівнянь."
  },
  "logarithms_mistake": {
    "topic": "logarithms",
    "description": "Учень неправильно зіставляє основу, показник і значення степеня.",
    "recommendation": "Повторити означення логарифма."
  },
  "trigonometry_mistake": {
    "topic": "trigonometry",
    "description": "Учень плутає значення синуса кута 30° з одиницею.",
    "recommendation": "Повторити таблицю значень sin, cos і tg."
  },
  "triangles_mistake": {
    "topic": "triangles",
    "description": "Учень неправильно знаходить третій кут трикутника.",
    "recommendation": "Повторити теорему про суму кутів трикутника."
  },
  "pythagorean_theorem_mistake": {
    "topic": "pythagorean_theorem",
    "description": "Учень додає катети замість використання суми їхніх квадратів.",
    "recommendation": "Повторити теорему Піфагора."
  },
  "quadrilaterals_mistake": {
    "topic": "quadrilaterals",
    "description": "Учень плутає площу прямокутника з його периметром.",
    "recommendation": "Повторити формули периметра і площі."
  },
  "circles_mistake": {
    "topic": "circles",
    "description": "Учень плутає діаметр з радіусом.",
    "recommendation": "Повторити звʼязок радіуса та діаметра."
  },
  "coordinate_geometry_mistake": {
    "topic": "coordinate_geometry",
    "description": "Учень додає різниці координат без застосування теореми Піфагора.",
    "recommendation": "Повторити формулу відстані між точками."
  },
  "solid_geometry_mistake": {
    "topic": "solid_geometry",
    "description": "Учень плутає обʼєм куба з квадратом довжини ребра.",
    "recommendation": "Повторити формули обʼєму та площі поверхні куба."
  },
  "probability_mistake": {
    "topic": "probability",
    "description": "Учень записує кількість сприятливих випадків замість їх відношення до загальної кількості.",
    "recommendation": "Повторити класичне означення ймовірності."
  },
  "statistics_mistake": {
    "topic": "statistics",
    "description": "Учень плутає середнє арифметичне з найбільшим значенням.",
    "recommendation": "Повторити обчислення середнього арифметичного."
  }
};

// Тексти для 5 базових типових помилок — звернення на «ти» і правило, яке підсвічується маркером.
const BASE_MISCONCEPTIONS = {
  add_denominators: {
    topic: "fractions",
    text: "Схоже, ти додаєш знаменники під час додавання дробів.",
    rule: "зведення дробів до спільного знаменника",
  },
  percent_decimal_confusion: {
    topic: "percentages",
    text: "Схоже, ти плутаєш відсотки з десятковими дробами.",
    rule: "перетворення відсотків у десяткові дроби",
  },
  multiply_exponents: {
    topic: "powers",
    text: "Схоже, ти множиш показники степенів замість того, щоб їх додавати.",
    rule: "множення степенів з однаковою основою",
  },
  incorrect_sign_transfer: {
    topic: "linear_equations",
    text: "Схоже, ти неправильно змінюєш знак, коли переносиш доданок.",
    rule: "рівносильні перетворення рівнянь",
  },
  discriminant_error: {
    topic: "quadratic_equations",
    text: "Схоже, ти помиляєшся в обчисленні дискримінанта.",
    rule: "формула дискримінанта",
  },
};

// Робочі довідники. Спочатку — вбудовані дані, після старту їх оновлює GET /meta (якщо бекенд його має).
let TOPICS = { ...FALLBACK_TOPICS };
let SKILLS = { ...FALLBACK_SKILLS };
let MISCONCEPTIONS = { ...FALLBACK_MISCONCEPTIONS, ...BASE_MISCONCEPTIONS };

// Текст і порада для типової помилки (базові мають text/rule, нові з бекенду — description/recommendation).
function misText(m) {
  return m.text || m.description || "";
}
function misAdviceNodes(m) {
  if (m.rule) return ["Почни з правила: ", el("span", { class: "ng-mark" }, m.rule), "."];
  return ["Порада: ", el("span", { class: "ng-mark" }, (m.recommendation || "").replace(/\.$/, "")), "."];
}
function misAdviceText(m) {
  return m.rule ? `Повторити правило: ${m.rule}` : (m.recommendation || "Повторити основні правила теми").replace(/\.$/, "");
}

// ---------- Стан ----------

const state = {
  mode: "diagnosis",          // "diagnosis" | "recheck"
  section: "core",            // обраний розділ діагностики (SECTIONS)
  topics: [],                 // теми обраного розділу
  answers: [],                // [{question_id, answer}] — для /analyze
  checks: [],                 // [{question, answer, correct, skill, misconception}]
  asked: new Set(),           // id вже показаних завдань
  topicIndex: 0,
  topicCount: 0,              // скільки завдань показано в поточній темі
  current: null,              // поточне завдання
  number: 0,                  // номер питання для лічильника
  recheckQueue: [],
  result: null,               // відповідь /analyze після діагностики
  recheckResult: null,
  planFor: null,              // ключ, для якого вже згенеровано план
  train: { topic: null, pool: [], index: 0, attempts: 0, hints: 0, solved: false },
};

// ---------- Утиліти ----------

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function statusFor(percent) {
  return STATUS.find((s) => percent >= s.min);
}

function badge(status) {
  return el("span", { class: `ng-badge ng-badge--${status.key}` },
    el("span", { class: "ng-badge__icon", "aria-hidden": "true" }, status.icon), status.label);
}

function topicName(id) {
  return TOPICS[id] || id;
}

// Математичний запис: 2^3 → 2<sup>3</sup>, * → ×, мінус → −. Будуємо DOM без innerHTML.
function mathNodes(text) {
  const pretty = String(text)
    .replace(/\s*\*\s*/g, " × ")
    .replace(/sqrt\(/gi, "√(")
    .replace(/(^|[\s(=;])-(?=[\dx(])/g, "$1−")
    .replace(/\s-\s/g, " − ");
  const parts = pretty.split(/\^(\([^)]*\)|[−\-]?[\w.]+)/);
  const nodes = [];
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) nodes.push(el("sup", {}, part.replace(/^\((.*)\)$/, "$1")));
    else nodes.push(document.createTextNode(part));
  });
  return nodes;
}

// Ділимо «Обчисліть: 2^3 * 2^2» на підказку і вираз.
function splitQuestion(text) {
  const i = text.indexOf(":");
  if (i === -1) return { prompt: text, expr: null };
  return { prompt: text.slice(0, i + 1).trim(), expr: text.slice(i + 1).trim() };
}

function renderQuestion(q, promptEl, taskEl) {
  const { prompt, expr } = splitQuestion(q.question);
  promptEl.textContent = prompt;
  taskEl.replaceChildren(...(expr ? mathNodes(expr) : []));
  taskEl.hidden = !expr;
}

// Відповідь для бекенду: юнікод-мінус → дефіс, пробіли прибирає сам бекенд.
function cleanAnswer(value) {
  return value.trim().replace(/[−–—]/g, "-");
}

// Формули LaTeX з відповідей AI: \( … \), \[ … \], $$ … $$, $ … $. Їх не чіпаємо — малює MathJax.
const LATEX = /(\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/;

// Рядок тексту → вузли: формули LaTeX як є, решта — через mathNodes (2^3 → степінь, * → ×).
function richNodes(text) {
  const strip = (s) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
  return text.split(LATEX).flatMap((part, i) => {
    if (!part) return [];
    return i % 2 === 1 ? [document.createTextNode(part)] : mathNodes(strip(part));
  });
}

// Просимо MathJax відмалювати формули в контейнері (якщо скрипт ще вантажиться — він зробить це сам).
function typeset(container) {
  const mj = window.MathJax;
  if (!mj || !mj.startup || !mj.startup.promise) return;
  mj.startup.promise
    .then(() => mj.typesetPromise([container]))
    .catch(() => { /* без формул текст лишається читабельним */ });
}

// Простий рендер тексту від AI (markdown-подібного) у DOM — без innerHTML.
function renderAiText(container, text) {
  container.replaceChildren();
  let list = null;
  // Формули на кілька рядків збираємо в один рядок, щоб не розірвати їх.
  const source = String(text).replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, (m) => m.replace(/\s*\n\s*/g, " "));
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[-*_]{3,}$/.test(line)) { list = null; continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/) || line.match(/^\*\*([^*]+?)\*\*:?$/);
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (heading) {
      list = null;
      container.append(el("h3", {}, richNodes(heading[1])));
    } else if (item) {
      if (!list) { list = el("ul"); container.append(list); }
      list.append(el("li", {}, richNodes(item[1])));
    } else if (line.startsWith("|")) {
      continue; // таблиці з AI пропускаємо
    } else {
      list = null;
      container.append(el("p", {}, richNodes(line)));
    }
  }
  typeset(container);
}

// ---------- API ----------

async function api(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hideError();
    return await res.json();
  } catch (err) {
    showError(`Сервер не відповідає (${API_BASE}). Перевір, що бекенд запущено: uvicorn backend.app:app --reload`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// /next_question повертає {message} коли завдань немає.
async function nextQuestion(topic, current_difficulty, was_correct) {
  const q = await api("/next_question", { topic, current_difficulty, was_correct });
  return q && q.id != null ? q : null;
}

// Завдання конкретного рівня через адаптивний ендпоінт.
function questionAtLevel(topic, level) {
  if (level === 1) return nextQuestion(topic, 2, false);
  return nextQuestion(topic, level - 1, true);
}

function showError(text) {
  const box = $("error");
  box.textContent = text;
  box.hidden = false;
}
function hideError() {
  $("error").hidden = true;
}

// ---------- Навігація ----------

const SCREENS = ["home", "quiz", "result", "plan", "train", "delta"];

function show(name) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
  const screen = $(`screen-${name}`);
  window.scrollTo({ top: 0 });
  screen.focus({ preventScroll: true });
}

// ---------- Діагностика ----------

async function startDiagnosis() {
  Object.assign(state, {
    mode: "diagnosis", answers: [], checks: [], asked: new Set(),
    topicIndex: 0, topicCount: 0, current: null, number: 0,
    result: null, recheckResult: null, planFor: null,
  });
  const section = currentSection();
  state.topics = section.topics.filter((t) => TOPICS[t]);
  $("quiz-mode").textContent = `Діагностика · ${section.name}`;
  show("quiz");
  setQuizLoading(true);
  try {
    await loadTopicStart();
  } catch { /* помилку вже показано */ }
}

// Перше завдання теми — середній рівень; якщо його немає — простий.
async function loadTopicStart() {
  while (state.topicIndex < state.topics.length) {
    const topic = state.topics[state.topicIndex];
    state.topicCount = 0;
    const q = (await questionAtLevel(topic, 2)) || (await questionAtLevel(topic, 1));
    if (q && !state.asked.has(q.id)) return presentQuestion(q);
    state.topicIndex += 1;
  }
  return finishDiagnosis();
}

function presentQuestion(q) {
  state.current = q;
  state.asked.add(q.id);
  state.topicCount += 1;
  state.number += 1;

  const total = state.mode === "recheck" ? state.recheckQueue.length + state.number : null;
  const label = total ? `Питання ${state.number}/${total}` : `Питання ${state.number}`;
  $("quiz-counter").textContent = label;
  $("quiz-number").textContent = label;
  $("quiz-topic").textContent = topicName(q.topic);

  const progress = state.mode === "recheck"
    ? (state.number - 1) / total
    : (state.topicIndex + (state.topicCount - 1) / QUESTIONS_PER_TOPIC) / state.topics.length;
  $("quiz-progress").style.width = `${Math.round(progress * 100)}%`;

  renderQuestion(q, $("quiz-prompt"), $("quiz-task"));
  const input = $("quiz-input");
  input.value = "";
  $("quiz-submit").disabled = true;
  setQuizLoading(false);
  input.focus();
}

function setQuizLoading(loading) {
  $("quiz-form").setAttribute("aria-busy", loading ? "true" : "false");
  $("quiz-submit").textContent = loading ? "Зачекай…" : "Далі";
  if (loading) {
    $("quiz-submit").disabled = true;
    $("quiz-task").replaceChildren(el("span", { class: "loading" }, "Завантаження"));
    $("quiz-task").hidden = false;
  }
}

async function submitQuizAnswer(rawAnswer) {
  const q = state.current;
  if (!q) return;
  const answer = cleanAnswer(rawAnswer);
  setQuizLoading(true);
  try {
    const check = await api("/check_answer", { question_id: q.id, user_answer: answer });
    state.answers.push({ question_id: q.id, answer });
    state.checks.push({ question: q, answer, ...check });

    if (state.mode === "recheck") {
      const next = state.recheckQueue.shift();
      return next ? presentQuestion(next) : finishRecheck();
    }

    // Адаптивність: правильно → складніше, помилка → простіше (у межах теми).
    if (state.topicCount < QUESTIONS_PER_TOPIC) {
      const next = await nextQuestion(q.topic, q.difficulty, !!check.correct);
      if (next && !state.asked.has(next.id)) return presentQuestion(next);
    }
    state.topicIndex += 1;
    return loadTopicStart();
  } catch {
    setQuizLoading(false);
    renderQuestion(q, $("quiz-prompt"), $("quiz-task"));
    $("quiz-submit").disabled = !$("quiz-input").value.trim();
  }
}

async function finishDiagnosis() {
  $("quiz-progress").style.width = "100%";
  try {
    state.result = await api("/analyze", { user_answers: state.answers });
    renderResult();
    show("result");
  } catch { /* помилку вже показано */ }
}

// ---------- Результат ----------

function topicEntries(result) {
  return Object.entries(result.topics || {})
    .map(([id, r]) => ({ id, ...r, percent: r.percent ?? Math.round((r.correct / r.total) * 100) }));
}

function renderResult() {
  const r = state.result;
  const entries = topicEntries(r).sort((a, b) => b.percent - a.percent);

  // Карта знань
  const meters = $("result-meters");
  meters.replaceChildren(...entries.map((t) => {
    const s = statusFor(t.percent);
    return el("div", { class: `ng-meter ng-meter--${s.key}` },
      el("span", { class: "ng-meter__name" }, topicName(t.id)),
      el("span", { class: "ng-meter__value" }, badge(s), `${t.percent}%`),
      el("div", { class: "ng-meter__track", role: "img", "aria-label": `${topicName(t.id)}: ${t.percent}%` },
        el("div", { class: "ng-meter__fill", style: `width:${t.percent}%` })));
  }));
  if (!entries.length) meters.append(el("p", { class: "ng-muted" }, "Немає відповідей для аналізу."));

  // Типові помилки
  const box = $("result-mistakes");
  box.replaceChildren();
  const counts = {};
  for (const m of r.misconceptions || []) counts[m] = (counts[m] || 0) + 1;
  const ids = Object.keys(counts);
  if (ids.length) {
    box.append(el("h2", { class: "t-h2" }, "Що саме заважає"));
    for (const id of ids) {
      const info = MISCONCEPTIONS[id];
      if (!info) continue;
      const times = counts[id] > 1 ? `Ти ${counts[id]} рази припустився такої помилки. ` : "";
      box.append(el("div", { class: "ng-hint" },
        el("div", { class: "ng-hint__head" }, topicName(info.topic)),
        el("p", { class: "ng-hint__text" }, times + misText(info)),
        el("p", { class: "ng-hint__text" }, ...misAdviceNodes(info))));
    }
  } else if ((r.weak_topics || []).length) {
    box.append(el("p", { class: "t-lead" },
      `Варто повторити: ${r.weak_topics.map(topicName).join(", ")}. Типових помилок не виявлено — план допоможе розібратися.`));
  } else {
    box.append(el("p", { class: "t-lead" }, "Слабких тем не знайдено. Можеш потренуватися на складніших завданнях."));
  }

  renderSkillTree();
}

// Пошук кореневої причини: слабка тема → базові навички зі статусами.
function renderSkillTree() {
  const box = $("result-tree");
  box.replaceChildren();

  const bySkill = {};
  for (const c of state.checks) {
    if (!c.skill) continue;
    bySkill[c.skill] ??= { correct: 0, total: 0 };
    bySkill[c.skill].total += 1;
    if (c.correct) bySkill[c.skill].correct += 1;
  }
  const pct = (skill) => bySkill[skill] ? Math.round((bySkill[skill].correct / bySkill[skill].total) * 100) : null;

  // Навичка слабкої теми з перевіреними передумовами.
  const candidate = Object.keys(bySkill).find((skill) => {
    const p = pct(skill);
    const prereqs = (SKILLS[skill] || {}).prerequisites || [];
    return p !== null && p < 50 && prereqs.some((x) => pct(x) !== null);
  });
  if (!candidate) return;

  const prereqs = SKILLS[candidate].prerequisites;
  const rootCause = prereqs.find((x) => pct(x) !== null && pct(x) < 75);

  const items = prereqs.map((skill) => {
    const p = pct(skill);
    const isRoot = skill === rootCause;
    const tag = isRoot
      ? el("span", { class: "ng-badge ng-badge--marker" }, "Почни звідси")
      : p === null ? el("span", { class: "ng-badge ng-badge--neutral" }, "Не перевірено") : badge(statusFor(p));
    return el("li", { class: `ng-tree__item${isRoot ? " ng-tree__item--root-cause" : ""}` },
      el("span", {}, SKILLS[skill].name), tag);
  });

  const untested = prereqs.filter((x) => pct(x) === null).map((x) => SKILLS[x].name.toLowerCase());
  const verdict = rootCause
    ? `Проблема, ймовірно, починається не з теми «${SKILLS[candidate].name}». Спочатку варто повторити: ${SKILLS[rootCause].name.toLowerCase()}.`
    : untested.length
      ? `Перевірені базові навички в порядку. Щоб точніше знайти причину, варто також перевірити: ${untested.join(", ")}.`
      : `Базові навички в порядку — зосередься безпосередньо на темі «${SKILLS[candidate].name}».`;

  box.append(
    el("h2", { class: "t-h2" }, "Звідки береться помилка"),
    el("div", { class: "ng-card ng-tree" },
      el("div", { class: "ng-tree__root" }, el("span", {}, SKILLS[candidate].name), badge(statusFor(pct(candidate)))),
      el("ul", { class: "ng-tree__list" }, items),
      el("p", { class: "ng-tree__verdict" }, verdict)));
}

// ---------- План ----------

function weakTopicsSorted() {
  const r = state.result;
  if (!r) return [];
  const entries = topicEntries(r).sort((a, b) => a.percent - b.percent);
  const weak = entries.filter((t) => (r.weak_topics || []).includes(t.id) || t.percent < 75);
  return (weak.length ? weak : entries.slice(0, 1)).map((t) => t.id);
}

async function openPlan() {
  if (!state.result) return startDiagnosis();
  show("plan");
  const weak = weakTopicsSorted();
  const key = JSON.stringify([weak, state.result.misconceptions]);
  if (state.planFor === key) return;

  const body = $("plan-body");
  body.replaceChildren(el("div", { class: "loading" }, "AI складає план…"));
  const misconceptions = [...new Set(state.result.misconceptions || [])]
    .map((id) => (MISCONCEPTIONS[id] ? misText(MISCONCEPTIONS[id]) : id));
  try {
    const res = await api("/generate_plan", { weak_topics: weak.map(topicName), misconceptions });
    if (res.error || !res.personal_plan) throw new Error(res.error || "empty");
    renderAiText(body, res.personal_plan);
    state.planFor = key;
  } catch {
    renderFallbackPlan(body, weak);
  }
}

// Якщо AI недоступний — базовий план без AI, щоб демо не зупинялося.
function renderFallbackPlan(body, weak) {
  body.replaceChildren(el("p", { class: "ng-muted" }, "AI зараз недоступний, тому ось базовий план."));
  weak.forEach((topic, i) => {
    const mis = Object.values(MISCONCEPTIONS).find((m) => m.topic === topic && (state.result.misconceptions || []).some((id) => MISCONCEPTIONS[id] === m));
    body.append(el("div", { class: "ng-day" },
      el("div", { class: "ng-day__head" }, el("span", { class: "ng-day__num" }, `День ${i + 1}`), el("h3", { class: "ng-day__title" }, topicName(topic))),
      el("ul", { class: "ng-checklist" },
        [mis ? misAdviceText(mis) : "Повторити основні правила теми",
          "Розвʼязати 3 прості завдання",
          "Розвʼязати 2 завдання середнього рівня",
          "Пройти міні-перевірку"].map((t) =>
          el("li", { class: "ng-check" }, el("span", { class: "ng-check__box", "aria-hidden": "true" }), el("span", { class: "ng-check__text" }, t))))));
  });
}

// ---------- Тренування ----------

async function openTraining() {
  if (!state.result) return startDiagnosis();
  const topic = weakTopicsSorted()[0];
  show("train");
  $("train-topic").textContent = topicName(topic);
  $("chat").replaceChildren();
  $("train-hints").replaceChildren();

  if (state.train.topic !== topic || !state.train.pool.length) {
    $("train-task").replaceChildren(el("span", { class: "loading" }, "Завантаження"));
    const pool = [];
    try {
      for (const level of [1, 2, 3]) {
        const q = await questionAtLevel(topic, level);
        if (q && !pool.some((p) => p.id === q.id)) pool.push(q);
      }
    } catch { return; }
    state.train = { topic, pool, index: 0, attempts: 0, hints: 0, solved: false };
  }
  presentTraining();
}

function presentTraining() {
  const t = state.train;
  const q = t.pool[t.index % Math.max(t.pool.length, 1)];
  if (!q) {
    $("train-task").replaceChildren("Для цієї теми поки немає завдань.");
    return;
  }
  t.attempts = 0; t.hints = 0; t.solved = false;
  $("train-number").textContent = `Завдання ${t.index + 1}`;
  $("train-attempts").textContent = "Спроба 1";
  renderQuestion(q, $("train-prompt"), $("train-task"));
  setField("train", null);
  $("train-input").value = "";
  $("train-input").disabled = false;
  $("train-submit").textContent = "Перевірити";
  $("train-hints").replaceChildren();
  $("train-input").focus();
}

function currentTrainingQuestion() {
  const t = state.train;
  return t.pool[t.index % Math.max(t.pool.length, 1)];
}

function setField(prefix, status, text) {
  const field = $(`${prefix}-field`);
  const note = $(`${prefix}-note`);
  field.classList.toggle("ng-field--correct", status === "correct");
  field.classList.toggle("ng-field--wrong", status === "wrong");
  note.hidden = !status;
  note.textContent = text || "";
}

async function submitTraining() {
  const t = state.train;
  const q = currentTrainingQuestion();
  if (!q) return;

  if (t.solved) { // кнопка «Наступне завдання»
    t.index += 1;
    return presentTraining();
  }

  const answer = cleanAnswer($("train-input").value);
  if (!answer) return $("train-input").focus();

  const submit = $("train-submit");
  submit.disabled = true;
  try {
    const check = await api("/check_answer", { question_id: q.id, user_answer: answer });
    t.attempts += 1;
    if (check.correct) {
      t.solved = true;
      setField("train", "correct", "✓ Правильно! Ти знайшов відповідь сам.");
      $("train-input").disabled = true;
      submit.textContent = "Наступне завдання";
      return;
    }
    $("train-attempts").textContent = `Спроба ${t.attempts + 1}`;
    setField("train", "wrong", "! Не зовсім. Подивись на підказку й спробуй ще раз.");
    if (t.hints < MAX_HINTS) await addHint(q, answer, check.misconception);
    else setField("train", "wrong", "! Не зовсім. Повтори правило з плану й переходь до наступного завдання.");
  } catch { /* помилку вже показано */ } finally {
    submit.disabled = false;
  }
}

async function addHint(q, answer, misconceptionId) {
  const t = state.train;
  t.hints += 1;
  const n = t.hints;
  const text = el("p", { class: "ng-hint__text" }, el("span", { class: "loading" }, "Репетитор думає…"));
  const steps = el("span", { class: "ng-hint__steps", "aria-hidden": "true" },
    Array.from({ length: MAX_HINTS }, (_, i) => el("span", { class: `ng-hint__step${i < n ? " ng-hint__step--on" : ""}` })));
  const card = el("div", { class: "ng-hint" }, el("div", { class: "ng-hint__head" }, `Підказка ${n} з ${MAX_HINTS}`, steps), text);
  $("train-hints").append(card);

  const mis = MISCONCEPTIONS[misconceptionId || ""];
  try {
    const res = await api("/ask_ai", { question: q.question, student_answer: hintContext(answer, n), mode: "hint" });
    if (res.error || !res.ai_hint) throw new Error(res.error || "empty");
    renderAiText(text, res.ai_hint);
  } catch (err) {
    hideError();
    aiUnavailableNote(err);
    text.replaceChildren(...(mis
      ? [...misAdviceNodes(mis), " Як це застосувати в цьому прикладі?"]
      : ["Спробуй розписати розвʼязання по кроках. Який перший крок тут потрібен?"]));
  }
}

// Сходинка драбини: кожна наступна підказка трохи конкретніша, але без відповіді.
function hintContext(answer, step) {
  const level = ["Дай лише загальне нагадування правила.",
    "Дай конкретнішу підказку про перший крок.",
    "Підкажи, як записати вираз по-іншому, але не обчислюй відповідь."][step - 1] || "";
  return `${answer}. (Підказка ${step} з ${MAX_HINTS}. ${level})`;
}

// Якщо AI не відповів — показуємо запасний текст, але чесно позначаємо це й пишемо причину в консоль (F12).
function aiUnavailableNote(err) {
  const reason = err && err.message ? err.message : "невідома причина";
  console.warn("[NMT Gap AI] /ask_ai не відповів:", reason);
  return el("span", { class: "t-caption", style: "display:block;margin-top:4px" },
    "AI зараз недоступний — це базова підказка. Причина в консолі браузера (F12).");
}

async function sendChat(message) {
  const q = currentTrainingQuestion();
  const chat = $("chat");
  chat.append(el("div", { class: "ng-msg ng-msg--student" }, el("span", { class: "ng-msg__who" }, "Ти"), message));
  const reply = el("div", { class: "ng-msg ng-msg--ai" }, el("span", { class: "ng-msg__who" }, "AI-репетитор"), el("div", { class: "ai-text" }, el("span", { class: "loading" }, "Думаю…")));
  chat.append(reply);
  const body = reply.querySelector(".ai-text");
  try {
    const res = await api("/ask_ai", { question: q ? q.question : "", student_answer: message, mode: "chat" });
    if (res.error || !res.ai_hint) throw new Error(res.error || "empty");
    renderAiText(body, res.ai_hint);
  } catch (err) {
    hideError();
    body.replaceChildren("Я не дам готову відповідь, але допоможу тобі знайти її самостійно. З якого кроку ти почав би розвʼязання?", aiUnavailableNote(err));
  }
}

// ---------- Повторна перевірка ----------

async function startRecheck() {
  if (!state.result) return startDiagnosis();
  const topics = weakTopicsSorted();
  state.mode = "recheck";
  state.number = 0;
  state.answers = [];
  state.checks = [];
  $("quiz-mode").textContent = "Повторна перевірка";
  show("quiz");
  setQuizLoading(true);
  try {
    const queue = [];
    for (const topic of topics) {
      for (const level of [1, 2]) {
        const q = await questionAtLevel(topic, level);
        if (q && !queue.some((x) => x.id === q.id)) queue.push(q);
      }
    }
    state.recheckQueue = queue;
    const first = state.recheckQueue.shift();
    if (first) presentQuestion(first);
    else show("result");
  } catch { /* помилку вже показано */ }
}

async function finishRecheck() {
  try {
    state.recheckResult = await api("/analyze", { user_answers: state.answers });
  } catch { return; }
  const before = Object.fromEntries(topicEntries(state.result).map((t) => [t.id, t.percent]));
  const after = topicEntries(state.recheckResult);

  $("delta-list").replaceChildren(...after.map((t) => {
    const b = before[t.id] ?? 0;
    return el("div", { class: "ng-card ng-delta" },
      el("span", { class: "ng-delta__topic" }, topicName(t.id)),
      el("span", { class: "ng-delta__label" }, "Було"),
      el("span", { class: `ng-delta__num`, style: `color:var(--${statusFor(b).key})` }, `${b}%`),
      el("span", { class: "ng-delta__label" }, "Стало"),
      el("span", { class: `ng-delta__num`, style: `color:var(--${statusFor(t.percent).key})` }, `${t.percent}%`));
  }));

  const improved = after.filter((t) => t.percent > (before[t.id] ?? 0)).length;
  $("delta-verdict").textContent = improved
    ? "Є прогрес! Тема закріплюється — переходь до наступного дня плану."
    : "Поки без змін. Повернись до правила з плану й потренуйся ще трохи.";
  show("delta");
}

// ---------- Розділи й довідники ----------

function currentSection() {
  return SECTIONS.find((x) => x.id === state.section) || SECTIONS[0];
}

function renderSections() {
  const box = $("section-picker");
  if (!box) return;
  box.replaceChildren(...SECTIONS.map((sec) => {
    const count = sec.topics.filter((t) => TOPICS[t]).length;
    return el("button", {
      class: "ng-chip", type: "button", "data-section": sec.id,
      "aria-pressed": sec.id === state.section ? "true" : "false",
    }, sec.name, el("span", { class: "ng-chip__count" }, String(count)));
  }));
  const sec = currentSection();
  const names = sec.topics.filter((t) => TOPICS[t]).map(topicName);
  $("section-topics").textContent = `${sec.note ? sec.note + ": " : ""}${names.join(", ")}. До ${names.length * QUESTIONS_PER_TOPIC} питань.`;
}

function selectSection(id) {
  state.section = id;
  try { localStorage.setItem("nmt-section", id); } catch { /* немає сховища — не страшно */ }
  renderSections();
}

// GET /meta: { topics: [{id, name, section?}] | {id: name}, skills: {...}, misconceptions: {...} }.
// Якщо бекенд його не має — лишаються вбудовані дані.
async function loadMeta() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(API_BASE + "/meta", { signal: controller.signal });
    if (!res.ok) return;
    const meta = await res.json();
    const list = Array.isArray(meta.topics)
      ? meta.topics
      : Object.entries(meta.topics || {}).map(([id, name]) => ({ id, name }));
    for (const t of list) if (t && t.id) TOPICS[t.id] = t.name || TOPICS[t.id] || t.id;
    if (meta.skills) SKILLS = { ...SKILLS, ...meta.skills };
    if (meta.misconceptions) MISCONCEPTIONS = { ...MISCONCEPTIONS, ...meta.misconceptions, ...BASE_MISCONCEPTIONS };
    // Теми, яких немає в жодному розділі, — в окремий розділ «Інші теми».
    const known = new Set(SECTIONS.flatMap((x) => x.topics));
    const extra = Object.keys(TOPICS).filter((t) => !known.has(t));
    if (extra.length) SECTIONS.push({ id: "other", name: "Інші теми", note: null, topics: extra });
    renderSections();
  } catch { /* бекенд без /meta або недоступний — працюємо з вбудованими даними */ } finally {
    clearTimeout(timer);
  }
}

// ---------- Тема ----------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('[data-action="toggle-theme"]').textContent = theme === "dark" ? "Світла тема" : "Темна тема";
  try { localStorage.setItem("nmt-theme", theme); } catch { /* немає сховища — не страшно */ }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("nmt-theme"); } catch { /* ігноруємо */ }
  const prefersDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
}

// ---------- Події ----------

document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-section]");
  if (chip) { selectSection(chip.dataset.section); return; }
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action !== "toggle-theme") e.preventDefault();
  switch (action) {
    case "home": show("home"); break;
    case "start": startDiagnosis(); break;
    case "dont-know": submitQuizAnswer(""); break;
    case "result": show("result"); break;
    case "plan": openPlan(); break;
    case "train": openTraining(); break;
    case "skip-train": state.train.index += 1; presentTraining(); break;
    case "recheck": startRecheck(); break;
    case "toggle-theme":
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      break;
  }
});

$("quiz-input").addEventListener("input", (e) => {
  $("quiz-submit").disabled = !e.target.value.trim();
});

$("quiz-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("quiz-input").value;
  if (value.trim()) submitQuizAnswer(value);
});

$("train-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitTraining();
});

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chat-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  sendChat(message);
});

initTheme();
try { const saved = localStorage.getItem("nmt-section"); if (saved && SECTIONS.some((x) => x.id === saved)) state.section = saved; } catch { /* ігноруємо */ }
renderSections();
loadMeta();
