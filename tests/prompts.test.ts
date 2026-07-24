import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../src/cursor/prompts.js";
import { resolveModelSelection } from "../src/cursor/models.js";
import type { ModelListItem } from "@cursor/sdk";

describe("extractJsonObject", () => {
  it("parsea JSON puro", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("parsea bloque markdown", () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("extrae objeto embebido", () => {
    expect(extractJsonObject('Here you go:\n{"x":"y"}\nthanks')).toEqual({ x: "y" });
  });
});

describe("resolveModelSelection", () => {
  const models: ModelListItem[] = [
    {
      id: "composer-2.5",
      displayName: "Composer 2.5",
      parameters: [
        {
          id: "fast",
          values: [
            { value: "true", displayName: "Fast" },
            { value: "false", displayName: "Default" },
          ],
        },
      ],
      variants: [
        {
          displayName: "Composer 2.5 Fast",
          params: [{ id: "fast", value: "true" }],
          isDefault: false,
        },
        {
          displayName: "Composer 2.5",
          params: [{ id: "fast", value: "false" }],
          isDefault: true,
        },
      ],
    },
  ];

  it("fallback auto", () => {
    expect(resolveModelSelection(models, "auto")).toEqual({ id: "auto" });
    expect(resolveModelSelection(models, "nope")).toEqual({ id: "auto" });
  });

  it("elige fast para workers", () => {
    expect(resolveModelSelection(models, "composer-2.5", { preferFast: true })).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });
});
