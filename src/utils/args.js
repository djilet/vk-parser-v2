export function parseArgs(argv = process.argv.slice(2)) {
  /** @type {Record<string, string | boolean>} */
  const result = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        result[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
        continue;
      }

      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}
