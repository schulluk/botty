// Logger for the whole bot: logger.info(component, message, data) and friends.
//
// By default every record is the standard log line of all apps on medan.schulze.uno:
//
//   2026-10-24 08:50:21 INFO     Transcription: Processing voice message messageId=3EB0C431
//
// Swiss local time (Europe/Zurich) whatever the process time zone is, the level padded to 8,
// "Component: message", then data as key=value pairs (values with spaces, quotes or = are
// JSON-quoted, objects are JSON). errorWithStack writes the stack on the following lines; Alloy
// keys on the leading timestamp to keep them in one record, and reads the level after it.
//
// LOG_FORMAT=json writes one JSON object per line instead. LOG_LEVEL: debug, info (default),
// warn or error.

const LOG_FORMAT = (process.env.LOG_FORMAT || 'std').toLowerCase();
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Level names of the standard line (Python's logging names)
const LEVEL_NAMES = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR'
};

const minLevel = LEVELS[LOG_LEVEL === 'warning' ? 'warn' : LOG_LEVEL] ?? LEVELS.info;

// sv-SE writes "2026-10-24 08:50:21"
const swissTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

function shouldLog(level) {
  return LEVELS[level] >= minLevel;
}

// Bare unless the value would run into the next pair (whitespace, quotes, =, control characters)
function formatValue(value) {
  if (typeof value === 'string') {
    return value === '' || /[\s"=\\\x00-\x1f\x7f]/.test(value) ? JSON.stringify(value) : value;
  }
  if (value === null || typeof value !== 'object') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value); // circular structure
  }
}

function formatStd(level, component, message, data, stack) {
  const pairs = Object.entries(data ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}=${formatValue(value)}`)
    .join('');
  const line = `${swissTime.format(new Date())} ${LEVEL_NAMES[level].padEnd(8)} ${component}: ${message}${pairs}`;
  return stack ? `${line}\n${stack}` : line;
}

function formatJson(level, component, message, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data
  };
  return JSON.stringify(entry);
}

function log(level, component, message, data = {}, stack = undefined) {
  if (!shouldLog(level)) return;

  const output = LOG_FORMAT === 'json'
    ? formatJson(level, component, message, stack === undefined ? data : { ...data, stack })
    : formatStd(level, component, message, data, stack);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (component, message, data) => log('debug', component, message, data),
  info: (component, message, data) => log('info', component, message, data),
  warn: (component, message, data) => log('warn', component, message, data),
  error: (component, message, data) => log('error', component, message, data),

  // Logs the error's message as error=..., and its stack on the lines after the record
  errorWithStack: (component, message, error, data = {}) => {
    log('error', component, message, { ...data, error: error?.message ?? String(error) }, error?.stack);
  }
};
