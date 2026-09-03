'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Baby, Calculator, CircleDollarSign, Download, Info, Minus, Plus, RefreshCcw, Save, ShieldCheck, Trash2, Upload, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Delivery = 'vaginal' | 'cesarean';
type Feeding = 'breastfeeding' | 'mixed' | 'formula';
type ExpenseCategory = '備孕與產檢' | '生產與月中' | '媽媽用品' | '嬰兒用品' | '自費疫苗' | '每月耗材' | '托嬰' | '其他';
type ExpenseItem = { id: string; category: ExpenseCategory; name: string; amount: number; qty: number; unit: string };
type IncomeKind = 'mother' | 'father' | 'household' | 'leave' | 'one-time';
type IncomeItem = { id: string; name: string; amount: number; qty: number; unit: string; kind: IncomeKind };
type SubsidyItem = { id: string; name: string; amount: number; qty: number; unit: string; note: string };
type LivingExpenseItem = { id: string; name: string; amount: number };
type CashflowRow = { month: number; label: string; income: number; motherIncome: number; fatherIncome: number; otherIncome: number; livingExpense: number; babyExpense: number; support: number; withoutSupport: number; withSupport: number; balance: number };
type Settings = { delivery: Delivery; feeding: Feeding; postpartumDays: number; daycareStartAge: number; maternityLeaveWeeks: number; parentalLeaveMonths: number; currentSavings: number };
type ModelContextLike = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown | Promise<unknown> }, options?: { signal?: AbortSignal }) => void | Promise<void> };

