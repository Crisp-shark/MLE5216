import { validateBank, isCorrect, buildSession } from './core.js';

const main = document.querySelector('#main');
const IMPORT_KEY = 'mle5216.import.v1';
const CHOICE_KEY = 'mle5216.bank-choice.v1';
const PREFIX = 'mle5216.progress.v1.';
const labels = { home: '开始练习', tutorial: 'Tutorial重点', wrong: '错题本', favorites: '我的收藏', history: '练习记录' };
let bank, builtinBank, demoBank, bankKey, questionById;
let progress, session = null, result = null, view = 'home', bankKind = 'builtin';
let storageWarning = false, toastTimeout, activating = false;
const settings = { chapter: 'all', count: 10, mode: 'practice', minutes: 20, shuffleOptions: false };
const lectureNames = { SEM: 'SEM · 扫描电子显微镜', TEM: 'TEM · 透射电子显微镜', 'Electron Spectroscopy': 'Electron Spectroscopy · 电子能谱', STEM: 'STEM · 像差校正扫描透射电镜', '综合比较': '综合比较 · 设备选择与应用' };
const lectureOf = question => question.chapter.split(' · ')[0];
function lectureGroups() {
  const groups = new Map();
  for (const question of bank.questions) {
    const name = lectureOf(question);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(question);
  }
  return groups;
}
function tutorialQuestions() {
  const order = ['SEM', 'TEM', 'Electron Spectroscopy'];
  const rank = question => {
    const label = question.tutorial;
    const lecture = order.findIndex(name => label.startsWith(`${name} Tutorial`));
    const number = Number(label.match(/Q(\d+)$/)?.[1] || 0);
    return (lecture < 0 ? 3 : lecture) * 100 + number;
  };
  return bank.questions.filter(question => question.tutorial).sort((a, b) => rank(a) - rank(b));
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'on') for (const [event, listener] of Object.entries(value)) node.addEventListener(event, listener);
    else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') node[key] = !!value;
    else if (value != null) node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
