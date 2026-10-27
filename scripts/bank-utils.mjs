import { shuffle } from '../core.js';

const letters = ['A', 'B', 'C', 'D'];

// Source banks retain their authoring order; repeat builds generate identical output.
// Only option-label headings are remapped, preserving chemical symbols and variables.
export function arrangeQuestion(question) {
  let seed = 2166136261;
  for (const char of question.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const rng = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const order = shuffle(question.options, rng);
  const map = Object.fromEntries(order.map((option, index) => [option.id, letters[index]]));
  const remap = text => text.replace(/(?<![A-Za-z0-9\u3400-\u9fff])([A-D](?:[、，,与和及 ]+[A-D])*)(?=\s*(?:(?:均|都)?(?:正确|错误|对|错)(?=\s*[：:，,。；;、\n]|$)|[（(](?:正确|错误)[）)]\s*[：:]|[：:]\s*(?:正确|错误)(?=[。；;，,\s]|$)))/g,
    group => group.replace(/[A-D]/g, letter => map[letter]));
  return {
    ...question,
    options: order.map((option, index) => ({ id: letters[index], text: option.text })),
    answers: question.answers.map(letter => map[letter]).sort(),
    explanation: remap(question.explanation),
  };
}
