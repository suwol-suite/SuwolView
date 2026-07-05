import type { TFunction } from "i18next";
import type { AppError } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAppError(value: unknown): value is AppError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.messageKey === "string" &&
    (value.details === undefined || typeof value.details === "string")
  );
}

function parseSerializedAppError(message: string): AppError | undefined {
  const objectStart = message.indexOf("{");
  const objectEnd = message.lastIndexOf("}");
  if (objectStart < 0 || objectEnd <= objectStart) return undefined;

  try {
    const parsed = JSON.parse(message.slice(objectStart, objectEnd + 1)) as unknown;
    return isAppError(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getAppError(error: unknown): AppError | undefined {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return parseSerializedAppError(error.message);
  }
  if (typeof error === "string") {
    return parseSerializedAppError(error);
  }
  return undefined;
}

export function formatErrorMessage(error: unknown, t: TFunction): string {
  const appError = getAppError(error);
  if (appError) {
    const message = t(appError.messageKey);
    return appError.details ? `${message}: ${appError.details}` : message;
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return t("errors.unexpected");
}
