import { describe, expect, it } from "vitest";
import i18n from ".";
import { formatErrorMessage, getAppError } from "./errors";

describe("i18n errors", () => {
  it("formats messageKey-based errors through the active language", async () => {
    await i18n.changeLanguage("en");
    expect(formatErrorMessage({ code: "DECODE_FAILED", messageKey: "errors.decodeFailed" }, i18n.t)).toBe(
      "Unable to decode this image"
    );

    await i18n.changeLanguage("ko");
    expect(formatErrorMessage({ code: "DECODE_FAILED", messageKey: "errors.decodeFailed" }, i18n.t)).toBe(
      "이 이미지를 디코딩할 수 없습니다"
    );
  });

  it("extracts serialized app errors from IPC error messages", () => {
    const serialized = 'Error invoking remote method: {"code":"INVALID_LANGUAGE","messageKey":"errors.invalidLanguage"}';
    expect(getAppError(new Error(serialized))).toEqual({
      code: "INVALID_LANGUAGE",
      messageKey: "errors.invalidLanguage"
    });
  });
});
