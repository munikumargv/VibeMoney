// JSON-file persistence for the Node server.
import fs from 'node:fs';
import path from 'node:path';

export function fileAdapter(file) {
  return {
    load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null),
    save: (data) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, file);
    },
  };
}