const CATEGORIES: ExpenseCategory[] = ['備孕與產檢', '生產與月中', '媽媽用品', '嬰兒用品', '自費疫苗', '每月耗材', '托嬰', '其他'];
const PREBIRTH_MONTHS = 12;
const BABY_MONTHS = 24;
const TOTAL_MONTHS = PREBIRTH_MONTHS + BABY_MONTHS;
const STORAGE_KEY = 'little-days-budget-v2';
const SETTINGS_DEFAULT: Settings = { delivery: 'vaginal', feeding: 'mixed', postpartumDays: 25, daycareStartAge: 8, maternityLeaveWeeks: 8, parentalLeaveMonths: 6, currentSavings: 0 };
const LIVING_EXPENSE_DEFAULTS: LivingExpenseItem[] = [
  { id: 'housing', name: '房租／房貸', amount: 18000 },
  { id: 'food-living', name: '家庭餐飲', amount: 18000 },
  { id: 'transport', name: '交通', amount: 6000 },
  { id: 'utilities', name: '水電、網路與手機', amount: 4000 },
  { id: 'insurance-other', name: '保險與其他生活支出', amount: 14000 },
];
const EXPENSE_DEFAULTS: ExpenseItem[] = [
  { id: 'preconception', category: '備孕與產檢', name: '備孕營養品與排卵用品', amount: 4000, qty: 1, unit: '組' },
  { id: 'prenatal', category: '備孕與產檢', name: '完整產檢與自費檢查', amount: 26000, qty: 1, unit: '胎' },
  { id: 'delivery', category: '生產與月中', name: '自然產住院與自費項目', amount: 15000, qty: 1, unit: '次' },
  { id: 'postpartum', category: '生產與月中', name: '月子中心', amount: 7000, qty: 25, unit: '天' },
  { id: 'postpartum-extra', category: '生產與月中', name: '月中雜費與交通', amount: 3000, qty: 1, unit: '筆' },
  { id: 'mother', category: '媽媽用品', name: '孕期與產後媽媽用品', amount: 9500, qty: 1, unit: '組' },
  { id: 'car-seat', category: '嬰兒用品', name: '汽車安全座椅', amount: 6000, qty: 1, unit: '張' },
  { id: 'stroller', category: '嬰兒用品', name: '嬰兒推車', amount: 7000, qty: 1, unit: '台' },
  { id: 'crib', category: '嬰兒用品', name: '嬰兒床與床墊', amount: 5000, qty: 1, unit: '組' },
  { id: 'feeding-gear', category: '嬰兒用品', name: '奶瓶、消毒與餵養用品', amount: 3000, qty: 1, unit: '組' },
  { id: 'clothes', category: '嬰兒用品', name: '衣物、包巾與日用品', amount: 3500, qty: 1, unit: '組' },
  { id: 'breastfeeding-gear', category: '嬰兒用品', name: '哺乳用品', amount: 2000, qty: 1, unit: '組' },
  { id: 'rotavirus', category: '自費疫苗', name: '口服輪狀病毒疫苗', amount: 4500, qty: 1, unit: '套' },
  { id: 'menb', category: '自費疫苗', name: 'B 型腦膜炎雙球菌疫苗', amount: 12000, qty: 1, unit: '套' },
  { id: 'other-vaccine', category: '自費疫苗', name: '其他自費疫苗預留', amount: 2000, qty: 1, unit: '筆' },
  { id: 'formula', category: '每月耗材', name: '母乳／配方奶支出', amount: 2000, qty: 24, unit: '月' },
  { id: 'diapers', category: '每月耗材', name: '尿布', amount: 1800, qty: 24, unit: '月' },
  { id: 'wipes', category: '每月耗材', name: '濕紙巾與清潔耗材', amount: 800, qty: 24, unit: '月' },
  { id: 'care', category: '每月耗材', name: '洗沐與護理用品', amount: 500, qty: 24, unit: '月' },
  { id: 'medical', category: '每月耗材', name: '看診與藥品預留', amount: 500, qty: 24, unit: '月' },
  { id: 'food', category: '每月耗材', name: '副食品', amount: 1500, qty: 18, unit: '月' },
  { id: 'daycare', category: '托嬰', name: '準公共托嬰牌價', amount: 20000, qty: 16, unit: '月' },
  { id: 'reserve', category: '其他', name: '臨時支出預備金', amount: 10000, qty: 1, unit: '筆' },
];
const INCOME_DEFAULTS: IncomeItem[] = [
  { id: 'mother-salary', name: '媽媽工作收入', amount: 45000, qty: 1, unit: '每月', kind: 'mother' },
  { id: 'father-salary', name: '爸爸工作收入', amount: 55000, qty: 1, unit: '每月', kind: 'father' },
  { id: 'leave-benefit', name: '育嬰留停津貼', amount: 36640, qty: 6, unit: '月', kind: 'leave' },
];
const SUBSIDY_DEFAULTS: SubsidyItem[] = [
  { id: 'national-birth', name: '勞工生育給付與中央加給', amount: 100000, qty: 1, unit: '次', note: '資格與金額以主管機關核定為準' },
  { id: 'taichung-birth', name: '臺中市生育津貼', amount: 20000, qty: 1, unit: '次', note: '須符合設籍等條件' },
  { id: 'childcare', name: '育兒津貼', amount: 5000, qty: 8, unit: '月', note: '送公共／準公共托育前的預設月數' },
  { id: 'daycare-support', name: '準公共托育補助', amount: 13000, qty: 16, unit: '月', note: '第一胎預設，實際依托育資格' },
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const money = (value: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(Math.round(value));
const compactMoney = (value: number) => Math.abs(value) >= 10000 ? `${value < 0 ? '-' : ''}${(Math.abs(value) / 10000).toFixed(1)}萬` : Math.round(value).toLocaleString('zh-TW');
const categoryColors = ['#c86a4b', '#e2a85e', '#2f6f6b', '#73958b', '#516b83', '#9a7a69', '#be8f63', '#75807f'];
const chartConfig = { value: { label: '金額', color: '#c86a4b' } } satisfies ChartConfig;
const cashflowConfig = {
  withSupport: { label: '含補助淨現金流', color: '#2f6f6b' },
  withoutSupport: { label: '未計補助淨現金流', color: '#c86a4b' },
} satisfies ChartConfig;

type WorkbookSheet = { name: string; rows: Array<Array<string | number>> };
const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const columnName = (index: number) => { let value = index + 1; let name = ''; while (value > 0) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); } return name; };
const crcTable = Array.from({ length: 256 }, (_, index) => { let crc = index; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0; });
const crc32 = (bytes: Uint8Array) => { let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const concatBytes = (chunks: Uint8Array[]) => { const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output; };
const zipStore = (entries: Array<{ name: string; data: string }>) => {
  const encoder = new TextEncoder(); const files: Uint8Array[] = []; const directory: Uint8Array[] = []; let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const data = encoder.encode(entry.data); const crc = crc32(data);
    const local = new Uint8Array(30 + name.length); const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length); const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(8, 0x0800, true); centralView.setUint32(16, crc, true); centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true); central.set(name, 46);
    files.push(local, data); directory.push(central); offset += local.length + data.length;
  }
  const directoryBytes = concatBytes(directory); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, directoryBytes.length, true); endView.setUint32(16, offset, true);
  return concatBytes([...files, directoryBytes, end]);
};
const downloadWorkbook = (sheets: WorkbookSheet[]) => {
  const worksheetXml = (rows: WorkbookSheet['rows']) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => { const reference = `${columnName(columnIndex)}${rowIndex + 1}`; return typeof cell === 'number' ? `<c r="${reference}" s="${rowIndex === 0 ? 1 : 2}"><v>${cell}</v></c>` : `<c r="${reference}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t>${xmlEscape(cell)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#\,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC86A4B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="1" applyFont="1" applyFill="1"/><xf xfId="0" numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const entries = [{ name: '[Content_Types].xml', data: contentTypes }, { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` }, { name: 'xl/workbook.xml', data: workbook }, { name: 'xl/_rels/workbook.xml.rels', data: workbookRels }, { name: 'xl/styles.xml', data: styles }, ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: worksheetXml(sheet.rows) }))];
  const bytes = zipStore(entries); const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '小日子育兒預算_備孕至兩歲.xlsx'; anchor.click(); URL.revokeObjectURL(url);
};
const readXlsxEntries = async (file: File) => {
  const buffer = await file.arrayBuffer(); const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const decoder = new TextDecoder();
  let endOffset = -1; for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) { if (view.getUint32(offset, true) === 0x06054b50) { endOffset = offset; break; } }
  if (endOffset < 0) throw new Error('找不到 Excel 檔案目錄');
  const count = view.getUint16(endOffset + 10, true); let centralOffset = view.getUint32(endOffset + 16, true); const output = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) throw new Error('Excel 檔案目錄損壞');
    const method = view.getUint16(centralOffset + 10, true); const compressedSize = view.getUint32(centralOffset + 20, true); const nameLength = view.getUint16(centralOffset + 28, true); const extraLength = view.getUint16(centralOffset + 30, true); const commentLength = view.getUint16(centralOffset + 32, true); const localOffset = view.getUint32(centralOffset + 42, true); const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true); const dataStart = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(dataStart, dataStart + compressedSize); let data: Uint8Array;
    if (method === 0) data = compressed; else if (method === 8) { const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')); data = new Uint8Array(await new Response(stream).arrayBuffer()); } else throw new Error('不支援此 Excel 壓縮格式');
    if (!name.endsWith('/')) output.set(name.replace(/^\//, ''), decoder.decode(data)); centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return output;
};
const parseWorksheet = (xml: string, sharedStrings: string[]) => {
  const documentXml = new DOMParser().parseFromString(xml, 'application/xml'); if (documentXml.querySelector('parsererror')) throw new Error('工作表內容無法解析');
  return Array.from(documentXml.getElementsByTagName('row')).map((row) => {
    const values: Array<string | number> = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const reference = cell.getAttribute('r') ?? 'A1'; const letters = reference.match(/[A-Z]+/)?.[0] ?? 'A'; let column = 0; for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64; column -= 1;
      const type = cell.getAttribute('t'); const raw = cell.getElementsByTagName('v')[0]?.textContent ?? ''; let value: string | number;
      if (type === 'inlineStr') value = Array.from(cell.getElementsByTagName('t')).map((node) => node.textContent ?? '').join(''); else if (type === 's') value = sharedStrings[Number(raw)] ?? ''; else if (type === 'str') value = raw; else value = raw === '' ? '' : Number(raw);
      values[column] = value;
    }
    return Array.from({ length: values.length }, (_, index) => values[index] ?? '');
  });
};
const readWorkbook = async (file: File) => {
  const entries = await readXlsxEntries(file); const parser = new DOMParser(); const workbookXml = entries.get('xl/workbook.xml'); const relsXml = entries.get('xl/_rels/workbook.xml.rels'); if (!workbookXml || !relsXml) throw new Error('缺少 Excel 活頁簿資料');
  const sharedXml = entries.get('xl/sharedStrings.xml'); const sharedStrings = sharedXml ? Array.from(parser.parseFromString(sharedXml, 'application/xml').getElementsByTagName('si')).map((item) => Array.from(item.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')) : [];
  const relationships = new Map(Array.from(parser.parseFromString(relsXml, 'application/xml').getElementsByTagName('Relationship')).map((item) => [item.getAttribute('Id') ?? '', item.getAttribute('Target') ?? '']));
  const sheets = new Map<string, Array<Array<string | number>>>();
  for (const sheet of Array.from(parser.parseFromString(workbookXml, 'application/xml').getElementsByTagName('sheet'))) { const name = sheet.getAttribute('name') ?? ''; const id = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? ''; const target = relationships.get(id); if (!target) continue; const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`; const xml = entries.get(path); if (xml) sheets.set(name, parseWorksheet(xml, sharedStrings)); }
  return sheets;
};

function NumericInput({ value, onChange, ariaLabel }: { value: number; onChange: (value: number) => void; ariaLabel: string }) {
  return <Input aria-label={ariaLabel} type="number" min={0} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-10 rounded-xl border-[var(--line)] bg-white text-right tabular-nums" />;
}

function RangeField({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="grid gap-2.5"><span className="flex items-center justify-between text-sm font-medium"><span>{label}</span><strong className="font-heading text-xl text-[var(--terracotta)]">{value} {suffix}</strong></span><input className="budget-range" type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><span className="flex justify-between text-xs text-muted-foreground"><span>{min}</span><span>{max} {suffix}</span></span></label>;
}
function EmptyRow({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-6 text-center text-sm text-muted-foreground">{children}</div>; }

export default function Home() {
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULT);
  const [livingExpenses, setLivingExpenses] = useState<LivingExpenseItem[]>(() => clone(LIVING_EXPENSE_DEFAULTS));
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => clone(EXPENSE_DEFAULTS));
  const [incomes, setIncomes] = useState<IncomeItem[]>(() => clone(INCOME_DEFAULTS));
  const [subsidies, setSubsidies] = useState<SubsidyItem[]>(() => clone(SUBSIDY_DEFAULTS));
  const [activeTab, setActiveTab] = useState('overview');
  const [saveMessage, setSaveMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
      const saved = JSON.parse(raw) as { settings?: Settings; livingExpenses?: LivingExpenseItem[]; expenses?: ExpenseItem[]; incomes?: IncomeItem[]; subsidies?: SubsidyItem[] };
      if (saved.settings) setSettings(saved.settings); if (Array.isArray(saved.livingExpenses)) setLivingExpenses(saved.livingExpenses); if (Array.isArray(saved.expenses)) setExpenses(saved.expenses); if (Array.isArray(saved.incomes)) setIncomes(saved.incomes); if (Array.isArray(saved.subsidies)) setSubsidies(saved.subsidies);
      setSaveMessage('已載入上次儲存');
    } catch { setSaveMessage('儲存資料無法讀取'); }
  }, []);
  const updateExpense = (id: string, patch: Partial<ExpenseItem>) => setExpenses((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateLivingExpense = (id: string, patch: Partial<LivingExpenseItem>) => setLivingExpenses((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateIncome = (id: string, patch: Partial<IncomeItem>) => setIncomes((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateSubsidy = (id: string, patch: Partial<SubsidyItem>) => setSubsidies((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const saveData = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, livingExpenses, expenses, incomes, subsidies })); setSaveMessage('已儲存於這個瀏覽器'); };
  const importExcel = async (file: File) => {
    try {
      setSaveMessage('正在匯入…'); const workbook = await readWorkbook(file); const settingsRows = workbook.get('設定'); const livingRows = workbook.get('生活支出'); const expenseRows = workbook.get('育兒支出'); const incomeRows = workbook.get('收入'); const subsidyRows = workbook.get('補助');
      if (!livingRows || !expenseRows || !incomeRows || !subsidyRows) throw new Error('請選擇由本工具匯出的 Excel 檔案');
      const numberValue = (value: string | number | undefined) => Math.max(0, Number(value) || 0); const textValue = (value: string | number | undefined) => String(value ?? '').trim();
      const table = (rows: Array<Array<string | number>>) => { const headers = rows[0]?.map(textValue) ?? []; return rows.slice(1).map((row) => (label: string) => row[headers.indexOf(label)]); };
      const settingValues = new Map((settingsRows ?? []).slice(1).map((row) => [textValue(row[0]), row[1]]));
      const deliveryValue = textValue(settingValues.get('生產方式')); const feedingValue = textValue(settingValues.get('餵養方式'));
      const importedSettings: Settings = { delivery: (['vaginal', 'cesarean'].includes(deliveryValue) ? deliveryValue : settings.delivery) as Delivery, feeding: (['breastfeeding', 'mixed', 'formula'].includes(feedingValue) ? feedingValue : settings.feeding) as Feeding, postpartumDays: numberValue(settingValues.get('月子中心天數') ?? settings.postpartumDays), daycareStartAge: numberValue(settingValues.get('托嬰開始月齡') ?? settings.daycareStartAge), maternityLeaveWeeks: numberValue(settingValues.get('媽媽產假星期') ?? settings.maternityLeaveWeeks), parentalLeaveMonths: numberValue(settingValues.get('媽媽育嬰留停月數') ?? settings.parentalLeaveMonths), currentSavings: numberValue(settingValues.get('目前已有存款') ?? settings.currentSavings) };
      const importedLiving = table(livingRows).filter((get) => textValue(get('項目')) && textValue(get('項目')) !== '合計').map((get) => ({ id: textValue(get('識別碼（請勿修改）')) || newId('living'), name: textValue(get('項目')), amount: numberValue(get('每月金額')) }));
      const importedExpenses = table(expenseRows).filter((get) => textValue(get('項目'))).map((get) => ({ id: textValue(get('識別碼（請勿修改）')) || newId('expense'), category: (CATEGORIES.includes(textValue(get('分類')) as ExpenseCategory) ? textValue(get('分類')) : '其他') as ExpenseCategory, name: textValue(get('項目')), amount: numberValue(get('單價')), qty: numberValue(get('數量')), unit: textValue(get('單位')) || '筆' }));
      const importedIncomes = table(incomeRows).filter((get) => textValue(get('項目'))).map((get) => { const kind = textValue(get('類型')); return { id: textValue(get('識別碼（請勿修改）')) || newId('income'), kind: (['mother', 'father', 'household', 'leave', 'one-time'].includes(kind) ? kind : 'household') as IncomeKind, name: textValue(get('項目')), amount: numberValue(get('每月／單次金額')), qty: kind === 'leave' || kind === 'one-time' ? numberValue(get('計算月數／次數')) : 1, unit: textValue(get('單位')) || '每月' }; });
      const importedSubsidies = table(subsidyRows).filter((get) => textValue(get('項目')) && textValue(get('項目')) !== '合計').map((get) => ({ id: textValue(get('識別碼（請勿修改）')) || newId('support'), name: textValue(get('項目')), amount: numberValue(get('金額')), qty: numberValue(get('數量')), unit: textValue(get('單位')) || '次', note: textValue(get('備註')) }));
      if (!importedLiving.length && !importedExpenses.length && !importedIncomes.length && !importedSubsidies.length) throw new Error('Excel 中沒有可匯入的資料');
      setSettings(importedSettings); setLivingExpenses(importedLiving); setExpenses(importedExpenses); setIncomes(importedIncomes); setSubsidies(importedSubsidies); localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: importedSettings, livingExpenses: importedLiving, expenses: importedExpenses, incomes: importedIncomes, subsidies: importedSubsidies })); setSaveMessage('Excel 已匯入並儲存'); setActiveTab('overview');
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : 'Excel 匯入失敗'); }
  };
  const reset = () => { setSettings(SETTINGS_DEFAULT); setLivingExpenses(clone(LIVING_EXPENSE_DEFAULTS)); setExpenses(clone(EXPENSE_DEFAULTS)); setIncomes(clone(INCOME_DEFAULTS)); setSubsidies(clone(SUBSIDY_DEFAULTS)); localStorage.removeItem(STORAGE_KEY); setSaveMessage('已恢復預設值'); };
  const setDelivery = (delivery: Delivery) => { setSettings((current) => ({ ...current, delivery })); updateExpense('delivery', delivery === 'vaginal' ? { name: '自然產住院與自費項目', amount: 15000 } : { name: '剖腹產住院與自費項目', amount: 35000 }); };
  const setFeeding = (feeding: Feeding) => { setSettings((current) => ({ ...current, feeding })); updateExpense('formula', { amount: feeding === 'breastfeeding' ? 500 : feeding === 'mixed' ? 2000 : 3500 }); updateExpense('breastfeeding-gear', { amount: feeding === 'formula' ? 0 : 2000 }); };
  const setPostpartumDays = (postpartumDays: number) => { setSettings((current) => ({ ...current, postpartumDays })); updateExpense('postpartum', { qty: postpartumDays }); };
  const setDaycareStartAge = (daycareStartAge: number) => { setSettings((current) => ({ ...current, daycareStartAge })); const months = Math.max(0, BABY_MONTHS - daycareStartAge); updateExpense('daycare', { qty: months }); updateSubsidy('childcare', { qty: Math.min(BABY_MONTHS, daycareStartAge) }); updateSubsidy('daycare-support', { qty: months }); };
  const setMaternityLeaveWeeks = (maternityLeaveWeeks: number) => setSettings((current) => ({ ...current, maternityLeaveWeeks }));
  const setLeaveMonths = (parentalLeaveMonths: number) => { setSettings((current) => ({ ...current, parentalLeaveMonths })); updateIncome('leave-benefit', { qty: Math.min(parentalLeaveMonths, 6) }); };

  const result = useMemo(() => {
    const parentalLeaveStartMonth = Math.ceil(settings.maternityLeaveWeeks / 4);
    const parentalLeaveMonthsInRange = Math.min(settings.parentalLeaveMonths, Math.max(0, BABY_MONTHS - parentalLeaveStartMonth));
    const babyCost = expenses.reduce((sum, item) => sum + item.amount * item.qty, 0);
    const monthlyLivingExpense = livingExpenses.reduce((sum, item) => sum + item.amount, 0);
    const livingCost = monthlyLivingExpense * TOTAL_MONTHS;
    const grossCost = babyCost + livingCost;
    const totalSupport = subsidies.reduce((sum, item) => sum + item.amount * item.qty, 0);
    const motherSalary = incomes.find((item) => item.kind === 'mother')?.amount ?? 0;
    const leaveIncome = incomes.filter((item) => item.kind === 'leave').reduce((sum, item) => sum + item.amount * Math.min(item.qty, parentalLeaveMonthsInRange), 0);
    const incomeLoss = Math.max(0, motherSalary * parentalLeaveMonthsInRange - leaveIncome);
    const monthlyIncome = incomes.filter((item) => item.kind === 'mother' || item.kind === 'father' || item.kind === 'household').reduce((sum, item) => sum + item.amount, 0);
    const plannedIncome = incomes.reduce((sum, item) => sum + item.amount * item.qty, 0);
    const impact = grossCost + incomeLoss;
    const afterSupport = impact - totalSupport;
    const categoryData = [{ name: '生活支出', value: livingCost }, ...CATEGORIES.map((category) => ({ name: category, value: expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount * item.qty, 0) }))].filter((item) => item.value > 0);
    const oneTimeMonth = (item: ExpenseItem) => {
      if (item.id === 'preconception') return -12;
      if (item.category === '備孕與產檢') return -8;
      if (item.category === '媽媽用品') return -3;
      if (item.id === 'rotavirus') return 2;
      if (item.id === 'menb') return 6;
      if (item.category === '自費疫苗') return 9;
      if (item.category === '嬰兒用品') return -1;
      return 0;
    };
    let runningBalance = settings.currentSavings;
    const cashflow = Array.from({ length: TOTAL_MONTHS }, (_, index) => {
      const month = index - PREBIRTH_MONTHS;
      const babyExpense = expenses.reduce((sum, item) => {
        if (item.category === '每月耗材') {
          const start = item.id === 'food' ? 6 : 0;
          return sum + (month >= start && month < start + item.qty ? item.amount : 0);
        }
        if (item.category === '托嬰') return sum + (month >= settings.daycareStartAge && month < settings.daycareStartAge + item.qty ? item.amount : 0);
        return sum + (month === oneTimeMonth(item) ? item.amount * item.qty : 0);
      }, 0);
      const incomeParts = incomes.reduce((parts, item) => {
        if (item.kind === 'mother') {
          const onLeave = month >= parentalLeaveStartMonth && month < parentalLeaveStartMonth + parentalLeaveMonthsInRange;
          parts.mother += onLeave ? 0 : item.amount;
        } else if (item.kind === 'father') parts.father += item.amount;
        else if (item.kind === 'household') parts.other += item.amount;
        else if (item.kind === 'leave') parts.mother += month >= parentalLeaveStartMonth && month < parentalLeaveStartMonth + Math.min(item.qty, parentalLeaveMonthsInRange) ? item.amount : 0;
        else parts.other += month === 0 ? item.amount * item.qty : 0;
        return parts;
      }, { mother: 0, father: 0, other: 0 });
      const income = incomeParts.mother + incomeParts.father + incomeParts.other;
      const support = subsidies.reduce((sum, item) => {
        if (item.unit !== '月') return sum + (month === 0 ? item.amount * item.qty : 0);
        const start = item.id === 'daycare-support' ? settings.daycareStartAge : 0;
        return sum + (month >= start && month < start + item.qty ? item.amount : 0);
      }, 0);
      const livingExpense = monthlyLivingExpense;
      const withoutSupport = income - livingExpense - babyExpense;
      const withSupport = withoutSupport + support;
      runningBalance += withSupport;
      return { month, label: month === -12 ? '備孕' : month < 0 ? `產前${Math.abs(month)}` : month === 0 ? '出生' : month === BABY_MONTHS - 1 ? '23月（至2歲）' : `${month}月`, income, motherIncome: incomeParts.mother, fatherIncome: incomeParts.father, otherIncome: incomeParts.other, livingExpense, babyExpense, support, withoutSupport, withSupport, balance: runningBalance };
    });
    const endingSavings = cashflow.at(-1)?.balance ?? settings.currentSavings;
    const motherIncomeTotal = cashflow.reduce((sum, row) => sum + row.motherIncome, 0);
    const fatherIncomeTotal = cashflow.reduce((sum, row) => sum + row.fatherIncome, 0);
    const otherIncomeTotal = cashflow.reduce((sum, row) => sum + row.otherIncome, 0);
    const totalIncome = motherIncomeTotal + fatherIncomeTotal + otherIncomeTotal;
    return { grossCost, babyCost, livingCost, monthlyLivingExpense, totalSupport, incomeLoss, monthlyIncome, plannedIncome, impact, afterSupport, categoryData, cashflow, endingSavings, motherIncomeTotal, fatherIncomeTotal, otherIncomeTotal, totalIncome, parentalLeaveStartMonth, parentalLeaveMonthsInRange };
  }, [expenses, incomes, livingExpenses, settings.currentSavings, settings.daycareStartAge, settings.maternityLeaveWeeks, settings.parentalLeaveMonths, subsidies]);

  const exportExcel = () => {
    const incomeMonths = (item: IncomeItem) => item.kind === 'mother' ? TOTAL_MONTHS - result.parentalLeaveMonthsInRange : item.kind === 'father' || item.kind === 'household' ? TOTAL_MONTHS : item.kind === 'leave' ? Math.min(item.qty, result.parentalLeaveMonthsInRange) : item.qty;
    downloadWorkbook([
      { name: '摘要', rows: [['項目', '金額'], ['預估花費總額', result.grossCost], ['生活支出總額', result.livingCost], ['育兒支出總額', result.babyCost], ['家庭每月收入', result.monthlyIncome], ['收入損失', result.incomeLoss], ['補助合計', result.totalSupport], ['補助後參考', result.afterSupport], ['家庭整體財務影響', result.impact], ['目前已有存款', settings.currentSavings], ['寶寶兩歲時預估存款', result.endingSavings]] },
      { name: '設定', rows: [['設定項目', '設定值'], ['生產方式', settings.delivery], ['餵養方式', settings.feeding], ['月子中心天數', settings.postpartumDays], ['托嬰開始月齡', settings.daycareStartAge], ['媽媽產假星期', settings.maternityLeaveWeeks], ['媽媽育嬰留停月數', settings.parentalLeaveMonths], ['目前已有存款', settings.currentSavings]] },
      { name: '生活支出', rows: [['識別碼（請勿修改）', '項目', '每月金額', '計算月數', '期間總額'], ...livingExpenses.map((item) => [item.id, item.name, item.amount, TOTAL_MONTHS, item.amount * TOTAL_MONTHS]), ['', '合計', result.monthlyLivingExpense, TOTAL_MONTHS, result.livingCost]] },
      { name: '育兒支出', rows: [['識別碼（請勿修改）', '分類', '項目', '單價', '數量', '單位', '小計'], ...expenses.map((item) => [item.id, item.category, item.name, item.amount, item.qty, item.unit, item.amount * item.qty]), ['', '合計', '', '', '', '', result.babyCost]] },
      { name: '收入', rows: [['識別碼（請勿修改）', '類型', '項目', '每月／單次金額', '計算月數／次數', '單位', '合計'], ...incomes.map((item) => [item.id, item.kind, item.name, item.amount, incomeMonths(item), item.unit, item.amount * incomeMonths(item)]), ['', '媽媽期間收入總計', '', '', '', '', result.motherIncomeTotal], ['', '爸爸期間收入總計', '', '', '', '', result.fatherIncomeTotal], ['', '全部收入總計', '', '', '', '', result.totalIncome]] },
      { name: '補助', rows: [['識別碼（請勿修改）', '項目', '金額', '數量', '單位', '備註', '合計'], ...subsidies.map((item) => [item.id, item.name, item.amount, item.qty, item.unit, item.note, item.amount * item.qty]), ['', '合計', '', '', '', '', result.totalSupport]] },
      { name: '每月現金流', rows: [['月份', '收入', '生活支出', '育兒支出', '補助', '未計補助淨現金流', '含補助淨現金流', '期末存款'], ...result.cashflow.map((row) => [row.label, row.income, row.livingExpense, row.babyExpense, row.support, row.withoutSupport, row.withSupport, row.balance])] },
    ]);
  };

  const resultRef = useRef(result); resultRef.current = result;
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({ name: 'add_budget_expense', title: '新增育兒支出', description: '在目前估算中新增一筆可編輯的支出明細。', inputSchema: { type: 'object', additionalProperties: false, required: ['name', 'amount'], properties: { name: { type: 'string', minLength: 1 }, amount: { type: 'number', minimum: 0 }, quantity: { type: 'number', minimum: 0 }, category: { type: 'string', enum: CATEGORIES } } }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(raw) { const value = raw as { name?: unknown; amount?: unknown; quantity?: unknown; category?: unknown }; if (typeof value?.name !== 'string' || !value.name.trim() || typeof value.amount !== 'number' || value.amount < 0) throw new Error('名稱或金額無效'); const category = CATEGORIES.includes(value.category as ExpenseCategory) ? value.category as ExpenseCategory : '其他'; const item: ExpenseItem = { id: newId('expense'), category, name: value.name.trim(), amount: value.amount, qty: typeof value.quantity === 'number' ? Math.max(0, value.quantity) : 1, unit: '筆' }; setExpenses((items) => [...items, item]); return { added: true, id: item.id, itemTotal: item.amount * item.qty }; } }, { signal: lifecycle.signal });
      await context.registerTool({ name: 'read_estimate_summary', title: '讀取育兒估算摘要', description: '讀取目前畫面中的支出、父母收入、補助、家庭財務影響與兩歲時預估存款。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute() { const current = resultRef.current; return { grossCost: Math.round(current.grossCost), motherIncomeTotal: Math.round(current.motherIncomeTotal), fatherIncomeTotal: Math.round(current.fatherIncomeTotal), totalIncome: Math.round(current.totalIncome), incomeLoss: Math.round(current.incomeLoss), support: Math.round(current.totalSupport), financialImpact: Math.round(current.impact), afterSupportReference: Math.round(current.afterSupport), savingsAtAgeTwo: Math.round(current.endingSavings) }; } }, { signal: lifecycle.signal });
    };
    void register().catch(() => lifecycle.abort()); return () => lifecycle.abort();
  }, []);

  return <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
    <header className="border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--paper),white_30%)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[var(--terracotta)] text-white shadow-sm"><Baby className="size-5" /></span><div><p className="font-heading text-lg font-semibold">小日子育兒預算</p><p className="text-xs text-muted-foreground">台灣備孕到寶寶兩歲</p></div></div>
        <div className="flex flex-wrap items-center justify-end gap-2"><span className="mr-1 text-xs text-muted-foreground" aria-live="polite">{saveMessage}</span><Button variant="outline" onClick={saveData} className="rounded-xl"><Save className="size-4" />儲存</Button><input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="匯入 Excel" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importExcel(file); event.target.value = ''; }} /><Button variant="outline" onClick={() => fileInputRef.current?.click()} className="rounded-xl"><Upload className="size-4" />匯入 Excel</Button><Button onClick={exportExcel} className="rounded-xl bg-[var(--teal)] text-white hover:bg-[var(--teal)]/90"><Download className="size-4" />匯出 Excel</Button><Button variant="ghost" onClick={reset} className="rounded-xl text-[var(--ink-soft)]"><RefreshCcw className="size-4" />重設</Button></div>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-7 sm:px-6 lg:px-8">
      <section className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">每一筆，都能調成你家的版本</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-soft)] sm:text-base">資料可儲存在此瀏覽器，也能匯出成 Excel 留存。</p></div><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-[var(--teal)]" />規劃估算，不構成補助資格判定</p></section>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <div className="overflow-x-auto pb-1"><TabsList className="h-11 min-w-[520px] rounded-2xl bg-white p-1 shadow-sm ring-1 ring-[var(--line)]"><TabsTrigger value="overview" className="rounded-xl px-5">總覽</TabsTrigger><TabsTrigger value="expenses" className="rounded-xl px-5">支出明細</TabsTrigger><TabsTrigger value="income" className="rounded-xl px-5">收入明細</TabsTrigger><TabsTrigger value="subsidies" className="rounded-xl px-5">補助明細</TabsTrigger></TabsList></div>
        <TabsContent value="overview" className="grid gap-8">
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid min-w-0 gap-5">
              <Card className="rounded-[28px] border-0 bg-white/90 py-0 shadow-[0_16px_50px_rgba(71,54,44,.08)] ring-1 ring-[var(--line)]"><CardHeader className="border-b border-[var(--line)] px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--sand)] text-[var(--terracotta)]"><Calculator className="size-4.5" /></span><div><CardTitle className="font-heading text-lg font-semibold">會連動明細的選擇</CardTitle><CardDescription>滑桿可拖曳，也可用方向鍵微調</CardDescription></div></div></CardHeader><CardContent className="grid gap-6 px-5 py-6 sm:px-6"><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">生產方式<Select value={settings.delivery} onValueChange={(value) => setDelivery(value as Delivery)}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vaginal">自然產</SelectItem><SelectItem value="cesarean">剖腹產</SelectItem></SelectContent></Select></label><label className="grid gap-1.5 text-sm font-medium">餵養方式<Select value={settings.feeding} onValueChange={(value) => setFeeding(value as Feeding)}><SelectTrigger className="h-11 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="breastfeeding">親餵</SelectItem><SelectItem value="mixed">混合餵養</SelectItem><SelectItem value="formula">配方奶</SelectItem></SelectContent></Select></label></div><div className="grid gap-6 rounded-2xl bg-[var(--cream)] p-4 sm:grid-cols-2"><RangeField label="月子中心天數" value={settings.postpartumDays} min={0} max={40} suffix="天" onChange={setPostpartumDays} /><RangeField label="托嬰開始月齡" value={settings.daycareStartAge} min={0} max={24} suffix="個月" onChange={setDaycareStartAge} /><RangeField label="媽媽產假" value={settings.maternityLeaveWeeks} min={0} max={12} suffix="星期" onChange={setMaternityLeaveWeeks} /><RangeField label="媽媽育嬰留職停薪" value={settings.parentalLeaveMonths} min={0} max={12} suffix="個月" onChange={setLeaveMonths} /><button type="button" onClick={() => setActiveTab('expenses')} className="rounded-2xl bg-white p-4 text-left ring-1 ring-[var(--line)] transition hover:ring-[var(--terracotta)]"><span className="block text-xs text-muted-foreground">每月生活支出合計</span><strong className="mt-1 block font-heading text-xl text-[var(--teal)]">{money(result.monthlyLivingExpense)}</strong><span className="mt-1 block text-xs text-[var(--terracotta-deep)]">前往支出明細調整 →</span></button></div><div className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center"><div><span className="block text-xs text-muted-foreground">第一段｜產假</span><strong className="mt-1 block text-[var(--teal)]">{settings.maternityLeaveWeeks} 星期・薪資照常計入</strong><span className="mt-1 block text-[11px] text-muted-foreground">預設為任職滿 6 個月的情況</span></div><span className="hidden text-muted-foreground sm:block">→</span><div><span className="block text-xs text-muted-foreground">第二段｜育嬰留職停薪</span><strong className="mt-1 block text-[var(--terracotta-deep)]">產假結束後 {settings.parentalLeaveMonths} 個月・公司薪資暫停</strong><span className="mt-1 block text-[11px] text-muted-foreground">育嬰留停津貼另列在收入明細</span></div></div></CardContent></Card>
              <Card className="rounded-[24px] border-0 bg-[var(--sage-wash)] py-0 ring-1 ring-[color-mix(in_srgb,var(--teal)_20%,transparent)]"><CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_250px] sm:items-center"><div><p className="font-heading text-lg font-semibold">目前已有存款</p><p className="mt-1 text-sm text-[var(--ink-soft)]">視為備孕開始時可使用的家庭資金，會加入逐月現金流計算。</p></div><div className="grid gap-2"><NumericInput value={settings.currentSavings} onChange={(currentSavings) => setSettings((current) => ({ ...current, currentSavings }))} ariaLabel="目前已有存款" /><p className="text-xs text-[var(--ink-soft)]">寶寶兩歲時預估{result.endingSavings >= 0 ? '剩餘' : '缺口'}</p><output aria-live="polite" className={`font-heading text-2xl font-semibold tabular-nums ${result.endingSavings >= 0 ? 'text-[var(--teal)]' : 'text-[var(--terracotta-deep)]'}`}>{money(Math.abs(result.endingSavings))}</output></div></CardContent></Card>
            </div>
            <aside className="grid min-w-0 gap-5 xl:sticky xl:top-5"><Card className="relative min-w-0 overflow-hidden rounded-[30px] border-0 bg-[var(--ink)] py-0 text-white shadow-[0_28px_70px_rgba(35,46,52,.24)]"><div className="absolute -right-16 -top-16 size-48 rounded-full bg-[var(--terracotta)]/20 blur-2xl" /><CardContent className="relative px-6 py-7 sm:px-8 sm:py-8"><div className="flex items-center gap-2 text-sm font-medium text-white/70"><CircleDollarSign className="size-4" />預估花費總額</div><output aria-live="polite" className="mt-3 block break-words font-heading text-[clamp(2.8rem,7vw,5rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--peach)] tabular-nums">{money(result.grossCost)}</output><p className="mt-3 text-sm leading-6 text-white/65">生活支出 36 個月＋育兒支出，補助不直接扣除。</p></CardContent></Card><div className="grid min-w-0 grid-cols-2 gap-3"><SummaryMini label="家庭每月收入" value={result.monthlyIncome} /><SummaryMini label="收入損失" value={result.incomeLoss} warm /><SummaryMini label="補助合計" value={result.totalSupport} /><SummaryMini label="補助後參考" value={result.afterSupport} warm /></div><Card className="rounded-[24px] border-0 bg-[var(--peach-wash)] py-0 ring-1 ring-[var(--peach-line)]"><CardContent className="flex items-start gap-3 px-5 py-4"><Info className="mt-0.5 size-4.5 shrink-0 text-[var(--terracotta)]" /><div><p className="text-sm font-semibold">家庭整體財務影響 {money(result.impact)}</p><p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">總支出加上育嬰留停收入損失；補助另列、不直接折抵。</p></div></CardContent></Card></aside>
          </div>
          <Card className="rounded-[28px] border-0 bg-white/90 py-0 shadow-[0_16px_50px_rgba(71,54,44,.06)] ring-1 ring-[var(--line)]"><CardHeader className="px-5 pb-2 pt-5 sm:px-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[var(--peach-wash)] text-[var(--terracotta)]"><WalletCards className="size-4.5" /></span><div><CardTitle className="font-heading text-lg font-semibold">支出分類</CardTitle><CardDescription>生活支出與各類育兒支出的期間總額</CardDescription></div></div></CardHeader><CardContent className="px-3 pb-5 sm:px-5"><ChartContainer config={chartConfig} className="h-[380px] w-full aspect-auto"><BarChart data={result.categoryData} layout="vertical" margin={{ left: 8, right: 30, top: 10, bottom: 4 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" tickFormatter={compactMoney} axisLine={false} tickLine={false} /><YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold tabular-nums">{money(Number(value))}</span>} />} /><Bar dataKey="value" radius={[0, 8, 8, 0]}>{result.categoryData.map((entry, index) => <Cell key={entry.name} fill={categoryColors[index % categoryColors.length]} />)}</Bar></BarChart></ChartContainer></CardContent></Card>
          <CashflowCard cashflow={result.cashflow} />
        </TabsContent>
        <TabsContent value="expenses" className="grid gap-5"><LivingExpenseSection items={livingExpenses} monthlyTotal={result.monthlyLivingExpense} periodTotal={result.livingCost} updateItem={updateLivingExpense} removeItem={(id) => setLivingExpenses((items) => items.filter((item) => item.id !== id))} addItem={() => setLivingExpenses((items) => [...items, { id: newId('living'), name: '新增生活支出', amount: 0 }])} /><EditableExpenseSection items={expenses} total={result.babyCost} updateItem={updateExpense} removeItem={(id) => setExpenses((items) => items.filter((item) => item.id !== id))} addItem={() => setExpenses((items) => [...items, { id: newId('expense'), category: '其他', name: '新增育兒支出', amount: 0, qty: 1, unit: '筆' }])} /></TabsContent>
        <TabsContent value="income"><EditableIncomeSection items={incomes} total={result.totalIncome} motherTotal={result.motherIncomeTotal} fatherTotal={result.fatherIncomeTotal} maternityLeaveWeeks={settings.maternityLeaveWeeks} leaveMonths={settings.parentalLeaveMonths} updateItem={updateIncome} removeItem={(id) => setIncomes((items) => items.filter((item) => item.id !== id))} addItem={() => setIncomes((items) => [...items, { id: newId('income'), name: '新增收入', amount: 0, qty: 1, unit: '每月', kind: 'household' }])} /></TabsContent>
        <TabsContent value="subsidies"><EditableSubsidySection items={subsidies} total={result.totalSupport} updateItem={updateSubsidy} removeItem={(id) => setSubsidies((items) => items.filter((item) => item.id !== id))} addItem={() => setSubsidies((items) => [...items, { id: newId('support'), name: '新增補助', amount: 0, qty: 1, unit: '次', note: '' }])} /></TabsContent>
      </Tabs>
      <section className="mt-8 rounded-[28px] bg-[var(--ink)] px-5 py-6 text-white sm:px-7"><h2 className="font-heading text-xl font-semibold">預設值只是起點</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">資料只會儲存在目前瀏覽器。金額依省錢實用情境先帶入；醫院、月子中心、疫苗與補助資格差異很大，請以實際報價及主管機關核定為準。</p></section>
    </div>
  </main>;
}

function CashflowCard({ cashflow }: { cashflow: CashflowRow[] }) {
  return <Card className="min-w-0 rounded-[28px] border-0 bg-white/90 py-0 shadow-[0_16px_50px_rgba(71,54,44,.06)] ring-1 ring-[var(--line)]"><CardHeader className="px-5 pb-2 pt-5 sm:px-6"><CardTitle className="font-heading text-xl font-semibold">每月家庭現金流</CardTitle><CardDescription>從備孕到寶寶滿兩歲；淨現金流＝收入－生活支出－育兒支出＋補助</CardDescription></CardHeader><CardContent className="px-3 pb-6 sm:px-5"><ChartContainer config={cashflowConfig} className="h-[340px] w-full min-w-0 aspect-auto"><AreaChart data={cashflow} margin={{ left: 4, right: 18, top: 12, bottom: 4 }}><defs><linearGradient id="cashflowFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-withSupport)" stopOpacity={0.32} /><stop offset="95%" stopColor="var(--color-withSupport)" stopOpacity={0.03} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" interval={2} axisLine={false} tickLine={false} fontSize={11} /><YAxis tickFormatter={compactMoney} width={54} axisLine={false} tickLine={false} fontSize={11} /><ReferenceLine y={0} stroke="#7d8585" strokeDasharray="4 4" /><ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold tabular-nums">{money(Number(value))}</span>} />} /><Area type="monotone" dataKey="withSupport" stroke="var(--color-withSupport)" fill="url(#cashflowFill)" strokeWidth={2.5} /><Area type="monotone" dataKey="withoutSupport" stroke="var(--color-withoutSupport)" fill="transparent" strokeWidth={2} strokeDasharray="5 4" /></AreaChart></ChartContainer><div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[var(--teal)]" />含補助</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-5 border-t-2 border-dashed border-[var(--terracotta)]" />未計補助</span></div><details className="mt-5 rounded-2xl bg-[var(--cream)]"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">展開逐月明細</summary><div className="overflow-x-auto border-t border-[var(--line)]"><table className="w-full min-w-[900px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="px-4 py-3">月份</th><th className="px-3 py-3 text-right">收入</th><th className="px-3 py-3 text-right">生活支出</th><th className="px-3 py-3 text-right">育兒支出</th><th className="px-3 py-3 text-right">補助</th><th className="px-3 py-3 text-right">淨現金流</th><th className="px-4 py-3 text-right">期末存款</th></tr></thead><tbody>{cashflow.map((row) => <tr key={row.month} className="border-t border-[var(--line)]/70"><td className="px-4 py-2.5 font-medium">{row.label}</td><td className="px-3 py-2.5 text-right tabular-nums">{money(row.income)}</td><td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{money(row.livingExpense)}</td><td className="px-3 py-2.5 text-right tabular-nums text-[var(--terracotta-deep)]">{money(row.babyExpense)}</td><td className="px-3 py-2.5 text-right tabular-nums text-[var(--teal)]">{money(row.support)}</td><td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${row.withSupport < 0 ? 'text-[var(--terracotta-deep)]' : 'text-[var(--teal)]'}`}>{money(row.withSupport)}</td><td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.balance < 0 ? 'text-[var(--terracotta-deep)]' : 'text-[var(--ink)]'}`}>{money(row.balance)}</td></tr>)}</tbody></table></div></details></CardContent></Card>;
}
function LivingExpenseSection({ items, monthlyTotal, periodTotal, updateItem, removeItem, addItem }: { items: LivingExpenseItem[]; monthlyTotal: number; periodTotal: number; updateItem: (id: string, patch: Partial<LivingExpenseItem>) => void; removeItem: (id: string) => void; addItem: () => void }) {
  return <SectionShell title="生活支出" description={`每月合計 ${money(monthlyTotal)}；36 個月合計 ${money(periodTotal)}`} total={periodTotal} onAdd={addItem}>{items.length === 0 ? <EmptyRow>目前沒有生活支出，按下方按鈕新增。</EmptyRow> : items.map((item) => <div key={item.id} className="editable-row grid gap-2 rounded-2xl bg-[var(--sage-wash)] p-3 sm:grid-cols-[minmax(180px,1fr)_150px_40px] sm:items-center"><Input aria-label="生活支出名稱" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-10 rounded-xl bg-white" /><NumericInput value={item.amount} onChange={(amount) => updateItem(item.id, { amount })} ariaLabel={`${item.name}每月金額`} /><Button type="button" size="icon" variant="ghost" aria-label={`刪除${item.name}`} onClick={() => removeItem(item.id)} className="rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button><div className="col-span-full flex justify-end text-xs text-muted-foreground">每月 <strong className="ml-2 text-[var(--ink)] tabular-nums">{money(item.amount)}</strong><span className="mx-1">× 36 個月＝</span><strong className="text-[var(--ink)] tabular-nums">{money(item.amount * TOTAL_MONTHS)}</strong></div></div>)}</SectionShell>;
}
function SummaryMini({ label, value, warm = false, detail }: { label: string; value: number; warm?: boolean; detail?: string }) { return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[var(--line)]"><span className="text-xs text-muted-foreground">{label}</span><strong className={`mt-1 block font-heading text-lg tabular-nums ${warm ? 'text-[var(--terracotta-deep)]' : 'text-[var(--teal)]'}`}>{money(value)}</strong>{detail ? <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{detail}</span> : null}</div>; }
function SectionShell({ title, description, total, onAdd, children }: { title: string; description: string; total: number; onAdd: () => void; children: React.ReactNode }) { return <details open className="group rounded-[28px] bg-white/90 shadow-[0_16px_50px_rgba(71,54,44,.06)] ring-1 ring-[var(--line)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-5 sm:px-6"><span className="min-w-0"><span className="block font-heading text-lg font-semibold">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span><span className="flex shrink-0 items-center gap-3"><span className="text-right"><span className="block text-[11px] text-muted-foreground">區塊總計</span><strong className="font-heading text-lg text-[var(--terracotta-deep)] tabular-nums">{money(total)}</strong></span><span className="grid size-9 place-items-center rounded-xl bg-[var(--sand)] text-[var(--terracotta)]"><Minus className="hidden size-4 group-open:block" /><Plus className="size-4 group-open:hidden" /></span></span></summary><div className="border-t border-[var(--line)] px-4 py-5 sm:px-6"><div className="grid gap-3">{children}</div><Button type="button" variant="outline" onClick={onAdd} className="mt-4 w-full rounded-xl border-dashed"><Plus className="size-4" />新增一項</Button></div></details>; }

function EditableExpenseSection({ items, total, updateItem, removeItem, addItem }: { items: ExpenseItem[]; total: number; updateItem: (id: string, patch: Partial<ExpenseItem>) => void; removeItem: (id: string) => void; addItem: () => void }) {
  return <SectionShell title="育兒支出" description="品項、分類、單價與數量皆可修改" total={total} onAdd={addItem}>{items.length === 0 ? <EmptyRow>目前沒有育兒支出，按下方按鈕新增。</EmptyRow> : items.map((item) => <div key={item.id} className="editable-row grid gap-2 rounded-2xl bg-[var(--cream)] p-3 lg:grid-cols-[150px_minmax(180px,1fr)_120px_86px_74px_40px] lg:items-center"><Select value={item.category} onValueChange={(category) => updateItem(item.id, { category: category as ExpenseCategory })}><SelectTrigger aria-label={`${item.name}分類`} className="h-10 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select><Input aria-label="支出名稱" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-10 rounded-xl bg-white" /><NumericInput value={item.amount} onChange={(amount) => updateItem(item.id, { amount })} ariaLabel={`${item.name}單價`} /><NumericInput value={item.qty} onChange={(qty) => updateItem(item.id, { qty })} ariaLabel={`${item.name}數量`} /><Input aria-label={`${item.name}單位`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-10 rounded-xl bg-white text-center" /><Button type="button" size="icon" variant="ghost" aria-label={`刪除${item.name}`} onClick={() => removeItem(item.id)} className="rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button><div className="col-span-full flex justify-end text-xs text-muted-foreground">小計 <strong className="ml-2 text-[var(--ink)] tabular-nums">{money(item.amount * item.qty)}</strong></div></div>)}</SectionShell>;
}
function EditableIncomeSection({ items, total, motherTotal, fatherTotal, maternityLeaveWeeks, leaveMonths, updateItem, removeItem, addItem }: { items: IncomeItem[]; total: number; motherTotal: number; fatherTotal: number; maternityLeaveWeeks: number; leaveMonths: number; updateItem: (id: string, patch: Partial<IncomeItem>) => void; removeItem: (id: string) => void; addItem: () => void }) {
  const leaveStartMonth = Math.ceil(maternityLeaveWeeks / 4);
  const leaveMonthsInRange = Math.min(leaveMonths, Math.max(0, BABY_MONTHS - leaveStartMonth));
  const appliedCount = (item: IncomeItem) => item.kind === 'mother' ? TOTAL_MONTHS - leaveMonthsInRange : item.kind === 'father' || item.kind === 'household' ? TOTAL_MONTHS : item.kind === 'leave' ? Math.min(item.qty, leaveMonthsInRange) : item.qty;
  const motherFormula = items.filter((item) => item.kind === 'mother' || item.kind === 'leave').map((item) => `${money(item.amount)} × ${appliedCount(item)} 個月`).join('＋') || '尚未設定媽媽收入';
  const fatherFormula = items.filter((item) => item.kind === 'father').map((item) => `${money(item.amount)} × ${appliedCount(item)} 個月`).join('＋') || '尚未設定爸爸收入';
  return <SectionShell title="收入明細" description={`區間為備孕開始至寶寶滿兩歲，共 ${TOTAL_MONTHS} 個月；產假 ${maternityLeaveWeeks} 星期有薪，之後才進入育嬰留停`} total={total} onAdd={addItem}>
    <div className="grid gap-3 sm:grid-cols-2"><SummaryMini label="媽媽期間收入總計" value={motherTotal} detail={motherFormula} /><SummaryMini label="爸爸期間收入總計" value={fatherTotal} detail={fatherFormula} /></div>
    {items.length === 0 ? <EmptyRow>目前沒有收入，按下方按鈕新增。</EmptyRow> : items.map((item) => {
      const count = appliedCount(item);
      const countUnit = item.kind === 'one-time' ? item.unit : '個月';
      return <div key={item.id} className="editable-row grid gap-2 rounded-2xl bg-[var(--cream)] p-3 lg:grid-cols-[150px_minmax(180px,1fr)_120px_86px_74px_40px] lg:items-center"><Select value={item.kind} onValueChange={(kind) => updateItem(item.id, { kind: kind as IncomeKind })}><SelectTrigger aria-label={`${item.name}類型`} className="h-10 w-full rounded-xl bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mother">媽媽薪資</SelectItem><SelectItem value="father">爸爸薪資</SelectItem><SelectItem value="household">家庭其他收入</SelectItem><SelectItem value="leave">媽媽留停津貼</SelectItem><SelectItem value="one-time">一次收入</SelectItem></SelectContent></Select><Input aria-label="收入名稱" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-10 rounded-xl bg-white" /><NumericInput value={item.amount} onChange={(amount) => updateItem(item.id, { amount })} ariaLabel={`${item.name}金額`} />{item.kind === 'leave' || item.kind === 'one-time' ? <NumericInput value={item.qty} onChange={(qty) => updateItem(item.id, { qty })} ariaLabel={`${item.name}數量`} /> : <div className="grid h-10 place-items-center rounded-xl bg-white text-sm font-semibold tabular-nums ring-1 ring-[var(--line)]">{count}</div>}<Input aria-label={`${item.name}單位`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-10 rounded-xl bg-white text-center" /><Button type="button" size="icon" variant="ghost" aria-label={`刪除${item.name}`} onClick={() => removeItem(item.id)} className="rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button><div className="col-span-full flex flex-wrap justify-end gap-x-1 text-xs text-muted-foreground"><span>{money(item.amount)} × {count} {countUnit}</span><span>＝</span><strong className="text-[var(--ink)] tabular-nums">{money(item.amount * count)}</strong></div></div>;
    })}
  </SectionShell>;
}
function EditableSubsidySection({ items, total, updateItem, removeItem, addItem }: { items: SubsidyItem[]; total: number; updateItem: (id: string, patch: Partial<SubsidyItem>) => void; removeItem: (id: string) => void; addItem: () => void }) {
  return <SectionShell title="補助明細" description="補助獨立列示；名稱、金額與次數皆可調整" total={total} onAdd={addItem}>{items.length === 0 ? <EmptyRow>目前沒有補助，按下方按鈕新增。</EmptyRow> : items.map((item) => <div key={item.id} className="editable-row grid gap-2 rounded-2xl bg-[var(--sage-wash)] p-3 lg:grid-cols-[minmax(200px,1fr)_120px_86px_74px_40px] lg:items-center"><Input aria-label="補助名稱" value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} className="h-10 rounded-xl bg-white" /><NumericInput value={item.amount} onChange={(amount) => updateItem(item.id, { amount })} ariaLabel={`${item.name}金額`} /><NumericInput value={item.qty} onChange={(qty) => updateItem(item.id, { qty })} ariaLabel={`${item.name}數量`} /><Input aria-label={`${item.name}單位`} value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} className="h-10 rounded-xl bg-white text-center" /><Button type="button" size="icon" variant="ghost" aria-label={`刪除${item.name}`} onClick={() => removeItem(item.id)} className="rounded-xl text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button><Input aria-label={`${item.name}備註`} value={item.note} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder="資格或申請備註" className="col-span-full h-9 rounded-xl bg-white/80 text-xs" /><div className="col-span-full flex justify-end text-xs text-[var(--teal)]">合計 <strong className="ml-2 tabular-nums">{money(item.amount * item.qty)}</strong></div></div>)}</SectionShell>;
}
