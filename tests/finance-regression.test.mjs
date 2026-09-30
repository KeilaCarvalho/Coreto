import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { jsPDF } from 'jspdf';
import { extractText } from 'unpdf';

async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { latestAtOrBefore } = await sourceModule('../lib/finance-history.ts');
const { createFinancePdf } = await sourceModule('../lib/finance-pdf.ts');

test('new dates retain the latest earlier entry without borrowing future values or changing history', () => {
  const rows = [{ date: '2026-09-17', value: 170 }, { date: '2026-09-20', value: 200 }, { date: '2026-09-10', value: 100 }];
  const original = structuredClone(rows);
  assert.equal(latestAtOrBefore(rows, '2026-09-18', r => r.date).value, 170);
  assert.equal(latestAtOrBefore(rows, '2026-09-19', r => r.date).value, 170);
  assert.equal(latestAtOrBefore(rows, '2026-09-10', r => r.date).value, 100);
  assert.equal(latestAtOrBefore(rows, '2026-09-01', r => r.date), undefined);
  assert.equal(latestAtOrBefore([], '2026-09-18', r => r.date), undefined);
  assert.deepEqual(rows, original);
  rows.push({ date: '2026-09-18', value: 0 });
  assert.equal(latestAtOrBefore(rows, '2026-09-19', r => r.date).value, 0);
  assert.equal(latestAtOrBefore([{ month: '2026-09', value: 42 }], '2026-10', r => r.month).value, 42);
});

for (const count of [0, 4, 6, 8, 9, 49]) {
  test(`PDF includes every bank and amount with ${count} accounts`, async () => {
    const banks = Array.from({ length: count }, (_, i) => ({ name: `BANCO_${String(i + 1).padStart(3, '0')}`, value: 1001 + i }));
    const data = { date: '2026-09-18', previousDateLabel: '17/09/2026', monthTotal: 100, previousDayTotal: 10, balanceTotal: banks.reduce((sum, b) => sum + b.value, 0), accountsPaid: 20, accountsPayable: 30, receivableTotal: 0, bankBalances: banks, receivableEntries: [], monthPayments: [], dayPayments: [], sellerSales: [] };
    const pdf = createFinancePdf(jsPDF, data);
    assert.equal(pdf.getNumberOfPages(), 1 + Math.ceil(Math.max(0, count - 8) / 40));
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    const { text } = await extractText(bytes.slice(), { mergePages: true });
    for (const bank of banks) {
      assert.ok(text.includes(bank.name), `Missing ${bank.name}`);
      assert.ok(text.includes(bank.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })), `Missing amount for ${bank.name}`);
    }
    if (count === 6 || count === 49) {
      await mkdir('outputs', { recursive: true });
      await writeFile(`outputs/finance-${count}-banks.pdf`, bytes);
    }
  });
}
