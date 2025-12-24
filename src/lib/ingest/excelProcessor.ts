import * as XLSX from 'xlsx';
import { Database } from '@/types/database.types';
import { categorizeTransaction, isUncategorizedCategory } from '@/lib/finance/categorizer';

type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];

const DATE_HEADERS = ['date', 'fecha', 'fecha valor', 'dia', 'f. valor'];
const AMOUNT_HEADERS = ['amount', 'importe', 'monto', 'cantidad', 'saldo', 'debe', 'haber', 'cargo', 'abono', 'ingreso', 'egreso', 'retiro'];
const DESC_HEADERS = ['description', 'concepto', 'descripcion', 'descripción', 'detalle', 'movimiento'];
const CATEGORY_HEADERS = ['category', 'categoria', 'tipo'];

// Normalize header strings for matching (trim, lowercase, remove accents, collapse whitespace)
const normalizeHeader = (val: any) =>
    String(val ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\r\n]+/g, '')
        .replace(/\s+/g, ' ');

function detectHeaderRow(rows: any[][]) {
    let headerRowIndex = 0;
    let bestScore = -1;

    rows.forEach((row, idx) => {
        const normalized = row.map(normalizeHeader);
        const score = normalized.reduce((acc, h) => {
            if (!h) return acc;
            let points = 0;
            if (DATE_HEADERS.includes(h)) points += 2;
            if (AMOUNT_HEADERS.includes(h)) points += 2;
            if (DESC_HEADERS.includes(h)) points += 1;
            if (CATEGORY_HEADERS.includes(h)) points += 1;
            return acc + points;
        }, 0);

        if (score > bestScore) {
            bestScore = score;
            headerRowIndex = idx;
        }
    });

    const header = (rows[headerRowIndex] || []).map(normalizeHeader);
    const dataRows = rows.slice(headerRowIndex + 1);
    return { header, dataRows };
}

export async function parseFinancialFile(file: File): Promise<TransactionInsert[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0]; // Assume first sheet
                const sheet = workbook.Sheets[sheetName];

                // Load all rows first to locate the header row (some files include titles or blank rows on top)
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
                const { header, dataRows } = detectHeaderRow(rows);

                // Build a JSON-like structure using the detected header row
                const jsonData = dataRows.map((row) => {
                    const obj: Record<string, any> = {};
                    row.forEach((cell, idx) => {
                        const key = header[idx];
                        if (key) obj[key] = cell;
                    });
                    return obj;
                });

                // Console log for debugging
                if (jsonData.length > 0) {
                    console.log("Detected Header:", header);
                    console.log("First row Raw:", jsonData[0]);
                }

                // Map to our Database Schema
                const transactions: TransactionInsert[] = jsonData.map((row) => {
                    // Try to match columns
                    const keys = Object.keys(row);
                    const findKey = (candidates: string[]) => keys.find(k => candidates.includes(normalizeHeader(k)));

                    const dateKey = findKey(DATE_HEADERS);
                    const amountKey = findKey(AMOUNT_HEADERS);
                    const categoryKey = findKey(CATEGORY_HEADERS);
                    const descKey = findKey(DESC_HEADERS);

                    let amountVal = row[amountKey || ''];

                    // Fallback for Debit/Credit separation if applicable (simplified here, assuming single column for now based on previous requests, 
                    // but keeping the logic extensible if needed)
                    // If complex debit/credit logic is needed, we'd add it here.

                    const amount = parseAmount(amountVal);
                    const description = row[descKey || ''] || 'Sin Descripcion';
                    const type = amount < 0 ? 'expense' : 'income';
                    const rawCategory = row[categoryKey || ''];
                    const category = isUncategorizedCategory(rawCategory)
                        ? categorizeTransaction(description, amount)
                        : String(rawCategory);

                    return {
                        date: parseDate(row[dateKey || '']),
                        amount: amount,
                        type,
                        category,
                        description,
                        user_id: '',
                        channel: 'Importado',
                        is_anomaly: false
                    };
                });

                // Filter out invalid rows
                const validTransactions = transactions.filter(t => t.date && (t.amount !== 0 || t.description !== 'Sin Descripcion'));

                resolve(validTransactions);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsBinaryString(file);
    });
}

function parseAmount(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;

    let str = String(val).trim();

    // Remove symbols: € $ £ space, but keep . , -
    str = str.replace(/[^0-9.,-]/g, '');

    if (!str) return 0;

    // Detect format
    const hasComma = str.includes(',');
    const hasDot = str.includes('.');

    if (hasComma && hasDot) {
        // "1.200,50" -> Euro (Dot thousand, Comma decimal)
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        }
        // "1,200.50" -> US (Comma thousand, Dot decimal)
        else {
            str = str.replace(/,/g, '');
        }
    } else if (hasComma) {
        // "1200,50" -> Euro Decimal
        str = str.replace(',', '.');
    } else if (hasDot) {
        // "1200.50" -> US Decimal
        // If multiple dots, assume thousands: "1.200.500" -> "1200500"
        if ((str.match(/\./g) || []).length > 1) {
            str = str.replace(/\./g, '');
        }
        // If single dot, keep as is.
    }

    return parseFloat(str) || 0;
}

function parseDate(val: any): string {
    if (!val) return new Date().toISOString().split('T')[0];

    // Handle Excel Serial Dates
    if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }

    // Handle Strings
    try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { }

    return new Date().toISOString().split('T')[0];
}
