import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBank, isCorrect, shuffle, buildSession } from '../core.js';

const demo = JSON.parse(readFileSync(new URL('../data/demo.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('shipped demo and real bank validate without modifying input', () => {
  const original = clone(demo);
  const bank = validateBank(demo);
  assert.deepEqual(demo, original);
  assert.notEqual(bank.questions, demo.questions);
  assert.equal(bank.questions.length, 5);
  assert.ok(Array.isArray(validateBank(JSON.parse(readFileSync(new URL('../data/questions.json', import.meta.url), 'utf8'))).questions));
});

test('invalid bank envelope and unsupported versions are rejected clearly', () => {
  for (const invalid of [null, [], { version: 2, title: '题库', questions: [] }, { version: 1, title: '题库', questions: {} }]) {
    assert.throws(() => validateBank(invalid), /题库格式错误/);
  }
});

test('duplicate question and option IDs cannot silently merge records', () => {
  const duplicateQuestion = clone(demo);
  duplicateQuestion.questions.push(clone(duplicateQuestion.questions[0]));
  assert.throws(() => validateBank(duplicateQuestion), /题目 id.*重复/);
  const duplicateOption = clone(demo);
  duplicateOption.questions[0].options[1].id = 'A';
  assert.throws(() => validateBank(duplicateOption), /选项 id.*重复/);
});

test('invalid answer references, duplicates and single/multiple mismatches fail validation', () => {
  for (const [answers, type, expected] of [
    [['Z'], 'single', /没有对应选项/],
    [['A', 'A'], 'multiple', /重复/],
    [['A', 'B'], 'single', /只能有一个/],
    [[], 'single', /非空答案数组/],
  ]) {
    const bank = clone(demo);
    Object.assign(bank.questions[0], { answers, type });
    assert.throws(() => validateBank(bank), expected);
  }
});

test('oversized text and malformed source locations are rejected', () => {
  const long = clone(demo);
  long.questions[0].prompt = '题'.repeat(12001);
  assert.throws(() => validateBank(long), /不能超过/);
  const source = clone(demo);
  source.questions[0].source = { file: 'lecture.pdf', page: -1 };
  assert.throws(() => validateBank(source), /来源页码/);
  source.questions[0].source.page = 3;
  assert.deepEqual(validateBank(source).questions[0].source, { file: 'lecture.pdf', page: 3 });
});

test('multiple answers require exactly the correct set in any order', () => {
  const question = { answers: ['A', 'C'] };
  assert.equal(isCorrect(question, ['C', 'A']), true);
  assert.equal(isCorrect(question, new Set(['A', 'C'])), true);
  for (const selected of [[], ['A'], ['A', 'B', 'C'], ['A', 'A', 'C'], ['B', 'C'], null]) {
    assert.equal(isCorrect(question, selected), false);
  }
});

test('shuffle is reproducible with a supplied rng and preserves inputs', () => {
  const items = ['A', 'B', 'C', 'D'];
  assert.deepEqual(shuffle(items, () => 0), ['B', 'C', 'D', 'A']);
  assert.deepEqual(items, ['A', 'B', 'C', 'D']);
  assert.throws(() => shuffle(items, () => 1), /随机数/);
});

test('session respects chapter / id filters, count and original ordering', () => {
  const questions = validateBank(demo).questions;
  questions[4].chapter = '另一章';
  const result = buildSession(questions, { chapter: '操作示例', ids: ['demo-001', 'demo-003', 'demo-005'], count: 1, shuffleQuestions: false });
  assert.deepEqual(result.map(question => question.id), ['demo-001']);
  assert.equal(buildSession(questions, { chapter: '不存在', count: 10 }).length, 0);
  assert.equal(buildSession(questions, { count: 0 }).length, 0);
  assert.equal(buildSession(questions, { count: Infinity }).length, 5);
});

test('shuffled session options keep their IDs and correct answers together', () => {
  const questions = validateBank(demo).questions;
  const snapshot = clone(questions);
  const session = buildSession(questions, { count: 1, shuffleQuestions: false, shuffleOptions: true }, () => 0);
  assert.deepEqual(session[0].options.map(option => option.id), ['B', 'C', 'D', 'A']);
  assert.equal(session[0].options.find(option => option.id === 'A').text, questions[0].options[0].text);
  assert.equal(isCorrect(session[0], ['A']), true);
  session[0].options[0].text = 'changed';
  session[0].answers.push('B');
  assert.deepEqual(questions, snapshot);
});

 test('teacher checkbox format allows one correct answer without disclosing count', () => {
 const bank=clone(demo); bank.questions[0].type='multiple';
 assert.deepEqual(validateBank(bank).questions[0].answers,['A']);
 });
