import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeQuestion } from '../scripts/bank-utils.mjs';

const question = (explanation = '') => ({
  id: 'bank-utils-regression',
  chapter: '示例',
  type: 'multiple',
  prompt: 'Which statements are correct?\n哪些陈述正确？',
  options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: `Option ${id}\n选项内容${id}` })),
  answers: ['A', 'C'],
  explanation,
  source: { file: 'example.pdf', page: 'PDF p. 3' },
  difficulty: '基础',
});

test('option ordering and answer mapping stay deterministic without changing authoring input', () => {
  const source = question();
  const snapshot = structuredClone(source);
  const first = arrangeQuestion(source);
  const second = arrangeQuestion(source);
  assert.deepEqual(first, second);
  assert.deepEqual(source, snapshot);
  // Captured from the original build function before extracting it.
  assert.deepEqual(first.options.map(option => option.text), [1, 2, 3, 0].map(index => source.options[index].text));
  assert.deepEqual(first.options.map(option => option.id), ['A', 'B', 'C', 'D']);
  assert.deepEqual(first.answers, ['B', 'D']);
  const originalCorrectTexts = source.options.filter(option => source.answers.includes(option.id)).map(option => option.text).sort();
  const arrangedCorrectTexts = first.options.filter(option => first.answers.includes(option.id)).map(option => option.text).sort();
  assert.deepEqual(arrangedCorrectTexts, originalCorrectTexts);
  for (const key of ['id', 'chapter', 'type', 'prompt', 'source', 'difficulty']) assert.deepEqual(first[key], source[key]);
});

test('per-option Chinese judgment headings follow their reassigned letters', () => {
  const source = question('A（正确）：机制一。\nB（错误）：机制二。\nC 对：机制三。\nD 错：机制四。\nA: 正确。B：错误。C(正确):另一个句式。D 正确：完整词。');
  assert.equal(arrangeQuestion(source).explanation,
    'D（正确）：机制一。\nA（错误）：机制二。\nB 对：机制三。\nC 错：机制四。\nD: 正确。A：错误。B(正确):另一个句式。C 正确：完整词。');
});

test('grouped judgments and mixed judgments remap all option labels', () => {
  const source = question('A、C 均对：共同机制。B、D 都错：另一机制。\nA、B、C、D 均正确：全部。\nA 错、B 对：分别判断。C 与 D 错误：组合。');
  assert.equal(arrangeQuestion(source).explanation,
    'D、B 均对：共同机制。A、C 都错：另一机制。\nD、A、B、C 均正确：全部。\nD 错、A 对：分别判断。B 与 C 错误：组合。');
});

test('chemical symbols, characteristic lines and specimen/algebra variables remain unchanged', () => {
  const body = 'C是碳，B是硼，C-K边不同于B-K边。样品 A、B、C 的厚度不同。样品A对应第一幅图，样品B对应第二幅图。C 对元素映射的贡献较弱。A + B = C；C_A/C_B = k_AB × I_A/I_B；A:B = 3:1。';
  const source = question(`A 对：${body}\nB 错：${body}\nC（正确）：${body}\nD：错误。${body}`);
  assert.equal(arrangeQuestion(source).explanation,
    `D 对：${body}\nA 错：${body}\nB（正确）：${body}\nC：错误。${body}`);
  assert.equal(arrangeQuestion(question(body)).explanation, body);
});

test('one-correct and all-correct answer sets preserve their meaning after rearrangement', () => {
  const single = question();
  single.answers = ['D'];
  assert.deepEqual(arrangeQuestion(single).answers, ['C']);
  const all = question();
  all.answers = ['D', 'A', 'C', 'B'];
  assert.deepEqual(arrangeQuestion(all).answers, ['A', 'B', 'C', 'D']);
});
