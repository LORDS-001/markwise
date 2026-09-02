import type { RawAnswer } from "./types";

/**
 * RFC 4180 CSV parsing.
 *
 * The setup screen previously counted rows by splitting on newlines, which
 * miscounts every quoted field containing a line break — common in pasted
 * student answers, and silently wrong rather than loudly wrong.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let hasField = false;

  const endField = () => {
    row.push(field);
    field = "";
    hasField = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      hasField = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r") {
      // Swallow; the \n that follows ends the row. A lone \r ends it too.
      if (text[i + 1] !== "\n") endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
      hasField = true;
    }
  }

  // A trailing newline leaves nothing pending; anything else is a final row.
  if (hasField || field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** True when a row looks like a header rather than a student answer. */
function looksLikeHeader(row: string[]): boolean {
  const joined = row.join(" ").toLowerCase();
  return /\b(student|answer|response|id|name|matric)\b/.test(joined);
}

/**
 * Two columns: student identifier, then answer text. Extra columns are
 * ignored. A header row is skipped when it reads like one.
 */
export function answersFromCsv(text: string): RawAnswer[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const body = looksLikeHeader(rows[0]) ? rows.slice(1) : rows;

  return body
    .map((row, index) => ({
      studentRef: row[0]?.trim() || `Student ${index + 1}`,
      text: (row[1] ?? "").trim(),
    }))
    .filter((a) => a.text.length > 0);
}

/**
 * Pasted format: student ID, a pipe, then the answer — one per line.
 *
 * A line with no pipe is still an answer; it just has no identifier, so one
 * is assigned by position rather than dropping a student's work on the floor.
 */
export function answersFromPaste(text: string): RawAnswer[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const pipe = line.indexOf("|");
      if (pipe === -1) {
        return { studentRef: `Student ${index + 1}`, text: line };
      }
      return {
        studentRef: line.slice(0, pipe).trim() || `Student ${index + 1}`,
        text: line.slice(pipe + 1).trim(),
      };
    })
    .filter((a) => a.text.length > 0);
}

/** Initials for the roster, so the demo never shows a classmate's full name. */
export function initialsFor(studentRef: string): string {
  const words = studentRef.trim().split(/[\s/_-]+/).filter(Boolean);
  const letters = words
    .map((w) => w[0])
    .filter((c) => /[A-Za-z]/.test(c ?? ""))
    .slice(0, 3);
  return letters.length > 0 ? letters.join("").toUpperCase() : "—";
}
