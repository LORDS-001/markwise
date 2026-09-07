import { describe, expect, it } from "vitest";
import { samplesFromExport } from "@/lib/pipeline/tuning";

describe("samplesFromExport", () => {
  const run = {
    answers: [
      {
        studentId: "student-1",
        isCorrect: false,
        errorSignature: "believes impedance equals resistance",
        clusterId: "pipeline-cluster-1",
      },
      {
        studentId: "student-2",
        isCorrect: false,
        errorSignature: "believes reactance can be ignored",
        clusterId: "pipeline-cluster-1",
      },
    ],
  };

  it("requires independently supplied human labels", () => {
    expect(() => samplesFromExport(run, null)).toThrow(/human labels/i);
  });

  it("uses human labels rather than pipeline cluster ids as truth", () => {
    const samples = samplesFromExport(run, {
      "student-1": "belief-a",
      "student-2": "belief-b",
    });

    expect(samples.map((sample) => sample.truth)).toEqual(["belief-a", "belief-b"]);
  });
});
