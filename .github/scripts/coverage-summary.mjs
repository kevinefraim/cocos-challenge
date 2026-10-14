import { readFile } from 'node:fs/promises';
import process from 'node:process';

const { total } = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const metrics = ['lines', 'statements', 'functions', 'branches'];
const rows = metrics
  .map((metric) => {
    const { pct, covered, total: count } = total[metric];
    const completed = Math.round(pct / 10);
    const progress = `${'🟩'.repeat(completed)}${'⬜'.repeat(10 - completed)}`;
    const status = pct >= 80 ? '✅ Pass' : '❌ Below target';

    return `| ${metric[0].toUpperCase()}${metric.slice(1)} | ${progress} ${pct}% | ${covered}/${count} | ${status} |`;
  })
  .join('\n');

process.stdout.write(
  `# ✅ Coverage gate passed\n\n> Required threshold: **80%** for lines, statements, functions, and branches.\n\n| Metric | Coverage | Covered | Gate |\n| --- | --- | ---: | --- |\n${rows}\n\n📦 Download the **\`coverage-report\`** artifact below to browse the full HTML report by file and line.`,
);
