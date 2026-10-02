import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { mapBodyParserError } from "@/common/filters/map-body-parser-error";

const RAW = 'raw parser text: unsupported content encoding "x-evil" /secret/path';

function parserError(type: string, status: number): Error {
  return Object.assign(new Error(RAW), { type, status, statusCode: status, expose: true });
}

describe("mapBodyParserError", () => {
  it.each([
    ["entity.too.large", 413, 413],
    ["entity.parse.failed", 400, 400],
    ["entity.verify.failed", 403, 400],
    ["request.aborted", 400, 400],
    ["request.size.invalid", 400, 400],
    ["stream.not.readable", 500, 400],
    ["stream.encoding.set", 500, 400],
    ["parameters.too.many", 413, 400],
    ["encoding.unsupported", 415, 415],
    ["charset.unsupported", 415, 415],
    ["encoding.something.new", 415, 415],
    ["request.something.new", 400, 400],
  ])(
    "maps %s (parser status %i) to %i VALIDATION_ERROR with a fixed message",
    (type, status, expected) => {
      const mapped = mapBodyParserError(parserError(type, status));
      expect(mapped).toBeDefined();
      expect(mapped!.getStatus()).toBe(expected);
      expect(mapped!.message).not.toContain("raw parser");
      expect(mapped!.message).not.toContain("x-evil");
      expect(JSON.stringify(mapped!.getResponse())).not.toContain("raw parser");
      expect((mapped as unknown as { errorType: string }).errorType).toBe("VALIDATION_ERROR");
    },
  );

  it.each([
    ["encoding.unsupported", "Unsupported request content encoding!"],
    ["charset.unsupported", "Unsupported request charset!"],
    ["request.aborted", "Request body could not be read!"],
    ["request.size.invalid", "Request body could not be read!"],
    ["stream.encoding.set", "Request body could not be read!"],
    ["parameters.too.many", "Request body could not be read!"],
  ])("uses the agreed message for %s", (type, message) => {
    expect(mapBodyParserError(parserError(type, 400))!.message).toBe(message);
  });

  it("maps an untyped 4xx stream error (corrupt compressed body) without echoing zlib text", () => {
    const zlib = Object.assign(new Error("incorrect header check"), {
      code: "Z_DATA_ERROR",
      status: 400,
      statusCode: 400,
      expose: true,
    });
    const mapped = mapBodyParserError(zlib);
    expect(mapped!.getStatus()).toBe(400);
    expect(mapped!.message).toBe("Request body could not be read!");
    expect(JSON.stringify(mapped!.getResponse())).not.toContain("header check");
  });

  it.each([
    ["no type", new Error("boom")],
    ["untyped 5xx", Object.assign(new Error("x"), { status: 500 })],
    ["an HttpException", new BadRequestException("nope")],
    ["unrelated type", Object.assign(new Error("x"), { type: "custom", status: 400 })],
    ["parser-looking 5xx without a table entry", parserError("stream.something.new", 500)],
    ["non-object", "boom"],
  ])("ignores %s", (_label, error) => {
    expect(mapBodyParserError(error)).toBeUndefined();
  });
});
