import { describe, expect, it } from "vitest";

import {
  buildXlsx,
  columnLetter,
  excelSerial,
  worksheetXml,
  xmlText,
  type XlsxSheet,
} from "./xlsx";

/** Reads the entries of a store-method archive written by `ZipWriter`. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength;
    files.set(name, decoder.decode(bytes.slice(start, start + size)));
    offset = start + size;
  }
  return files;
}

describe("xmlText", () => {
  it("escapes markup and drops forbidden control characters", () => {
    expect(xmlText(`a & b < c > "d"`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
    expect(xmlText("a\u0000b\u0008c\u000bd\u001fe￾f￿")).toBe("abcdef");
    expect(xmlText("keep\ttabs\nand\rbreaks")).toBe("keep\ttabs\nand\rbreaks");
  });
});

describe("columnLetter", () => {
  it("counts like a spreadsheet", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
  });
});

describe("excelSerial", () => {
  it("converts a local date to a serial number", () => {
    expect(excelSerial(new Date(2024, 0, 1))).toBeCloseTo(45292, 8);
    expect(excelSerial(new Date(2024, 0, 1, 12))).toBeCloseTo(45292.5, 8);
  });
});

describe("worksheetXml", () => {
  it("writes typed cells with the right styles", () => {
    const xml = worksheetXml({
      name: "S",
      header: ["Name", "Qty", "Ok", "When"],
      rows: [
        ["Ada & Bob", 3, true, new Date(2024, 0, 1)],
        ["", Number.NaN, false, new Date(2024, 0, 1, 9, 30)],
        [null, Infinity, undefined, new Date(Number.NaN)],
      ],
      widths: [12, 8, 6, 20],
    });
    expect(xml).toContain('<dimension ref="A1:D4"/>');
    expect(xml).toContain('<autoFilter ref="A1:D4"/>');
    expect(xml).toContain('<col min="1" max="1" width="12" customWidth="1"/>');
    expect(xml).toContain(
      '<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>',
    );
    expect(xml).toContain(
      '<c r="A2" t="inlineStr" s="3"><is><t xml:space="preserve">Ada &amp; Bob</t></is></c>',
    );
    expect(xml).toContain('<c r="B2"><v>3</v></c>');
    expect(xml).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(xml).toContain('<c r="C3" t="b"><v>0</v></c>');
    expect(xml).toContain('<c r="D2" s="4"><v>45292</v></c>');
    expect(xml).toMatch(/<c r="D3" s="2"><v>45292\.3958333/);
    // Empty, NaN, infinite and invalid values write no cell
    expect(xml).not.toContain('r="A3"');
    expect(xml).not.toContain('r="B3"');
    expect(xml).not.toContain('r="B4"');
    expect(xml).not.toContain('r="D4"');
    expect(xml).toContain('<row r="4"></row>');
  });

  it("caps the text of a cell", () => {
    const xml = worksheetXml({
      name: "S",
      header: ["H"],
      rows: [["x".repeat(40_000)]],
      widths: [10],
    });
    expect(xml).toContain(`>${"x".repeat(32_767)}<`);
    expect(xml).not.toContain("x".repeat(32_768));
  });

  it("estimates widths from the content when none are given", () => {
    const xml = worksheetXml({
      name: "S",
      header: ["A", "Longer header", "C", "D"],
      rows: [
        ["x".repeat(100), "short", new Date(2024, 0, 1), "line one\nline two is longer"],
        ["y"],
      ],
    });
    expect(xml).toContain('<col min="1" max="1" width="60" customWidth="1"/>');
    expect(xml).toContain('<col min="2" max="2" width="15" customWidth="1"/>');
    expect(xml).toContain('<col min="3" max="3" width="20" customWidth="1"/>');
    expect(xml).toContain('<col min="4" max="4" width="10" customWidth="1"/>');
  });

  it("fills every header column of a short row", () => {
    const xml = worksheetXml({ name: "S", header: ["A", "B"], rows: [["only"]], widths: [] });
    expect(xml).toContain('<row r="2"><c r="A2"');
    expect(xml).not.toContain("<cols>");
  });

  it("omits the filter and widths for an empty sheet", () => {
    const xml = worksheetXml({ name: "S", header: [], rows: [] });
    expect(xml).not.toContain("<autoFilter");
    expect(xml).toContain('<dimension ref="A1:A1"/>');
  });
});

describe("buildXlsx", () => {
  const sheet: XlsxSheet = { name: "Data", header: ["A", "B"], rows: [["x", 1]], widths: [10, 10] };

  it("zips the parts of a workbook", () => {
    const files = unzip(buildXlsx(sheet, "My <title>"));
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/core.xml",
      "docProps/app.xml",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(files.get("docProps/core.xml")).toContain("<dc:title>My &lt;title&gt;</dc:title>");
    expect(files.get("docProps/core.xml")).toMatch(/W3CDTF">\d{4}-\d{2}-\d{2}T[\d:]+Z</);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Data" sheetId="1" r:id="rId1"/>');
    expect(files.get("xl/workbook.xml")).toContain("'Data'!$A$1:$B$2");
    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<c r="B2"><v>1</v></c>');
    expect(files.get("xl/styles.xml")).toContain("yyyy-mm-dd hh:mm");
  });

  it("cleans the sheet name and falls back to a default", () => {
    const messy = unzip(buildXlsx({ ...sheet, name: "  a/b?c*[d]:e " + "z".repeat(40) }));
    const name = /<sheet name="([^"]*)"/.exec(messy.get("xl/workbook.xml") ?? "")?.[1] ?? "";
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).toMatch(/^a b c {2}d {2}e z/);
    const blank = unzip(buildXlsx({ ...sheet, name: " / " }));
    expect(blank.get("xl/workbook.xml")).toContain('name="Responses"');
  });

  it("escapes quotes in the defined name and skips it without a header", () => {
    const quoted = unzip(buildXlsx({ ...sheet, name: "it's" }));
    expect(quoted.get("xl/workbook.xml")).toContain("'it''s'!$A$1:$B$2");
    const bare = unzip(buildXlsx({ name: "N", header: [], rows: [] }));
    expect(bare.get("xl/workbook.xml")).not.toContain("definedNames");
  });

  it("uses the sheet name as the default title", () => {
    const files = unzip(buildXlsx(sheet));
    expect(files.get("docProps/core.xml")).toContain("<dc:title>Data</dc:title>");
  });
});
