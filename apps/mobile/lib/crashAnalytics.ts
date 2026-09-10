import { NativeModules, Platform } from 'react-native';

interface CrashAnalyticsNativeModule {
  recordError(message: string, stack?: string): void;
  log(message: string): void;
  setUserId(userId: string | null): void;
}

interface ErrorUtilsApi {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
}

const nativeCrashAnalytics = NativeModules.CrashAnalytics as CrashAnalyticsNativeModule | undefined;
let initialized = false;

export function recordError(error: unknown, context?: string) {
  if (!nativeCrashAnalytics || __DEV__) return;

  const normalized = error instanceof Error ? error : new Error(String(error));
  const message = context ? `${context}: ${normalized.message}` : normalized.message;
  nativeCrashAnalytics.recordError(message, normalized.stack);
}

export function setCrashAnalyticsUser(userId: string | null) {
  if (!nativeCrashAnalytics || __DEV__) return;
  nativeCrashAnalytics.setUserId(userId);
}

export function initializeCrashAnalytics() {
  if (initialized || !nativeCrashAnalytics || __DEV__) return;
  initialized = true;

  nativeCrashAnalytics.log(`Application started on ${Platform.OS}`);

  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
  if (!errorUtils) return;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    recordError(error, isFatal ? 'Fatal JavaScript error' : 'Unhandled JavaScript error');
    previousHandler(error, isFatal);
  });
}
