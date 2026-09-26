/**
 * A small .xlsx (Office Open XML spreadsheet) writer: one sheet, a bold
 * frozen header row, column widths, and typed cells (numbers, booleans,
 * dates as serial numbers with a date format, text as inline strings).
 * The parts are zipped with our own store-method ZIP writer.
 */

import { ZipWriter } from "./zip";

export type XlsxCell = string | number | boolean | Date | null | undefined;

export type XlsxSheet = {
  name: string;
  header: string[];
  rows: XlsxCell[][];
  /** Column widths in characters; estimated from the content when omitted. */
  widths?: number[];
};

const MAX_CELL_TEXT = 32_767;

/** XML-escapes text and drops the control characters XML 1.0 forbids. */
export function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "A", "B", ... "Z", "AA"... for a zero-based column index. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Excel's serial date: days since 1899-12-30. Dates are written in the
 * admin's local time (what they see in the table), not UTC.
 */
export function excelSerial(date: Date): number {
  const local = date.getTime() - date.getTimezoneOffset() * 60_000;
  return local / 86_400_000 + 25_569;
}

function sheetName(name: string) {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Responses";
}

function cellXml(ref: string, value: XlsxCell, header: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (header) {
    return `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlText(String(value).slice(0, MAX_CELL_TEXT))}</t></is></c>`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : "";
  }
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const midnight = value.getHours() === 0 && value.getMinutes() === 0 && value.getSeconds() === 0;
    return `<c r="${ref}" s="${midnight ? 4 : 2}"><v>${excelSerial(value)}</v></c>`;
  }
  const text = xmlText(value.slice(0, MAX_CELL_TEXT));
  return `<c r="${ref}" t="inlineStr" s="3"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function estimateWidths(sheet: XlsxSheet): number[] {
  return sheet.header.map((title, column) => {
    let longest = title.length;
    const sample = Math.min(sheet.rows.length, 500);
    for (let index = 0; index < sample; index += 1) {
      const value = sheet.rows[index][column];
      const length =
        value instanceof Date
          ? 18
          : value === null || value === undefined
            ? 0
            : String(value).split("\n")[0].length;
      if (length > longest) longest = length;
    }
    return Math.min(60, Math.max(8, longest + 2));
  });
}

export function worksheetXml(sheet: XlsxSheet): string {
  const widths = sheet.widths ?? estimateWidths(sheet);
  const lastColumn = columnLetter(Math.max(0, sheet.header.length - 1));
  const lastRow = sheet.rows.length + 1;
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<dimension ref="A1:${lastColumn}${lastRow}"/>`,
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
  ];
  if (widths.length) {
    parts.push(
      `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`,
    );
  }
  parts.push("<sheetData>");
  const letters = sheet.header.map((_, index) => columnLetter(index));
  parts.push(
    `<row r="1">${sheet.header.map((title, index) => cellXml(`${letters[index]}1`, title, true)).join("")}</row>`,
  );
  sheet.rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    let cells = "";
    for (let index = 0; index < letters.length; index += 1)
      cells += cellXml(`${letters[index]}${r}`, row[index], false);
    parts.push(`<row r="${r}">${cells}</row>`);
  });
  parts.push("</sheetData>");
  if (sheet.header.length) parts.push(`<autoFilter ref="A1:${lastColumn}${lastRow}"/>`);
  parts.push("</worksheet>");
  return parts.join("");
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECF1FA"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** The .xlsx file's bytes. */
export function buildXlsx(sheet: XlsxSheet, title = sheet.name): Uint8Array {
  const zip = new ZipWriter();
  const name = xmlText(sheetName(sheet.name));
  zip.addText(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
  );
  zip.addText(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
  );
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.addText(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(title)}</dc:title><dc:creator>MGM Laboratory</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`,
  );
  zip.addText(
    "docProps/app.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MGM Laboratory</Application></Properties>',
  );
  zip.addText(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>${sheet.header.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${name.replace(/'/g, "''")}'!$A$1:$${columnLetter(sheet.header.length - 1)}$${sheet.rows.length + 1}</definedName></definedNames>` : ""}</workbook>`,
  );
  zip.addText(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.addText("xl/styles.xml", STYLES);
  zip.addText("xl/worksheets/sheet1.xml", worksheetXml(sheet));
  return zip.toBytes();
}
