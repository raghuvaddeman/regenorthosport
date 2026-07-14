// lib/campaigns/parse-contacts.ts
// Shared contact-list parsing for the Bulk Call creation and edit forms —
// accepts .csv/.txt (plain text) or .xlsx/.xls (via SheetJS) and normalizes
// both into the same { name, phone } shape.

import * as XLSX from "xlsx";

export type ParsedContact = { name: string | null; phone: string };

/** Loose phone check: keeps a leading "+" and 7-15 digits — good enough to filter
    out obviously-broken rows without rejecting valid international formats. */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Shared row logic for both CSV lines and spreadsheet rows: whichever cell
    looks like a phone number wins, the rest becomes the name. */
function contactsFromRows(rows: string[][]): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  for (const row of rows) {
    const cells = row.map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    if (cells.length === 1 && !looksLikePhone(cells[0])) continue; // likely a header row
    if (cells.length === 1) {
      contacts.push({ name: null, phone: cells[0] });
      continue;
    }
    const phoneIdx = cells.findIndex(looksLikePhone);
    if (phoneIdx === -1) continue; // header row like "name,phone"
    const phone = cells[phoneIdx];
    const name = cells.filter((_, i) => i !== phoneIdx).join(" ").trim() || null;
    contacts.push({ name, phone });
  }
  return contacts;
}

export function parseContactsCsv(text: string): ParsedContact[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split(","));
  return contactsFromRows(rows);
}

export function parseContactsXlsx(buffer: ArrayBuffer): ParsedContact[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
  return contactsFromRows(rows.map((row) => row.map((cell) => String(cell ?? ""))));
}

/** Reads a File (from a file input) and returns parsed contacts, picking the
    parser based on the file extension. Throws on unreadable/corrupt files. */
export function readContactsFile(file: File): Promise<ParsedContact[]> {
  const isSpreadsheet = /\.xlsx?$/i.test(file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(
          isSpreadsheet
            ? parseContactsXlsx(reader.result as ArrayBuffer)
            : parseContactsCsv(String(reader.result ?? ""))
        );
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    if (isSpreadsheet) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });
}
