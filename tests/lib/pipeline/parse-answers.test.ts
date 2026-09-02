import { describe, expect, it } from "vitest";
import {
  answersFromCsv,
  answersFromPaste,
  initialsFor,
  parseCsv,
} from "@/lib/pipeline/parse-answers";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a newline inside a quoted field on the same row", () => {
    const rows = parseCsv('id,answer\n"S1","line one\nline two"');
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("line one\nline two");
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('a,"he said ""no"""')[0][1]).toBe('he said "no"');
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('"S1","Z = R, so I = V/R"')[0]).toEqual([
      "S1",
      "Z = R, so I = V/R",
    ]);
  });

  it("handles CRLF and a trailing newline without inventing a blank row", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops fully blank rows", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toHaveLength(2);
  });
});

describe("answersFromCsv", () => {
  it("skips a header row and pairs id with answer", () => {
    const answers = answersFromCsv(
      "Student ID,Answer\nEEE/1,Z equals R\nEEE/2,I used quadrature",
    );
    expect(answers).toEqual([
      { studentRef: "EEE/1", text: "Z equals R" },
      { studentRef: "EEE/2", text: "I used quadrature" },
    ]);
  });

  it("keeps the first row when it is not a header", () => {
    expect(answersFromCsv("EEE/1,Z equals R")).toHaveLength(1);
  });

  it("counts a quoted multi-line answer as one student, not two", () => {
    const answers = answersFromCsv('id,answer\n"EEE/1","first line\nsecond line"');
    expect(answers).toHaveLength(1);
    expect(answers[0].text).toBe("first line\nsecond line");
  });

  it("drops rows with no answer text", () => {
    expect(answersFromCsv("id,answer\nEEE/1,\nEEE/2,real")).toHaveLength(1);
  });

  it("names a student by position when the identifier is blank", () => {
    expect(answersFromCsv("id,answer\n,real answer")[0].studentRef).toBe("Student 1");
  });
});

describe("answersFromPaste", () => {
  it("splits on the first pipe only, so the answer keeps its own pipes", () => {
    const answers = answersFromPaste("EEE/1 | Z = R | so I = 8 A");
    expect(answers[0]).toEqual({
      studentRef: "EEE/1",
      text: "Z = R | so I = 8 A",
    });
  });

  it("keeps a line with no pipe as an answer with a positional id", () => {
    const answers = answersFromPaste("no identifier here");
    expect(answers).toEqual([{ studentRef: "Student 1", text: "no identifier here" }]);
  });

  it("ignores blank lines", () => {
    expect(answersFromPaste("a|one\n\n  \nb|two")).toHaveLength(2);
  });
});

describe("initialsFor", () => {
  it("takes leading letters across separators", () => {
    expect(initialsFor("Ada Byron Lovelace")).toBe("ABL");
    expect(initialsFor("EEE/022/0103")).toBe("E");
  });

  it("falls back to a dash when there is no letter", () => {
    expect(initialsFor("022 0103")).toBe("—");
  });
});
