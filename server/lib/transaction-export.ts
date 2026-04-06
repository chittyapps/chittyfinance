/**
 * Transaction export serializers: CSV, QFX (Quicken), OFX (Open Financial Exchange).
 *
 * QFX is Intuit's branded OFX variant — structurally identical to OFX 1.x (SGML),
 * with an extra INTUIT.BID header. We emit both from the same builder.
 */

export interface ExportTransaction {
  id: string;
  accountId: string;
  amount: string | number;
  type: string;
  category: string | null;
  description: string;
  date: Date | string;
  payee: string | null;
  reconciled: boolean;
  currency?: string;
}

export interface ExportAccount {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  accountNumber: string | null;
  currency: string;
}

// ── CSV ──

const CSV_HEADERS = [
  'Date',
  'Amount',
  'Type',
  'Category',
  'Description',
  'Payee',
  'Account',
  'Reconciled',
  'Currency',
  'Transaction ID',
] as const;

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function serializeCsv(
  transactions: ExportTransaction[],
  accountMap: Map<string, ExportAccount>,
): string {
  const lines: string[] = [CSV_HEADERS.join(',')];

  for (const tx of transactions) {
    const account = accountMap.get(tx.accountId);
    const row = [
      formatCsvDate(tx.date),
      String(tx.amount),
      tx.type,
      tx.category || '',
      tx.description,
      tx.payee || '',
      account?.name || '',
      tx.reconciled ? 'Y' : 'N',
      tx.currency || account?.currency || 'USD',
      tx.id,
    ];
    lines.push(row.map(csvEscape).join(','));
  }

  return lines.join('\r\n') + '\r\n';
}

// ── OFX / QFX ──

function ofxDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}${h}${min}${s}`;
}

function ofxAccountType(type: string): string {
  switch (type) {
    case 'checking': return 'CHECKING';
    case 'savings': return 'SAVINGS';
    case 'credit': return 'CREDITLINE';
    case 'investment': return 'MONEYMRKT';
    default: return 'CHECKING';
  }
}

function ofxTransType(type: string, amount: number): string {
  if (type === 'transfer') return 'XFER';
  return amount >= 0 ? 'CREDIT' : 'DEBIT';
}

interface OfxOptions {
  format: 'ofx' | 'qfx';
  account: ExportAccount;
  transactions: ExportTransaction[];
  startDate: string;
  endDate: string;
}

export function serializeOfx(options: OfxOptions): string {
  const { format, account, transactions, startDate, endDate } = options;
  const now = ofxDate(new Date());
  const acctId = account.accountNumber || account.id.slice(0, 10);
  const acctType = ofxAccountType(account.type);
  const currency = account.currency || 'USD';

  // OFX 1.x SGML headers
  const headers = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
  ];

  // QFX adds Intuit bank ID
  if (format === 'qfx') {
    headers.push('INTUIT.BID:10003');
  }

  const transactionSgml = transactions.map((tx) => {
    const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
    const trnType = ofxTransType(tx.type, amt);
    const fitId = tx.id.replace(/-/g, '').slice(0, 32);
    const name = (tx.payee || tx.description).slice(0, 32);
    const memo = tx.description.slice(0, 255);

    return [
      '<STMTTRN>',
      `<TRNTYPE>${trnType}`,
      `<DTPOSTED>${ofxDate(tx.date)}`,
      `<TRNAMT>${amt.toFixed(2)}`,
      `<FITID>${fitId}`,
      `<NAME>${escapeOfxText(name)}`,
      `<MEMO>${escapeOfxText(memo)}`,
      '</STMTTRN>',
    ].join('\n');
  }).join('\n');

  const body = [
    '<OFX>',
    '<SIGNONMSGSRSV1>',
    '<SONRS>',
    '<STATUS>',
    '<CODE>0',
    '<SEVERITY>INFO',
    '</STATUS>',
    `<DTSERVER>${now}`,
    '<LANGUAGE>ENG',
    '</SONRS>',
    '</SIGNONMSGSRSV1>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    '<TRNUID>0',
    '<STATUS>',
    '<CODE>0',
    '<SEVERITY>INFO',
    '</STATUS>',
    '<STMTRS>',
    `<CURDEF>${currency}`,
    '<BANKACCTFROM>',
    `<BANKID>${account.institution ? escapeOfxText(account.institution.slice(0, 9)) : '000000000'}`,
    `<ACCTID>${escapeOfxText(acctId)}`,
    `<ACCTTYPE>${acctType}`,
    '</BANKACCTFROM>',
    '<BANKTRANLIST>',
    `<DTSTART>${ofxDate(startDate)}`,
    `<DTEND>${ofxDate(endDate)}`,
    transactionSgml,
    '</BANKTRANLIST>',
    '</STMTRS>',
    '</STMTTRNRS>',
    '</BANKMSGSRSV1>',
    '</OFX>',
  ].join('\n');

  return headers.join('\n') + '\n\n' + body + '\n';
}

function escapeOfxText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Helpers ──

export function buildAccountMap(accounts: ExportAccount[]): Map<string, ExportAccount> {
  return new Map(accounts.map((a) => [a.id, a]));
}

export type ExportFormat = 'csv' | 'ofx' | 'qfx';

export function contentTypeForFormat(format: ExportFormat): string {
  switch (format) {
    case 'csv': return 'text/csv; charset=utf-8';
    case 'ofx': return 'application/x-ofx';
    case 'qfx': return 'application/x-qfx';
  }
}

export function fileExtension(format: ExportFormat): string {
  return format;
}
