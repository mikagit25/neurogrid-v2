import axios from 'axios';
import { config } from '../../config';

export interface CheckoutResult {
  token: string;
  redirectUrl: string;
}

/**
 * Create a bePaid hosted checkout page.
 * amount is in major currency units (e.g. 100 = 100 RUB / 100 BYN).
 * bePaid API expects amount in minor units (kopecks), so we multiply by 100.
 */
export async function createBepaidCheckout(
  orderId: string,
  amount: number,
  currency: string,
  description: string
): Promise<CheckoutResult> {
  const baseUrl = config.bepaid.sandbox
    ? 'https://checkout-test.bepaid.by'
    : 'https://checkout.bepaid.by';

  const resp = await axios.post(
    `${baseUrl}/ctp/api/checkouts`,
    {
      checkout: {
        test: config.bepaid.sandbox,
        transaction_type: 'payment',
        order: {
          id: orderId,
          currency,
          amount: Math.round(amount * 100),
          description,
        },
        settings: {
          success_url: `${config.frontendUrl}/wallet?status=success&order=${orderId}`,
          fail_url: `${config.frontendUrl}/wallet?status=fail&order=${orderId}`,
          notification_url: `${config.appUrl}/api/wallet/webhook/bepaid`,
          language: 'ru',
        },
      },
    },
    {
      auth: {
        username: config.bepaid.shopId,
        password: config.bepaid.secretKey,
      },
      timeout: 15_000,
    }
  );

  const checkout = resp.data?.checkout;
  if (!checkout?.token || !checkout?.redirect_url) {
    throw new Error('bePaid returned unexpected response');
  }

  return { token: checkout.token, redirectUrl: checkout.redirect_url };
}
