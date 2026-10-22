import { copyFile, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';

const services = ['apps/client', 'apps/kitchen', 'apps/analytics', 'apps/admin', 'services/sync', 'services/telegram-bot'];
for (const service of services) {
  for (const mode of ['dev', 'prod']) {
    const target = new URL(`../${service}/.env.${mode}`, import.meta.url);
    try {
      await copyFile(new URL(`${target.href}.example`), target, constants.COPYFILE_EXCL);
      await chmod(target, 0o600);
      console.log(`Created ${service}/.env.${mode}`);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}
