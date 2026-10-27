import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateBank } from '../core.js';
import { arrangeQuestion } from './bank-utils.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = await readFile(join(root, 'index.template.html'), 'utf8');
const names = ['sem', 'tem', 'spectroscopy', 'stem', 'comparison'];
const banks = await Promise.all(names.map(async name => validateBank(JSON.parse(await readFile(join(root, 'data', `${name}.json`), 'utf8')))));

const bank = validateBank({ version: 1, title: 'MLE5216 · 四份课件精练题库', questions: banks.flatMap(bank => bank.questions.map(arrangeQuestion)) });
await writeFile(join(root, 'data/questions.json'), JSON.stringify(bank, null, 2) + '\n');

const coverages = await Promise.all(names.map(async name => JSON.parse(await readFile(join(root, 'coverage', `${name}.json`), 'utf8'))));
const idSet = new Set(bank.questions.map(question => question.id));
const covered = new Set();
for (const coverage of coverages) {
  for (const topic of coverage.topics) for (const id of topic.questionIds) {
    if (!idSet.has(id)) throw new Error(`覆盖表引用了不存在的题号：${id}`);
    covered.add(id);
  }
}
for (const id of idSet) if (!covered.has(id)) throw new Error(`题目缺少覆盖映射：${id}`);
const safe = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# MLE5216 知识点覆盖表', '',
  `共 ${bank.questions.length} 道不定项选择题。题干和选项仅英文；中文解析包含逐项理由、重点英文词和逻辑链。`, '',
  '范围为用户提供的 SEM（50页）、TEM（55页）、Electron Spectroscopy（52页）和 Aberration-corrected STEM（45个PDF页，共202页）。以 PDF 文件页序定位；部分课件页脚有跳号或错位。', '',
  'SEM PDF第4–13页的上次期中题用于学习题风格：A–D逐项判断，不提示正确项数。正式练习按四份课件教学内容编写，包含跨设备比较和应用题。不是本次考试原题。', '',
  '当前程序按答案集合完全一致记分；这只是练习规则，课件未提供本次考试的部分得分规则。', '',
  '按老师样题的逐项判断方式，考查实际原理、因果关系、应用范围与设备间的联系。课件中的数值和计算示例改为定性理解，不要求背设备参数、示例材料的具体读数或算术结果。封面、课表、地点、提问链接和单纯视频/休息提示不单独出题；重复知识跨章节合并。', '',
];
const tutorialRank = question => {
  const course = ['SEM', 'TEM', 'Electron Spectroscopy'].findIndex(name => question.tutorial.startsWith(`${name} Tutorial`));
  return course * 100 + Number(question.tutorial.match(/Q(\d+)$/)?.[1]);
};
const tutorials = bank.questions.filter(question => question.tutorial).sort((a, b) => tutorialRank(a) - tutorialRank(b));
lines.push('## 老师 Tutorial 重点', '', `三组共 ${tutorials.length} 道主转换题，程序中可单独练习。重点是原问题的推理链，而非记忆题面数值。`, '', '| Tutorial | 题号 | 来源 |', '| --- | --- | --- |');
for (const question of tutorials) lines.push(`| ${safe(question.tutorial)} | ${question.id} | ${safe(question.source.file)} · ${safe(question.source.page)} |`);
lines.push('');
for (let index = 0; index < names.length; index++) {
  const coverage = coverages[index];
  lines.push(`## ${banks[index].title}（${banks[index].questions.length}题）`, '', '| 知识点 | PDF页序 | 题号 |', '| --- | --- | --- |');
  for (const topic of coverage.topics) lines.push(`| ${safe(topic.topic)} | ${safe(topic.pages.join(', '))} | ${topic.questionIds.join(', ')} |`);
  if (coverage.coveredElsewhere?.length) {
    lines.push('', '复习内容复用其他模块：', '');
    for (const item of coverage.coveredElsewhere) lines.push(`- PDF ${item.pages.join(', ')}：${safe(item.module || item.bank || '')}。${safe(item.reason || '')}`);
  }
  lines.push('', `详见 [原始覆盖索引](coverage/${names[index]}.json)，包含排除页及核对说明。`, '');
}
await writeFile(join(root, 'COVERAGE.md'), lines.join('\n'));

const dist = join(root, 'dist');
await mkdir(join(dist, 'data'), { recursive: true });
for (const file of ['styles.css', 'app.js', 'core.js', 'favicon.svg', 'COVERAGE.md']) await cp(join(root, file), join(dist, file));
for (const file of ['questions.json', 'demo.json']) await cp(join(root, 'data', file), join(dist, 'data', file));
await cp(join(root, 'coverage'), join(dist, 'coverage'), { recursive: true });

// A single-file copy also works when opened directly, without a local server.
const demo = validateBank(JSON.parse(await readFile(join(root, 'data/demo.json'), 'utf8')));
const core = (await readFile(join(root, 'core.js'), 'utf8')).replaceAll('export function ', 'function ');
let app = (await readFile(join(root, 'app.js'), 'utf8')).replace(/^import .*?;\n/, '');
app = app.replace(/async function fetchBank\(path\) \{[\s\S]*?\n\}\nasync function getDemo/, `async function fetchBank(path) {\n  const data = JSON.parse(document.querySelector('#inline-banks').textContent);\n  if (!data[path]) throw new Error('找不到内置题库。');\n  return validateBank(data[path]);\n}\nasync function getDemo`);
const css = await readFile(join(root, 'styles.css'), 'utf8');
const inline = JSON.stringify({ './data/questions.json': bank, './data/demo.json': demo }).replaceAll('<', '\\u003c');
const code = `const {validateBank,isCorrect,buildSession} = (() => {\n${core}\nreturn {validateBank,isCorrect,buildSession};\n})();\n${app}`.replaceAll('</script', '<\\/script');
let html = template;
html = html.replace(/  <link rel="icon"[^\n]*\n/, '').replace('  <link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`).replace('  <script type="module" src="./app.js"></script>', `<script type="application/json" id="inline-banks">${inline}</script>\n<script type="module">${code}</script>`);
await mkdir(join(root, 'output'), { recursive: true });
await writeFile(join(root, 'output/MLE5216-练习室.html'), html);
await writeFile(join(root, 'index.html'), html);
await writeFile(join(dist, 'index.html'), html);
console.log(`已构建 ${bank.questions.length} 道题；网站 dist/，离线练习 output/MLE5216-练习室.html。`);
