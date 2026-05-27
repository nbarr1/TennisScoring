export type LogLevel = 'info' | 'warn' | 'error';

function safeSerialize(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);

    const result = Array.isArray(value)
      ? value.map((item) => safeSerialize(item, seen))
      : Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
            key,
            safeSerialize(nestedValue, seen),
          ]),
        );

    seen.delete(value as object);
    return result;
  }

  return value;
}

export function logStructured(level: LogLevel, message: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(safeSerialize(metadata, new WeakSet<object>()) as Record<string, unknown>),
  };

  let serialized: string;

  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    serialized = JSON.stringify({
      timestamp: payload.timestamp,
      level,
      message: `[SerializationFailed] ${message}`,
      serializationError:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : String(error),
    });
  }

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}