function button(text, className, action, attrs = {}) {
  return el('button', { type: 'button', class: className, on: { click: action }, ...attrs }, text);
}
function toast(message) {
  const node = document.querySelector('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { node.hidden = true; }, 4500);
}
function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch {
    if (!storageWarning) toast('浏览器暂时无法保存数据，本次仍可练习。请保留页面。');
    storageWarning = true;
    return false;
  }
}
function removeStorage(key) { try { localStorage.removeItem(key); } catch { /* Storage may be blocked. */ } }
function parse(text, fallback) { try { return JSON.parse(text) ?? fallback; } catch { return fallback; } }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
const owns = (value, key) => object(value) && Object.hasOwn(value, key);
function validDate(value) { return Number.isFinite(value) && value > 0 && value <= Date.now() + 60000; }
function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function dateText(value) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
}
const percentage = (correct, total) => total ? Math.round(correct / total * 100) : 0;
const duration = (start, end) => {
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};
function save() { writeStorage(bankKey, JSON.stringify(progress)); }
function saveSession() { progress.current = session && !session.finished ? session : null; save(); }
function cleanIds(ids) {
  return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && questionById.has(id)))] : [];
}
function restoreSession(raw) {
  if (!object(raw) || !['practice', 'exam'].includes(raw.mode) || typeof raw.id !== 'string' || raw.id.length > 100) return null;
  const ids = cleanIds(raw.questionIds);
  if (!ids.length || !Array.isArray(raw.questionIds) || ids.length !== raw.questionIds.length || !validDate(raw.start)) return null;
  if (raw.mode === 'exam' && (!Number.isFinite(raw.deadline) || raw.deadline < raw.start || raw.deadline > raw.start + 180 * 60000)) return null;
  const restored = {
    id: raw.id, mode: raw.mode, questionIds: ids, orders: Object.create(null), answers: Object.create(null),
    graded: Object.create(null), index: Number.isInteger(raw.index) ? Math.max(0, Math.min(ids.length - 1, raw.index)) : 0,
    start: raw.start, deadline: raw.mode === 'exam' ? raw.deadline : null, finished: false,
  };
  for (const id of ids) {
    const question = questionById.get(id);
    const available = question.options.map(option => option.id);
    const order = owns(raw.orders, id) ? raw.orders[id] : null;
    restored.orders[id] = Array.isArray(order) && order.length === available.length && new Set(order).size === available.length && order.every(item => available.includes(item)) ? [...order] : available;
    const answer = owns(raw.answers, id) ? raw.answers[id] : [];
    restored.answers[id] = Array.isArray(answer) ? [...new Set(answer.filter(item => available.includes(item)))].slice(0, question.type === 'single' ? 1 : available.length) : [];
    if (raw.mode === 'practice' && owns(raw.graded, id) && typeof raw.graded[id] === 'boolean') {
      restored.graded[id] = isCorrect(question, restored.answers[id]);
    }
  }
  return restored;
}
function loadProgress() {
  const raw = parse(readStorage(bankKey), {});
  const activities = object(raw) && Array.isArray(raw.activities) ? raw.activities.filter(item => object(item) && typeof item.id === 'string' && validDate(item.at) && typeof item.correct === 'boolean' && questionById.has(item.qid)).slice(-10000) : [];
  const history = object(raw) && Array.isArray(raw.history) ? raw.history.filter(item => object(item) && typeof item.id === 'string' && ['practice', 'exam'].includes(item.mode) && validDate(item.start) && validDate(item.end) && Number.isInteger(item.total) && item.total > 0 && item.total <= 5000 && Number.isInteger(item.correct) && item.correct >= 0 && item.correct <= item.total).slice(0, 100) : [];
  progress = { wrong: cleanIds(raw?.wrong), favorites: cleanIds(raw?.favorites), activities, history, current: null };
  session = restoreSession(raw?.current);
  progress.current = session;
}
async function fingerprint(value) {
  const text = JSON.stringify(value);
  if (globalThis.crypto?.subtle) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buffer)].map(number => number.toString(16).padStart(2, '0')).join('');
  }
  // Local fallback for browsers without secure-context crypto.
  let first = 2166136261, second = 5381;
  for (let i = 0; i < text.length; i += 1) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}-${first >>> 0}-${second >>> 0}`;
}
async function activateBank(nextBank, kind) {
  activating = true;
  if (progress && bankKey) saveSession();
  const nextKey = PREFIX + await fingerprint(nextBank);
  bank = nextBank;
  bankKind = kind;
  bankKey = nextKey;
  questionById = new Map(bank.questions.map(question => [question.id, question]));
  loadProgress();
  result = null;
  settings.chapter = 'all';
  settings.count = 10;
  writeStorage(CHOICE_KEY, kind);
  activating = false;
  navigate('home');
  if (session?.mode === 'exam' && Date.now() >= session.deadline) completeSession(true);
}
function updateNavigation() {
  document.querySelectorAll('[data-view]').forEach(node => {
    const active = node.dataset.view === view;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  document.querySelector('#wrong-count').textContent = progress.wrong.length;
  document.querySelector('#favorite-count').textContent = progress.favorites.length;
  const tutorialCount = document.querySelector('#tutorial-count');
  if (tutorialCount) tutorialCount.textContent = bank.questions.filter(question => question.tutorial).length;
  document.querySelector('#page-label').textContent = view === 'quiz' ? (session?.mode === 'exam' ? '限时模拟' : '正在练习') : view === 'result' ? '本次结果' : labels[view];
}
function navigate(nextView) {
  view = nextView;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function render() {
  updateNavigation();
  main.replaceChildren();
  if (view === 'quiz' && session) renderQuiz();
  else if (view === 'result' && result) renderResult();
  else if (view === 'tutorial') renderTutorials();
  else if (view === 'wrong' || view === 'favorites') renderCollection();
  else if (view === 'history') renderHistory();
  else { view = 'home'; renderHome(); }
}
function heading(title, subtitle, eyebrow = 'YOUR STUDY SPACE') {
  return el('div', { class: 'page-heading' }, el('div', {}, el('p', { class: 'eyebrow' }, eyebrow), el('h1', {}, title), el('p', {}, subtitle)), el('span', { class: 'date-chip' }, new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())));
}
function bankNotice() {
  const isDemo = bankKind === 'demo';
  return el('div', { class: 'notice' }, el('div', {}, el('strong', {}, isDemo ? '操作示例题库' : bankKind === 'import' ? '正在使用本地导入题库' : '课件题库已就绪'), isDemo ? '这些题目仅演示操作，不属于 MLE5216 课程内容。' : `${bank.title} · ${bank.questions.length} 道题。请结合解析与课件来源复习。`), bankKind !== 'builtin' ? button('恢复课程题库', 'text-button', restoreBuiltin) : null);
}
function stat(label, value, unit, sub, symbol) {
  return el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, label), el('span', { class: 'stat-symbol', 'aria-hidden': true }, symbol), el('div', { class: 'stat-value' }, value, el('small', {}, unit)), el('div', { class: 'stat-sub' }, sub));
}
function resumeCard() {
  if (!session) return null;
  const completed = session.mode === 'practice' ? Object.keys(session.graded).length : session.questionIds.filter(id => session.answers[id]?.length).length;
  return el('div', { class: 'resume' }, el('div', {}, el('strong', {}, '上次的练习，还在这里'), el('p', {}, `${session.mode === 'exam' ? '限时模拟' : '日常练习'} · 已${session.mode === 'exam' ? '作答' : '提交'} ${completed} / ${session.questionIds.length} 题`)), button('继续练习 →', 'secondary', () => { result = null; navigate('quiz'); }));
}
function renderHome() {
  const today = progress.activities.filter(activity => dayKey(activity.at) === dayKey(Date.now()));
  const total = progress.activities.length;
  const correct = progress.activities.filter(activity => activity.correct).length;
  main.append(heading('yyw，今天也进步一点。', '从一道题开始，把知识慢慢变成自己的。'), bankNotice(), el('div', { class: 'stats-grid' },
    stat(bankKind === 'demo' ? '示例题目' : '题库题目', bank.questions.length, '道', `${new Set(bank.questions.map(question => question.chapter)).size} 个章节，逐步掌握`, '▤'),
    stat('今日已练', today.length, '题', today.length ? '每一道认真思考，都算数' : '第一道题，等你开始', '◷'),
    stat('累计正确率', total ? percentage(correct, total) : '—', total ? '%' : '', total ? `已累计提交 ${total} 次作答` : '开始练习后，记录会出现在这里', '↗')));
  const left = el('div', {}, el('section', { class: 'feature-card' }, el('p', { class: 'eyebrow' }, 'ONE QUESTION AT A TIME'), el('h2', {}, '把知识，练成底气。'), el('p', {}, '按自己的节奏练习。每次提交后，看看解析，也看看背后的知识点。'), button(['开始练习', el('span', { class: 'button-arrow', 'aria-hidden': true }, '→')], 'primary', () => startSession('practice')), featureArt()), resumeCard());
  const tutorials = tutorialQuestions();
  if (tutorials.length) left.append(el('section', { class: 'tutorial-banner' }, el('div', {}, el('strong', {}, '先想透老师的 Tutorial'), el('p', {}, `${tutorials.length} 道重点转化题 · 核心原理 → 因果逻辑 → 应用范围`)), button('进入重点练习 →', 'secondary', () => navigate('tutorial'))));
  left.append(el('div', { class: 'section-title' }, el('h2', {}, '按课件，逐个掌握'), el('span', {}, '英文题目 · 中文解析')));
  const chapterList = el('div', { class: 'chapter-list' });
  const chapters = [...new Set(bank.questions.map(question => question.chapter))];
  let groupIndex = 0;
  for (const [group, questions] of lectureGroups()) {
    groupIndex += 1;
    const ids = new Set(questions.map(question => question.id));
    const attempted = new Set(progress.activities.filter(activity => ids.has(activity.qid)).map(activity => activity.qid)).size;
    const groupChapters = [...new Set(questions.map(question => question.chapter))];
    const section = el('section', { class: 'lecture-section' }, el('div', { class: 'chapter-row' }, el('span', { class: 'chapter-index' }, String(groupIndex).padStart(2, '0')), el('div', { class: 'chapter-info' }, el('strong', {}, lectureNames[group] || group), el('p', {}, `${questions.length} 道题 · 已练 ${attempted} 道${groupChapters.length > 1 ? ` · ${groupChapters.length} 个专题` : ''}`)), button('→', '', () => { settings.chapter = `@lecture:${group}`; startSession('practice'); }, { 'aria-label': `练习${lectureNames[group] || group}` })));
    if (groupChapters.length > 1) {
      const details = el('details', { class: 'topic-details' }, el('summary', {}, '展开专题练习'));
      for (const chapter of groupChapters) details.append(el('div', { class: 'chapter-row topic-row' }, el('div', { class: 'chapter-info' }, el('strong', {}, chapter.split(' · ').slice(1).join(' · ')), el('p', {}, `${questions.filter(question => question.chapter === chapter).length} 道题`)), button('→', '', () => { settings.chapter = chapter; startSession('practice'); }, { 'aria-label': `练习${chapter}` })));
      section.append(details);
    }
    chapterList.append(section);
  }
  if (!chapters.length) chapterList.append(el('div', { class: 'chapter-row' }, '课程题库等待加入。你也可以导入 JSON 题库。'));
  left.append(chapterList, el('div', { class: 'bank-actions' }, button('体验操作示例', 'text-button', async () => { await activateBank(await getDemo(), 'demo'); }), button('下载当前题库', 'text-button', downloadBank)));
  const right = el('div', {}, configPanel(), el('div', { class: 'mini-panel' }, el('h3', {}, '一点复习小建议'), el('p', {}, '答错时，先理解为什么。回到课件对应页，把容易混淆的概念放在一起比较。'), el('p', {}, '多选题按答案完全一致计分，少选、多选均不得分。')));
  main.append(el('div', { class: 'home-grid' }, left, right));
}
function featureArt() {
  return el('div', { class: 'feature-art', 'aria-hidden': true }, el('div', { class: 'art-paper' }, el('div', { class: 'art-line' }), el('div', { class: 'art-line short' }), el('div', { class: 'art-line' }), el('div', { class: 'art-check' }, el('b', {}, '✓'), 'one more step')), el('div', { class: 'art-spark' }, '✳'));
}
function field(label, node) { return el('label', { class: 'field' }, label, node); }
function configPanel() {
  const chapterSelect = el('select', { name: 'chapter', id: 'chapter', on: { change: event => { settings.chapter = event.target.value; } } }, el('option', { value: 'all' }, '全部课件与综合比较'));
  for (const [group, questions] of lectureGroups()) {
    const value = `@lecture:${group}`;
    const options = el('optgroup', { label: lectureNames[group] || group }, el('option', { value, selected: settings.chapter === value }, `整份练习 · ${lectureNames[group] || group}`));
    const chapters = [...new Set(questions.map(question => question.chapter))];
    if (chapters.length > 1) for (const chapter of chapters) options.append(el('option', { value: chapter, selected: settings.chapter === chapter }, chapter.split(' · ').slice(1).join(' · ')));
    chapterSelect.append(options);
  }
  const modeSelect = el('select', { name: 'mode', id: 'practice-type', on: { change: event => { settings.mode = event.target.value; minutes.disabled = settings.mode !== 'exam'; start.textContent = settings.mode === 'exam' ? '开始模拟测验 →' : '开始本次练习 →'; } } }, el('option', { value: 'practice', selected: settings.mode === 'practice' }, '日常练习 · 即时解析'), el('option', { value: 'exam', selected: settings.mode === 'exam' }, '限时模拟 · 交卷后解析'));
  const count = el('select', { name: 'count', id: 'question-count', on: { change: event => { settings.count = event.target.value === 'all' ? Infinity : Number(event.target.value); } } }, [10, 20, 30, 50].map(value => el('option', { value, selected: settings.count === value }, `${value} 道`)), el('option', { value: 'all', selected: settings.count === Infinity }, '全部题目'));
  const minutes = el('input', { type: 'number', name: 'minutes', id: 'exam-minutes', min: 1, max: 180, value: settings.minutes, required: '', disabled: settings.mode !== 'exam', on: { input: event => { settings.minutes = Number(event.target.value); } } });
  const start = el('button', { type: 'submit', class: 'primary full-width', disabled: !bank.questions.length }, settings.mode === 'exam' ? '开始模拟测验 →' : '开始本次练习 →');
  return el('section', { class: 'panel config-panel', 'aria-label': '练习设置' }, el('form', { on: { submit: event => { event.preventDefault(); if (event.target.reportValidity()) startSession(settings.mode); } } }, el('h2', { class: 'config-title' }, '安排一小段练习', el('span', { class: 'tiny-badge' }, 'JUST FOR YOU')), field('练习方式', modeSelect), field('选择章节', chapterSelect), el('div', { class: 'field-row' }, field('题目数量', count), field('模拟时长 / 分钟', minutes)), el('label', { class: 'check-field' }, el('input', { type: 'checkbox', checked: settings.shuffleOptions, on: { change: event => { settings.shuffleOptions = event.target.checked; } } }), '随机排列选项'), start, el('p', { class: 'config-hint' }, '随机抽题 · 题量不足时使用全部可用题目')));
}
function startSession(mode = 'practice', ids = null, ordered = false) {
  if (session && !confirm('有一份未完成的练习。开始新练习会替换它，已提交的答题记录仍会保留。继续吗？')) return;
  if (settings.count !== Infinity && (!Number.isInteger(settings.count) || settings.count < 1)) { toast('请选择有效的题目数量。'); return; }
  if (mode === 'exam' && (!Number.isInteger(settings.minutes) || settings.minutes < 1 || settings.minutes > 180)) { toast('模拟时长应为 1–180 分钟的整数。'); return; }
  const group = settings.chapter.startsWith('@lecture:') ? settings.chapter.slice(9) : null;
  let available = !ids && group ? bank.questions.filter(question => lectureOf(question) === group) : bank.questions;
  if (ordered && ids) {
    const positions = new Map(ids.map((id, index) => [id, index]));
    available = available.filter(question => positions.has(question.id)).sort((a, b) => positions.get(a.id) - positions.get(b.id));
  }
  const selected = buildSession(available, { chapter: ids || group ? 'all' : settings.chapter, count: ids ? ids.length : settings.count, shuffleOptions: settings.shuffleOptions, shuffleQuestions: !ordered, ids });
  if (!selected.length) { toast('当前范围还没有题目。'); return; }
  const start = Date.now();
  session = { id: globalThis.crypto?.randomUUID?.() ?? `${start}-${Math.random().toString(36).slice(2)}`, mode, questionIds: selected.map(question => question.id), orders: Object.create(null), answers: Object.create(null), graded: Object.create(null), index: 0, start, deadline: mode === 'exam' ? start + settings.minutes * 60000 : null, finished: false };
  selected.forEach(question => { session.orders[question.id] = question.options.map(option => option.id); session.answers[question.id] = []; });
  result = null;
  saveSession();
  navigate('quiz');
  main.focus({ preventScroll: true });
}
function toggleFavorite(id) {
  const existing = progress.favorites.indexOf(id);
  if (existing >= 0) progress.favorites.splice(existing, 1); else progress.favorites.push(id);
  save();
  updateNavigation();
  return existing < 0;
}
function favoriteButton(id) {
  const saved = progress.favorites.includes(id);
  const node = button(saved ? '★' : '☆', `bookmark${saved ? ' saved' : ''}`, () => {
    const next = toggleFavorite(id);
    node.textContent = next ? '★' : '☆';
    node.classList.toggle('saved', next);
    node.setAttribute('aria-pressed', String(next));
    node.setAttribute('aria-label', next ? '取消收藏' : '收藏这道题');
  }, { 'aria-pressed': saved, 'aria-label': saved ? '取消收藏' : '收藏这道题' });
  return node;
}
function recordGrade(id) {
  if (owns(session.graded, id)) return;
  const question = questionById.get(id);
  const correct = isCorrect(question, session.answers[id] ?? []);
  session.graded[id] = correct;
  if (correct) progress.wrong = progress.wrong.filter(item => item !== id);
  else if (!progress.wrong.includes(id)) progress.wrong.push(id);
  const activityId = `${session.id}:${id}`;
  if (!progress.activities.some(activity => activity.id === activityId)) progress.activities.push({ id: activityId, qid: id, at: Date.now(), correct });
  progress.activities = progress.activities.slice(-10000);
}
function currentQuestion() { return questionById.get(session.questionIds[session.index]); }
function selectedLabels(question, answers) {
  return answers.length ? question.options.filter(option => answers.includes(option.id)).map(option => option.id).join('、') : '未作答';
}
function explanation(question, answers) {
  const correct = isCorrect(question, answers);
  const text = question.explanation || '本题暂未填写详细解析，请回到课件核对。';
  const keywordIndex = text.search(/重点词[：:]/);
  const chainIndex = text.search(/逻辑链[：:]/);
  const bodyEnd = Math.min(...[keywordIndex, chainIndex, text.length].filter(index => index >= 0));
  const node = el('div', { class: `explanation${correct ? '' : ' wrong'}` }, el('h2', {}, correct ? '✓ 回答正确，继续保持。' : answers.length ? '再看一遍，你会更清楚。' : '这道题还没有作答。'), el('p', {}, `你的答案：${selectedLabels(question, answers)}　　正确答案：${question.answers.join('、')}`), el('p', {}, text.slice(0, bodyEnd).trim()));
  if (keywordIndex >= 0) node.append(el('div', { class: 'study-note keywords' }, el('h3', {}, '重点词 · Key terms'), el('p', {}, text.slice(keywordIndex, chainIndex > keywordIndex ? chainIndex : text.length).replace(/^重点词[：:]\s*/, '').trim())));
  if (chainIndex >= 0) node.append(el('div', { class: 'study-note logic-chain' }, el('h3', {}, '重点逻辑链'), el('p', {}, text.slice(chainIndex).replace(/^逻辑链[：:]\s*/, '').trim())));
  node.append(el('div', { class: 'source' }, question.source ? `课件来源：${question.source.file} · ${sourcePage(question.source.page)}` : '操作示例题，无课程课件来源。'));
  return node;
}
function renderTutorials() {
  const questions = tutorialQuestions();
  main.append(heading('先把老师的 Tutorial 想透。', '每道原问题转为不定项选择题，抓住原理、逻辑链和应用边界。', 'TUTORIAL FOCUS'));
  if (!questions.length) { main.append(emptyState('当前题库没有 Tutorial 重点题。', '切换到课程题库后，即可练习老师的重点问题。')); return; }
  main.append(el('div', { class: 'list-header' }, button(`练习全部 ${questions.length} 道重点题 →`, 'primary', () => startSession('practice', questions.map(question => question.id), true)), el('span', { class: 'meta-row' }, '按老师原题顺序 · 中文解析、重点词与逻辑链')));
  const list = el('div', { class: 'question-list' });
  for (const question of questions) list.append(el('article', { class: 'question-preview' }, el('div', { class: 'meta-row' }, el('span', { class: 'pill tutorial-pill' }, question.tutorial), question.source ? `${question.source.file} · ${sourcePage(question.source.page)}` : ''), el('h3', {}, question.prompt), button('练习这道重点题 →', 'text-button', () => startSession('practice', [question.id]))));
  main.append(list);
}
function sourcePage(page) { return typeof page === 'number' ? `第 ${page} 页` : page; }
function renderQuiz() {
  if (!session) { navigate('home'); return; }
  const question = currentQuestion();
  const graded = session.mode === 'practice' && owns(session.graded, question.id);
  main.append(el('div', { class: 'quiz-top' }, button('← 保存并返回', 'back-button', () => { saveSession(); navigate('home'); }), session.mode === 'exam' ? el('span', { class: 'timer', id: 'timer', role: 'timer', 'aria-label': '剩余考试时间' }, remainingTime()) : el('span', { class: 'timer' }, '按自己的节奏来')));
  const card = el('section', { class: 'question-card', 'aria-labelledby': 'question-title' }, el('div', { class: 'question-top' }, el('div', { class: 'meta-row' }, el('span', { class: 'pill' }, question.type === 'single' ? '单选题' : '不定项选择'), el('span', {}, question.chapter), el('span', {}, question.difficulty)), favoriteButton(question.id)), el('h1', { id: 'question-title', tabindex: '-1' }, question.prompt), el('p', { class: 'question-help' }, question.type === 'single' ? '选择一个最合适的答案。' : '选择所有正确选项，正确项数不提示。'));
  const options = el('fieldset', { class: 'options' }, el('legend', { class: 'sr-only' }, '答案选项'));
  session.orders[question.id].forEach(optionId => {
    const option = question.options.find(item => item.id === optionId);
    const selected = session.answers[question.id].includes(option.id);
    const right = graded && question.answers.includes(option.id);
    const wrong = graded && selected && !right;
    const input = el('input', { type: question.type === 'single' ? 'radio' : 'checkbox', name: 'answer', value: option.id, checked: selected, disabled: graded, on: { change: () => {
      if (session.mode === 'exam' && Date.now() >= session.deadline) { completeSession(true); return; }
      if (graded) return;
      if (question.type === 'single') session.answers[question.id] = [option.id];
      else {
        const current = new Set(session.answers[question.id]);
        if (input.checked) current.add(option.id); else current.delete(option.id);
        session.answers[question.id] = [...current];
      }
      saveSession();
      options.querySelectorAll('.option').forEach(label => label.classList.toggle('selected', label.querySelector('input').checked));
      const submit = document.querySelector('#check-answer');
      if (submit) submit.disabled = !session.answers[question.id].length;
      updateQuestionMap();
    } } });
    options.append(el('label', { class: `option${selected ? ' selected' : ''}${right ? ' correct' : ''}${wrong ? ' incorrect' : ''}` }, input, el('span', { class: 'option-letter', 'aria-hidden': true }, option.id), el('span', { class: 'option-text' }, el('span', { class: 'sr-only' }, `${option.id}：`), option.text), right || wrong ? el('span', { class: 'option-result', 'aria-hidden': true }, right ? '✓' : '×') : null));
  });
  if (question.tutorial) card.insertBefore(el('div', { class: 'tutorial-label' }, question.tutorial), card.querySelector('#question-title'));
  card.append(options);
  if (graded) card.append(explanation(question, session.answers[question.id]));
  const previous = button('← 上一题', 'secondary', () => changeQuestion(-1), { disabled: session.index === 0 });
  const next = button(session.index === session.questionIds.length - 1 ? '最后一题' : '下一题 →', 'secondary', () => changeQuestion(1), { disabled: session.index === session.questionIds.length - 1 });
  const check = session.mode === 'practice' && !graded ? button('提交答案', 'primary', () => { if (!session.answers[question.id].length) return; recordGrade(question.id); saveSession(); render(); }, { id: 'check-answer', disabled: !session.answers[question.id].length }) : null;
  card.append(el('div', { class: 'quiz-actions' }, previous, el('div', {}, check, next)), button(session.mode === 'exam' ? '交卷并查看结果' : '结束本次练习', 'text-button', requestFinish, { style: 'margin-top:18px;font-size:11px' }));
  main.append(el('div', { class: 'quiz-layout' }, card, questionMap()));
  updateTimer();
}
function changeQuestion(offset) {
  session.index = Math.max(0, Math.min(session.questionIds.length - 1, session.index + offset));
  saveSession();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.querySelector('#question-title')?.focus({ preventScroll: true });
}
function questionMap() {
  const node = el('aside', { class: 'panel question-map', 'aria-label': '题目导航' }, el('h2', {}, '本次练习'), el('p', { class: 'progress-description', id: 'progress-description' }), el('div', { class: 'progress-track' }, el('div', { class: 'progress-fill', id: 'progress-fill' })), el('div', { class: 'question-dots' }, session.questionIds.map((id, index) => button(index + 1, 'question-dot', () => { session.index = index; saveSession(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); }, { 'data-question-index': index, 'aria-label': `跳到第 ${index + 1} 题` }))), el('p', { class: 'map-legend' }, session.mode === 'exam' ? '绿色：已作答　空白：未作答\n交卷前可自由修改答案。' : '绿色：答对　浅棕：答错\n已提交的答案不能修改。'), button(session.mode === 'exam' ? '交卷并查看结果' : '结束并查看结果', 'secondary', requestFinish));
  queueMicrotask(updateQuestionMap);
  return node;
}
function updateQuestionMap() {
  if (!session) return;
  const done = session.mode === 'practice' ? Object.keys(session.graded).length : session.questionIds.filter(id => session.answers[id].length).length;
  const description = document.querySelector('#progress-description');
  if (description) description.textContent = `已${session.mode === 'practice' ? '提交' : '作答'} ${done} / ${session.questionIds.length} 题`;
  const fill = document.querySelector('#progress-fill');
  if (fill) fill.style.width = `${percentage(done, session.questionIds.length)}%`;
  document.querySelectorAll('[data-question-index]').forEach(node => {
    const index = Number(node.dataset.questionIndex), id = session.questionIds[index];
    node.classList.toggle('current', session.index === index);
    node.classList.toggle('answered', session.mode === 'exam' ? session.answers[id].length > 0 : session.graded[id] === true);
    node.classList.toggle('failed', session.mode === 'practice' && session.graded[id] === false);
    if (session.index === index) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    const status = session.mode === 'exam' ? (session.answers[id].length ? '已作答' : '未作答') : owns(session.graded, id) ? (session.graded[id] ? '答对' : '答错') : '未提交';
    node.setAttribute('aria-label', `第 ${index + 1} 题，${status}`);
  });
}
function remainingTime() {
  if (!session?.deadline) return '';
  const seconds = Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
  return `剩余 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function updateTimer() {
  if (activating || !session || session.mode !== 'exam') return;
  if (Date.now() >= session.deadline) { completeSession(true); return; }
  const timer = document.querySelector('#timer');
  if (timer) { timer.textContent = remainingTime(); timer.classList.toggle('urgent', session.deadline - Date.now() <= 60000); }
}
function requestFinish() {
  if (!session) return;
  const missing = session.questionIds.filter(id => !session.answers[id].length).length;
  const ungraded = session.questionIds.filter(id => !owns(session.graded, id)).length;
  const message = session.mode === 'exam' ? `${missing ? `还有 ${missing} 道题未作答。` : '已完成全部作答。'}确定交卷吗？未作答的题目按错误计。` : `${ungraded ? `还有 ${ungraded} 道题未提交，结束后将按当前选项统一评分。` : '所有题目都已提交。'}确定结束本次练习吗？`;
  if (confirm(message)) completeSession(false);
}
function completeSession(expired) {
  if (!session || session.finished) return;
  session.questionIds.forEach(recordGrade);
  session.finished = true;
  const end = Date.now(), correct = Object.values(session.graded).filter(Boolean).length;
  const summary = { id: session.id, mode: session.mode, start: session.start, end, total: session.questionIds.length, correct };
  if (!progress.history.some(item => item.id === session.id)) progress.history.unshift(summary);
  progress.history = progress.history.slice(0, 100);
  result = { ...session, end, expired, correct };
  progress.current = null;
  session = null;
  save();
  navigate('result');
  if (expired) toast('模拟时间已到，已自动交卷并保存结果。');
}
function renderResult() {
  const total = result.questionIds.length, failed = result.questionIds.filter(id => !result.graded[id]);
  main.append(el('section', { class: 'result-hero' }, el('p', { class: 'eyebrow' }, result.mode === 'exam' ? 'MOCK EXAM COMPLETE' : 'A LITTLE MORE CONFIDENT'), el('h1', {}, result.expired ? '时间到，看看这次的收获。' : '又完成了一次认真练习。'), el('div', { class: 'result-score' }, percentage(result.correct, total), el('small', {}, '%')), el('p', {}, `答对 ${result.correct} / ${total} 题 · 用时 ${duration(result.start, result.end)} · ${failed.length ? `${failed.length} 道题待巩固` : '这次全部答对了'}`), el('div', { class: 'result-actions' }, button('回到学习空间', 'primary', () => navigate('home')), failed.length ? button('重练本次错题', 'secondary', () => startSession('practice', failed)) : button('再练一组', 'secondary', () => startSession('practice')))));
  main.append(el('div', { class: 'section-title' }, el('h2', {}, '回顾一下，更进一步'), el('span', {}, '展开查看答案与解析')));
  result.questionIds.forEach((id, index) => {
    const question = questionById.get(id);
    main.append(el('details', { class: 'result-details' }, el('summary', {}, `${result.graded[id] ? '✓' : '○'} ${index + 1}. ${question.prompt}`), explanation(question, result.answers[id])));
  });
}
function renderCollection() {
  const wrong = view === 'wrong', ids = wrong ? progress.wrong : progress.favorites;
  main.append(heading(wrong ? '把错题，变成熟题。' : '值得再看一遍的知识。', wrong ? '答对一次，题目就会自动离开错题本。' : '把容易混淆的题目留在这里，随时回来复习。', wrong ? 'LEARN FROM EVERY MISTAKE' : 'KEEP WHAT MATTERS'));
  if (!ids.length) {
    main.append(emptyState(wrong ? '还没有待巩固的错题。' : '你的收藏夹，等着第一道题。', wrong ? '完成练习后，答错的题目会自动保存在这里。' : '做题时点一下星星，就能把题目留在这里。'));
    return;
  }
  main.append(el('div', { class: 'list-header' }, button(wrong ? '开始错题重练 →' : '练习全部收藏 →', 'primary', () => startSession('practice', [...ids])), el('span', { class: 'meta-row' }, `共 ${ids.length} 道题`)));
  const list = el('div', { class: 'question-list' });
  ids.forEach(id => {
    const question = questionById.get(id);
    list.append(el('article', { class: 'question-preview' }, el('div', { class: 'meta-row' }, el('span', { class: 'pill' }, question.type === 'single' ? '单选题' : '不定项选择'), question.chapter, question.source ? `· ${sourcePage(question.source.page)}` : ''), el('h3', {}, question.prompt), el('div', { class: 'preview-actions' }, button('练习这道题 →', 'text-button', () => startSession('practice', [id])), button(wrong ? '移出错题本' : '取消收藏', 'text-button', () => { progress[wrong ? 'wrong' : 'favorites'] = ids.filter(item => item !== id); save(); render(); }))));
  });
  main.append(list);
}
function emptyState(title, description) {
  return el('div', { class: 'empty-state' }, el('div', { class: 'empty-symbol', 'aria-hidden': true }, view === 'favorites' ? '☆' : '✳'), el('h2', {}, title), el('p', {}, description), button('从一组练习开始 →', 'primary', () => navigate('home')));
}
function renderHistory() {
  main.append(heading('每一点努力，都有记录。', '记录只保存在当前浏览器，不同题库分别统计。', 'YOUR LEARNING JOURNEY'));
  if (!progress.history.length) { main.append(emptyState('第一份练习记录，等你完成。', '结束练习或提交模拟试卷后，成绩会出现在这里。')); return; }
  const list = el('div', { class: 'chapter-list', style: 'margin-top:25px' });
  progress.history.forEach(item => list.append(el('div', { class: 'history-row' }, el('div', {}, el('strong', {}, item.mode === 'exam' ? '限时模拟' : '日常练习'), el('p', {}, `${dateText(item.end)} · ${item.total} 道题 · 用时 ${duration(item.start, item.end)}`)), el('div', { class: 'history-score' }, `${percentage(item.correct, item.total)}% `, el('small', {}, `${item.correct}/${item.total}`)))));
  main.append(list);
}
async function fetchBank(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`题库加载失败（${response.status}）。请检查文件是否已上传完整。`);
  return validateBank(await response.json());
}
async function getDemo() { if (!demoBank) demoBank = await fetchBank('./data/demo.json'); return demoBank; }
async function restoreBuiltin() {
  removeStorage(IMPORT_KEY);
  await activateBank(builtinBank.questions.length ? builtinBank : await getDemo(), builtinBank.questions.length ? 'builtin' : 'demo');
}
function downloadBank() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bank, null, 2)], { type: 'application/json' }));
  const link = el('a', { href: url, download: `MLE5216-${bankKind}-questions.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector('#navigation').addEventListener('click', event => {
  const target = event.target.closest('[data-view]');
  if (target && progress) navigate(target.dataset.view);
});
document.querySelector('.brand').addEventListener('click', event => { if (progress) { event.preventDefault(); navigate('home'); } });
document.querySelector('#import-bank').addEventListener('click', () => document.querySelector('#bank-file').click());
document.querySelector('#bank-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('题库文件过大，请使用 10 MB 以内的 JSON 文件。'); return; }
  try {
    const imported = validateBank(JSON.parse(await file.text()));
    if (!imported.questions.length) throw new Error('导入题库至少需要一道题。');
    writeStorage(IMPORT_KEY, JSON.stringify(imported));
    await activateBank(imported, 'import');
    toast(`已载入「${imported.title}」，共 ${imported.questions.length} 道题。`);
  } catch (error) { toast(error instanceof SyntaxError ? '文件不是有效的 JSON，请检查格式后重新导入。' : error.message || '导入失败，请检查题库。'); }
});
document.querySelector('#reset-progress').addEventListener('click', () => {
  if (!progress || !confirm('清除当前题库的错题、收藏、练习记录和未完成练习？此操作无法撤销。')) return;
  removeStorage(bankKey);
  session = null;
  result = null;
  loadProgress();
  navigate('home');
  toast('当前题库的练习进度已清除。');
});
window.addEventListener('beforeunload', () => { if (progress) saveSession(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimer(); });
setInterval(updateTimer, 1000);

async function init() {
  try {
    builtinBank = await fetchBank('./data/questions.json');
    const choice = readStorage(CHOICE_KEY);
    const storedImport = readStorage(IMPORT_KEY);
    if (choice === 'import' && storedImport) {
      try { await activateBank(validateBank(JSON.parse(storedImport)), 'import'); return; }
      catch { removeStorage(IMPORT_KEY); }
    }
    if (choice === 'demo' || !builtinBank.questions.length) await activateBank(await getDemo(), 'demo');
    else await activateBank(builtinBank, 'builtin');
  } catch (error) {
    main.replaceChildren(el('div', { class: 'error-box' }, el('h1', {}, '练习室暂时没有打开'), el('p', {}, error.message || '无法读取题库，请稍后再试。'), el('p', {}, '本地使用时，请运行 npm run dev 并访问 http://127.0.0.1:5173。'), button('重新加载', 'secondary', () => location.reload())));
  }
}
init();
