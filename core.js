/** Pure question-bank validation and quiz logic. No browser state is used here. */
const LIMITS = Object.freeze({ questions: 5000, options: 12, short: 120, prompt: 12000, option: 4000, explanation: 16000 });

function fail(message) {
  throw new Error(`题库格式错误：${message}`);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须是对象。`);
}

function string(value, label, max, allowEmpty = false) {
  if (typeof value !== 'string') fail(`${label}必须是文字。`);
  const result = value.trim();
  if (!allowEmpty && !result) fail(`${label}不能为空。`);
  if (result.length > max) fail(`${label}不能超过 ${max} 个字符。`);
  return result;
}

/** Validate and copy an untrusted imported JSON bank into the supported schema. */
export function validateBank(raw) {
  object(raw, '题库');
  if (raw.version !== 1) fail('version 必须为 1。');
  const title = string(raw.title, '题库名称', 200);
  if (!Array.isArray(raw.questions)) fail('questions 必须是题目数组。');
  if (raw.questions.length > LIMITS.questions) fail(`最多支持 ${LIMITS.questions} 道题。`);
  const questionIds = new Set();
  const questions = raw.questions.map((question, index) => {
    const label = `第 ${index + 1} 题`;
    object(question, label);
    const id = string(question.id, `${label}的 id`, LIMITS.short);
    if (questionIds.has(id)) fail(`题目 id「${id}」重复。`);
    questionIds.add(id);
    const chapter = string(question.chapter, `${label}的章节`, 200);
    const type = question.type;
    if (type !== 'single' && type !== 'multiple') fail(`${label}的 type 必须是 single 或 multiple。`);
    const prompt = string(question.prompt, `${label}的题干`, LIMITS.prompt);
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > LIMITS.options) {
      fail(`${label}需要 2–${LIMITS.options} 个选项。`);
    }
    const optionIds = new Set();
    const options = question.options.map((option, optionIndex) => {
      const optionLabel = `${label}第 ${optionIndex + 1} 个选项`;
      object(option, optionLabel);
      const optionId = string(option.id, `${optionLabel}的 id`, 24);
      if (optionIds.has(optionId)) fail(`${label}的选项 id「${optionId}」重复。`);
      optionIds.add(optionId);
      return { id: optionId, text: string(option.text, `${optionLabel}内容`, LIMITS.option) };
    });
    if (!Array.isArray(question.answers) || question.answers.length < 1 || question.answers.length > options.length) {
      fail(`${label}的 answers 必须是非空答案数组。`);
    }
    const answerIds = new Set();
    const answers = question.answers.map(answer => {
      const answerId = string(answer, `${label}的答案 id`, 24);
      if (!optionIds.has(answerId)) fail(`${label}的答案「${answerId}」没有对应选项。`);
      if (answerIds.has(answerId)) fail(`${label}的答案「${answerId}」重复。`);
      answerIds.add(answerId);
      return answerId;
    });
    if (type === 'single' && answers.length !== 1) fail(`${label}是单选题，只能有一个正确答案。`);
    // The teacher uses select-all-that-apply questions without disclosing the number of correct options.
    // A checkbox question may therefore have one or more correct answers.
    const explanation = string(question.explanation ?? '', `${label}的解析`, LIMITS.explanation, true);
    const difficulty = question.difficulty ?? '基础';
    if (difficulty !== '基础' && difficulty !== '进阶') fail(`${label}的 difficulty 必须是「基础」或「进阶」。`);
    let source = null;
    if (question.source != null) {
      object(question.source, `${label}的课件来源`);
      const file = string(question.source.file, `${label}的来源文件`, 300);
      const page = question.source.page;
      if (!(Number.isInteger(page) && page > 0) && !(typeof page === 'string' && page.trim() && page.length <= 80)) {
        fail(`${label}的来源页码必须是正整数或简短的页码说明。`);
      }
      source = { file, page: typeof page === 'string' ? page.trim() : page };
    }
    const tutorial = question.tutorial == null ? null : string(question.tutorial, `${label}的 Tutorial 标记`, 150);
    const batch = question.batch == null ? null : string(question.batch, `${label}的练习分组`, 150);
    return { id, chapter, type, prompt, options, answers, explanation, source, difficulty, ...(tutorial ? { tutorial } : {}), ...(batch ? { batch } : {}) };
  });
  return { version: 1, title, questions };
}

/** Multiple-choice credit requires the complete correct set, without extra answers. */
export function isCorrect(question, selected) {
  if (!Array.isArray(selected) && !(selected instanceof Set)) return false;
  const values = [...selected];
  const selection = new Set(values);
  return selection.size === values.length
    && selection.size === question.answers.length
    && question.answers.every(answer => selection.has(answer));
}

/** Fisher–Yates shuffle; always leaves the input array unchanged. */
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = rng();
    if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('随机数必须在 0（含）与 1（不含）之间。');
    const swap = Math.floor(random * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/** Select a session by chapter / ids, preserving stable answer IDs when options move. */
export function buildSession(questions, settings = {}, rng = Math.random) {
  const { chapter = 'all', count = 10, shuffleQuestions = true, shuffleOptions = false, ids = null } = settings;
  const selectedIds = ids == null ? null : new Set(ids);
  let selected = questions.filter(question => (chapter === 'all' || question.chapter === chapter)
    && (selectedIds == null || selectedIds.has(question.id)));
  if (shuffleQuestions) selected = shuffle(selected, rng);
  const limit = count === Infinity ? selected.length : (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 10);
  return selected.slice(0, limit).map(question => ({
    ...question,
    answers: [...question.answers],
    source: question.source ? { ...question.source } : null,
    options: (shuffleOptions ? shuffle(question.options, rng) : question.options).map(option => ({ ...option })),
  }));
}
