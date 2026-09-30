
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseContaAzulRows,parseDate,parseMoney,summarizeDre,emptyDreInputs,categoryGroup} from '../lib/dre.ts';
const headers=['Nome do fornecedor','Data de competência','Data de vencimento','Descrição','Situação','Valor original da parcela (R$)','Valor total pago da parcela (R$)','Valor total da parcela em aberto (R$)','Categoria 1'];
const row=(category='Salários',value=100,date='01/09/2026')=>['Fornecedor',date,'15/09/2026','Parcela','Quitado',value,value,0,category];
const parse=(rows)=>parseContaAzulRows([headers,...rows]);
const inputs={revenue:1000,freight:0,financialIncome:0,cmv:0,cpv:0};
test('dates, accents and Brazilian currency retain correct meaning',()=>{assert.equal(parseDate('31/02/2026'),null);assert.equal(parseDate('30/09/2026'),'2026-09-30');assert.equal(parseMoney('R$ 1.234,56'),1234.56);assert.equal(parseMoney('inválido'),null);assert.equal(categoryGroup('M.O.D - Facção'),'cpv');assert.equal(categoryGroup('Energia Elétrica'),'pending');});
test('each installment counts once, regardless of paid/open amounts',()=>{const result=summarizeDre(parse([row()]).entries,{},inputs,'2026-09');assert.equal(result.original,100);assert.equal(result.expenses,100);assert.equal(result.result,900);assert.equal(result.paid,100);});
test('competence determines period rather than due date',()=>{const result=summarizeDre(parse([row('Salários',100,'01/08/2026'),row('Salários',50)]).entries,{},inputs,'2026-09');assert.equal(result.count,1);assert.equal(result.expenses,50);});
test('unknown revenue and unrecognized inventory costs prevent fabricated profit',()=>{const entries=parse([row('Tecidos',400)]).entries;assert.equal(summarizeDre(entries,{},emptyDreInputs,'2026-09').result,null);assert.equal(summarizeDre(entries,{}, {...inputs,cpv:null},'2026-09').result,null);assert.equal(summarizeDre(entries,{}, {...inputs,cpv:250},'2026-09').result,750);});
test('unclassified entries block result, explicit mapping releases it',()=>{const entries=parse([row('Energia Elétrica',100)]).entries;assert.equal(summarizeDre(entries,{},inputs,'2026-09').result,null);assert.equal(summarizeDre(entries,{'Energia Elétrica':'admin'},inputs,'2026-09').result,900);});
test('patrimonial items remain outside profit while reconciling imported total',()=>{const result=summarizeDre(parse([row('Adiantamento Salarial',100),row('Salários',20)]).entries,{},inputs,'2026-09');assert.equal(result.original,120);assert.equal(result.totals.excluded,100);assert.equal(result.result,980);});
test('invalid rows are exposed and cancelled rows are skipped',()=>{const cancelled=row();cancelled[4]='Cancelado';const result=parse([row('Salários','erro'),cancelled]);assert.equal(result.errors.length,1);assert.equal(result.skipped,1);assert.equal(result.entries.length,0);});
test('multi-category allocations require review rather than double counting',()=>{const result=parseContaAzulRows([[...headers,'Categoria 2'],[...row(),'Marketing']]);assert.equal(result.errors.length,1);});
test('missing zero values stay unknown; explicit zero survives',()=>{const entries=parse([row('Salários',0)]).entries;assert.equal(summarizeDre(entries,{}, {...inputs,revenue:0},'2026-09').result,0);assert.equal(summarizeDre(entries,{}, {...inputs,revenue:0},'2026-09').margin,null);});
