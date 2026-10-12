import { describe, expect, it } from "vitest";
import { descriptionFromNextJson, expandAttributed, extractJsonAfter, isYouTubeUrl, parseSearchResults, parseVideoId, rankResults } from "@/lib/yt-parse";

describe("parseVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["https://youtube.com/watch?v=3duuGV-D3Wo&t=42s&list=x", "3duuGV-D3Wo"],
    ["https://m.youtube.com/watch?v=3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["https://youtu.be/3duuGV-D3Wo?si=abc", "3duuGV-D3Wo"],
    ["youtu.be/3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["https://www.youtube.com/shorts/3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["https://www.youtube.com/embed/3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["https://www.youtube.com/live/3duuGV-D3Wo?feature=share", "3duuGV-D3Wo"],
    ["https://music.youtube.com/watch?v=3duuGV-D3Wo", "3duuGV-D3Wo"],
    ["3duuGV-D3Wo", "3duuGV-D3Wo"],
  ])("%s", (url, id) => expect(parseVideoId(url)).toBe(id));

  it.each(["https://vimeo.com/123", "https://youtube.com/", "https://youtu.be/", "not a link", "https://evil.com/watch?v=3duuGV-D3Wo", "https://notyoutube.com/watch?v=3duuGV-D3Wo"])("rejects %s", (url) =>
    expect(parseVideoId(url)).toBeNull(),
  );

  it("spots YouTube links in text", () => {
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("palak paneer")).toBe(false);
  });
});

describe("extractJsonAfter", () => {
  it("reads an inline JSON object with braces inside strings", () => {
    const html = `<script>var ytInitialPlayerResponse = {"a":"x { y } \\" z","b":{"c":1}};var other = {};</script>`;
    expect(extractJsonAfter(html, "ytInitialPlayerResponse")).toEqual({ a: 'x { y } " z', b: { c: 1 } });
  });
  it("returns null when missing or broken", () => {
    expect(extractJsonAfter("nothing here", "ytInitialPlayerResponse")).toBeNull();
    expect(extractJsonAfter("ytInitialPlayerResponse = {bad}", "ytInitialPlayerResponse")).toBeNull();
  });
});

const redirect = (q: string) => ({ onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: `https://www.youtube.com/redirect?event=video_description&q=${encodeURIComponent(q)}` } } } } });

describe("descriptions from the watch-next API", () => {
  it("replaces truncated link labels with the real URLs", () => {
    const content = "full recipe: https://site.com/tiffin-sam...\n‪@channel‬";
    const t = expandAttributed({
      content,
      commandRuns: [
        { startIndex: 13, length: 30, ...redirect("https://site.com/tiffin-sambar-recipe/") },
        { startIndex: 45, length: 8, onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: "/@channel" } } } } },
      ],
    });
    expect(t).toBe("full recipe: https://site.com/tiffin-sambar-recipe/\n@channel");
  });
  it("picks the longest description in the response", () => {
    const json = { a: [{ attributedDescription: { content: "short" } }, { x: { attributedDescriptionBodyText: { content: "the longer one" } } }] };
    expect(descriptionFromNextJson(json)).toBe("the longer one");
    expect(descriptionFromNextJson({})).toBe("");
  });
});

describe("search results", () => {
  const vr = (id: string, title: string, channel: string, length = "8:30") => ({ videoRenderer: { videoId: id, title: { runs: [{ text: title }] }, ownerText: { runs: [{ text: channel }] }, lengthText: { simpleText: length } } });
  const json = {
    contents: [
      vr("aaaaaaaaaaa", "Palak paneer | quick", "Random Cook"),
      { reelShelfRenderer: { items: [vr("rrrrrrrrrrr", "short", "X", "0:30")] } },
      vr("bbbbbbbbbbb", "Palak Paneer Recipe", "Hebbars Kitchen"),
      vr("aaaaaaaaaaa", "dupe", "Random Cook"),
      vr("ccccccccccc", "palak teaser", "Someone", "0:45"),
    ],
  };
  it("skips Shorts, duplicates and very short clips", () => {
    expect(parseSearchResults(json).map((r) => r.id)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  });
  it("ranks channels that publish measured recipes first", () => {
    expect(rankResults(parseSearchResults(json))[0].channel).toBe("Hebbars Kitchen");
  });
});
