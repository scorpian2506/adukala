import { describe, expect, it } from "vitest";
import { clock, formatDuration, formatQty, roundQty, speakQty, unitLabel } from "@/lib/format";

describe("quantities", () => {
  it("snaps spoon measures to real spoon fractions", () => {
    expect(formatQty(0.25, "tsp")).toBe("¼ tsp");
    expect(formatQty(0.125, "tsp")).toBe("⅛ tsp");
    expect(formatQty(1.5, "tbsp")).toBe("1½ tbsp");
    expect(formatQty(0.33, "cup")).toBe("⅓ cup");
    expect(formatQty(0.7, "tsp")).toBe("¾ tsp");
  });
  it("never shows zero for a tiny spoon amount", () => {
    expect(formatQty(0.01, "tsp")).toBe("⅛ tsp");
  });
  it("pluralises cups only", () => {
    expect(formatQty(2, "cup")).toBe("2 cups");
    expect(formatQty(1, "cup")).toBe("1 cup");
    expect(formatQty(2, "tsp")).toBe("2 tsp");
  });
  it("rounds grams and millilitres sensibly", () => {
    expect(roundQty(147, "g")).toBe(145);
    expect(roundQty(833, "ml")).toBe(830);
    expect(roundQty(7.3, "g")).toBe(7.5);
    expect(roundQty(23.4, "g")).toBe(23);
  });
  it("keeps whole items whole (or halves), never zero", () => {
    expect(formatQty(1, "pc")).toBe("1");
    expect(formatQty(0.2, "pc")).toBe("1");
    expect(formatQty(2.5, "pc")).toBe("2½");
    expect(unitLabel(3, "pc")).toBe("");
  });
  it("reads quantities aloud in words", () => {
    expect(speakQty(0.5, "tsp")).toBe("half teaspoon");
    expect(speakQty(1.5, "tbsp")).toBe("1 and a half tablespoons");
    expect(speakQty(200, "ml")).toBe("200 millilitres");
    expect(speakQty(2, "pc")).toBe("2");
  });
});

describe("time", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(90)).toBe("1 min 30 s");
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(28800)).toBe("8 hr");
    expect(formatDuration(5400)).toBe("1 hr 30 min");
  });
  it("formats a countdown clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(59.2)).toBe("1:00");
    expect(clock(605)).toBe("10:05");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(-3)).toBe("0:00");
  });
});
