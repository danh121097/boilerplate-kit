/**
 * Unit tests for PasswordService.validatePasswordStrength.
 * No DI bootstrap needed — instantiate directly.
 */
import { describe, expect, it } from "vitest";

import { AppException } from "@/common/exceptions/app.exception";
import { PasswordService } from "@/common/password.service";

const svc = new PasswordService();

describe("PasswordService.validatePasswordStrength", () => {
  describe("valid passwords (must not throw)", () => {
    it.each([
      ["exactly 8 chars with all classes", "Abcde1!x"],
      ["longer valid password", "SecurePass1!"],
      ["special chars: @#$", "Hello1@#$"],
      ["special char: underscore", "Secret_1A"],
    ])("%s", (_label, pwd) => {
      expect(() => svc.validatePasswordStrength(pwd)).not.toThrow();
    });
  });

  describe("too short (< 8 chars)", () => {
    it.each([
      ["empty string", ""],
      ["7 chars", "Abc1!xY"],
      ["1 char", "A"],
    ])("%s → 400 VALIDATION_ERROR", (_label, pwd) => {
      let thrown: unknown;
      try {
        svc.validatePasswordStrength(pwd);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(AppException);
      const err = thrown as AppException;
      expect(err.getStatus()).toBe(400);
    });
  });

  describe("missing character class (length ok but missing complexity)", () => {
    it.each([
      ["no uppercase", "alllower1!"],
      ["no lowercase", "ALLUPPER1!"],
      ["no digit", "NoDigitHere!"],
      ["no special char", "NoSpecial1A"],
    ])("%s → 400 VALIDATION_ERROR", (_label, pwd) => {
      let thrown: unknown;
      try {
        svc.validatePasswordStrength(pwd);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(AppException);
      const err = thrown as AppException;
      expect(err.getStatus()).toBe(400);
    });
  });

  describe("error shape", () => {
    it("too-short error carries VALIDATION_ERROR errorType on the exception", () => {
      let thrown: unknown;
      try {
        svc.validatePasswordStrength("short");
      } catch (e) {
        thrown = e;
      }
      // AppException stores errorType as a direct class property (not inside
      // getResponse()) because super(message, statusCode) stores only the message.
      const err = thrown as AppException;
      expect(err.errorType).toBe("VALIDATION_ERROR");
    });

    it("complexity error message mentions character classes", () => {
      let thrown: unknown;
      try {
        svc.validatePasswordStrength("alllowercase1!");
      } catch (e) {
        thrown = e;
      }
      const err = thrown as AppException;
      expect(err.errorType).toBe("VALIDATION_ERROR");
      // getResponse() returns the raw message string for AppException.
      expect(String(err.getResponse())).toMatch(/uppercase/i);
    });
  });
});
