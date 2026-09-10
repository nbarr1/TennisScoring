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

interface HermesInternalApi {
  hasPromise?(): boolean;
  enablePromiseRejectionTracker?(options: {
    allRejections: boolean;
    onUnhandled(id: number, rejection: unknown): void;
  }): void;
}

type CrashAnalyticsGlobal = typeof globalThis & {
  ErrorUtils?: ErrorUtilsApi;
  HermesInternal?: HermesInternalApi;
};

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

  const crashAnalyticsGlobal = globalThis as CrashAnalyticsGlobal;
  const hermesInternal = crashAnalyticsGlobal.HermesInternal;
  if (hermesInternal?.hasPromise?.()) {
    hermesInternal.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (id, rejection) => {
        recordError(rejection, `Unhandled promise rejection (id: ${id})`);
      },
    });
  }

  const errorUtils = crashAnalyticsGlobal.ErrorUtils;
  if (!errorUtils) return;

  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    // React Native forwards fatal JS errors to its native exception manager,
    // where Crashlytics captures the resulting fatal crash. Recording it here
    // as well would create a duplicate non-fatal issue.
    if (!isFatal) recordError(error, 'Unhandled JavaScript error');
    previousHandler(error, isFatal);
  });
}
