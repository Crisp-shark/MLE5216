import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBank, isCorrect } from '../core.js';

const read = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const chinese = /[\u3400-\u9fff]/;
const english = /[A-Za-z]/;

test('the compact course bank has English-only questions and Chinese explanations with sources', () => {
  const bank = validateBank(read('data/questions.json'));
  assert.ok(bank.questions.length >= 110 && bank.questions.length <= 150);
  for (const question of bank.questions) {
    assert.equal(question.type, 'multiple', question.id);
    assert.equal(question.options.length, 4, question.id);
    for (const text of [question.prompt, ...question.options.map(option => option.text)]) {
      assert.ok(!chinese.test(text) && english.test(text), `${question.id}: questions must use English only`);
    }
    assert.ok(chinese.test(question.explanation), question.id);
    assert.match(question.explanation, /重点词[：:]/, question.id);
    assert.match(question.explanation, /逻辑链[：:][\s\S]*→/, question.id);
    assert.doesNotMatch([question.prompt, ...question.options.map(option => option.text)].join(' '), /\d+(?:\.\d+)?\s*(?:keV|kV|eV|nm|mm|μm|µm|%|Tesla|mrad)\b/i, question.id);
    assert.ok(question.source?.file && question.source?.page, question.id);
    assert.ok(isCorrect(question, question.answers), question.id);
    for (const option of question.options.filter(option => !question.answers.includes(option.id))) {
      assert.equal(isCorrect(question, [...question.answers, option.id]), false, question.id);
    }
    assert.equal(isCorrect(question, question.answers.slice(1)), false, question.id);
  }
  const counts = new Set(bank.questions.map(question => question.answers.length));
  assert.deepEqual([...counts].sort(), [1, 2, 3, 4]);
});

test('all fifteen teacher tutorials remain explicitly marked and available for focused practice', () => {
  const bank = validateBank(read('data/questions.json'));
  const tags = bank.questions.filter(question => question.tutorial).map(question => question.tutorial);
  const expected = ['SEM', 'TEM', 'Electron Spectroscopy'].flatMap(name => Array.from({ length: 5 }, (_, index) => `${name} Tutorial Q${index + 1}`));
  assert.equal(tags.length, 15);
  assert.deepEqual([...tags].sort(), expected.sort());
});

test('the additional practice set contains twenty new questions without replacing tutorial labels', () => {
  const bank = validateBank(read('data/questions.json'));
  const added = bank.questions.filter(question => question.batch);
  assert.equal(added.length, 20);
  assert.ok(added.every(question => !question.tutorial));
});

test('the directly opened entry embeds its data and runtime without external module imports', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="inline-banks"/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /import\s*\{[^}]+\}\s*from\s*['"]\.\//);
  assert.match(html, /Tutorial重点/);
});

test('all published questions have a valid knowledge-point coverage reference', () => {
  const bank = validateBank(read('data/questions.json'));
  const ids = new Set(bank.questions.map(question => question.id));
  const covered = new Set();
  for (const name of ['sem', 'tem', 'spectroscopy', 'stem', 'comparison']) {
    const source = read(`data/${name}.json`);
    const coverage = read(`coverage/${name}.json`);
    const localIds = new Set(source.questions.map(question => question.id));
    for (const topic of coverage.topics) {
      assert.ok(topic.topic && topic.pages.length && topic.questionIds.length, name);
      for (const id of topic.questionIds) {
        assert.ok(ids.has(id) && localIds.has(id), id);
        covered.add(id);
      }
    }
  }
  assert.equal(covered.size, ids.size);
});

test('every supplied lecture page has an explicit coverage or exclusion responsibility', () => {
  for (const name of ['sem', 'tem', 'spectroscopy', 'stem']) {
    const coverage = read(`coverage/${name}.json`);
    const total = coverage.pdfPages ?? coverage.totalPdfPages;
    assert.ok(Number.isInteger(total), name);
    const accounted = new Set([
      ...coverage.topics.flatMap(topic => topic.pages),
      ...(coverage.excludedPages ?? []).flatMap(item => item.pages),
      ...(coverage.coveredElsewhere ?? []).flatMap(item => item.pages),
    ].filter(page => Number.isInteger(page)));
    for (let page = 1; page <= total; page++) assert.ok(accounted.has(page), `${name}: PDF page ${page} needs a coverage decision`);
  }
});
