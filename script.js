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

// Дзеркало data/topics.py, data/misconceptions.py, data/skills.py (бекенд поки не віддає їх через API).
// Якщо змінюєте дані на бекенді — оновіть і тут.
const TOPICS = {
  fractions: "Дроби",
  percentages: "Відсотки",
  powers: "Степені",
  linear_equations: "Лінійні рівняння",
  quadratic_equations: "Квадратні рівняння",
};
const TOPIC_ORDER = Object.keys(TOPICS);

const MISCONCEPTIONS = {
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

const SKILLS = {
  fractions_basic: { name: "Основні дії з дробами", prerequisites: [] },
  percent_basic: { name: "Основні дії з відсотками", prerequisites: [] },
  powers_basic: { name: "Основні властивості степенів", prerequisites: [] },
  multiplication_same_base: { name: "Множення степенів з однаковою основою", prerequisites: ["powers_basic"] },
  negative_numbers: { name: "Дії з відʼємними числами", prerequisites: [] },
  linear_equation_basic: { name: "Лінійні рівняння", prerequisites: ["negative_numbers"] },
  quadratic_equation_basic: { name: "Квадратні рівняння", prerequisites: ["powers_basic", "negative_numbers", "linear_equation_basic"] },
};

// ---------- Стан ----------

const state = {
  mode: "diagnosis",          // "diagnosis" | "recheck"
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
  $("quiz-mode").textContent = "Діагностика";
  show("quiz");
  setQuizLoading(true);
  try {
    await loadTopicStart();
  } catch { /* помилку вже показано */ }
}

// Перше завдання теми — середній рівень; якщо його немає — простий.
async function loadTopicStart() {
  while (state.topicIndex < TOPIC_ORDER.length) {
    const topic = TOPIC_ORDER[state.topicIndex];
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
    : (state.topicIndex + (state.topicCount - 1) / QUESTIONS_PER_TOPIC) / TOPIC_ORDER.length;
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
        el("p", { class: "ng-hint__text" }, times + info.text),
        el("p", { class: "ng-hint__text" }, "Почни з правила: ", el("span", { class: "ng-mark" }, info.rule), ".")));
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
    .map((id) => (MISCONCEPTIONS[id] ? MISCONCEPTIONS[id].text : id));
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
        [mis ? `Повторити правило: ${mis.rule}` : "Повторити основні правила теми",
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
    const res = await api("/ask_ai", { question: q.question, student_answer: hintContext(answer, n) });
    if (res.error || !res.ai_hint) throw new Error(res.error || "empty");
    renderAiText(text, res.ai_hint);
  } catch {
    hideError();
    text.replaceChildren(...(mis
      ? ["Згадай правило: ", el("span", { class: "ng-mark" }, mis.rule), ". Як воно працює в цьому прикладі?"]
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

async function sendChat(message) {
  const q = currentTrainingQuestion();
  const chat = $("chat");
  chat.append(el("div", { class: "ng-msg ng-msg--student" }, el("span", { class: "ng-msg__who" }, "Ти"), message));
  const reply = el("div", { class: "ng-msg ng-msg--ai" }, el("span", { class: "ng-msg__who" }, "AI-репетитор"), el("div", { class: "ai-text" }, el("span", { class: "loading" }, "Думаю…")));
  chat.append(reply);
  const body = reply.querySelector(".ai-text");
  try {
    const res = await api("/ask_ai", { question: q ? q.question : "", student_answer: message });
    if (res.error || !res.ai_hint) throw new Error(res.error || "empty");
    renderAiText(body, res.ai_hint);
  } catch {
    hideError();
    body.replaceChildren("Я не дам готову відповідь, але допоможу тобі знайти її самостійно. З якого кроку ти почав би розвʼязання?");
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
