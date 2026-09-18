import { MarketplaceAdapter } from './base.adapter';
import { WbAdapter, WbCredentials } from './wb/wb.adapter';
import { OzonAdapter, OzonCredentials } from './ozon/ozon.adapter';
import { decrypt } from '../../utils/encryption';

export function createAdapter(platform: string, credentialsEnc: string): MarketplaceAdapter {
  const raw = decrypt(credentialsEnc);
  const creds = JSON.parse(raw);

  switch (platform) {
    case 'wb':
      return new WbAdapter(creds as WbCredentials);
    case 'ozon':
      return new OzonAdapter(creds as OzonCredentials);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
