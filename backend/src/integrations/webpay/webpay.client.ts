import crypto from 'crypto';
import { config } from '../../config';

export interface WebpayFormData {
  formUrl: string;
  fields: Record<string, string>;
}

/**
 * Build a WebPay HTML-form POST payload.
 *
 * Signature (v2): SHA1( seed + storeId + orderNum + test + currency + total + secretKey )
 * wsb_total must use the same decimal format in both the field and the signature string.
 */
export function createWebpayForm(
  orderId: string,
  amount: number,
  currency: string,
  itemName: string,
): WebpayFormData {
  const isTest = config.webpay.sandbox;
  const formUrl = isTest
    ? 'https://securesandbox.webpay.by/'
    : 'https://payment.webpay.by/';

  const seed = crypto.randomBytes(16).toString('hex');
  const totalStr = amount.toFixed(2);
  const testFlag = isTest ? '1' : '0';

  const signStr =
    seed +
    config.webpay.storeId +
    orderId +
    testFlag +
    currency +
    totalStr +
    config.webpay.secretKey;

  const signature = crypto.createHash('sha1').update(signStr, 'utf8').digest('hex');

  const fields: Record<string, string> = {
    '*scart': '',
    wsb_version: '2',
    wsb_storeid: config.webpay.storeId,
    wsb_order_num: orderId,
    wsb_currency_id: currency,
    wsb_test: testFlag,
    wsb_seed: seed,
    wsb_signature: signature,
    wsb_total: totalStr,
    'wsb_invoice_item_name[0]': itemName,
    'wsb_invoice_item_quantity[0]': '1',
    'wsb_invoice_item_price[0]': totalStr,
    wsb_return_url: `${config.frontendUrl}/wallet?status=success&order=${orderId}`,
    wsb_cancel_return_url: `${config.frontendUrl}/wallet?status=fail&order=${orderId}`,
    wsb_notify_url: `${config.appUrl}/api/wallet/webhook/webpay`,
    wsb_language_id: 'russian',
  };

  return { formUrl, fields };
}

/**
 * Verify incoming WebPay notification signature.
 * MD5( batch_timestamp + currency_id + amount + payment_method +
 *       order_id + site_order_id + transaction_id + payment_type + rrn + secretKey )
 */
export function verifyWebpaySignature(
  params: Record<string, string>,
  secretKey: string,
): boolean {
  const {
    batch_timestamp = '',
    currency_id = '',
    amount = '',
    payment_method = '',
    order_id = '',
    site_order_id = '',
    transaction_id = '',
    payment_type = '',
    rrn = '',
    wsb_signature,
  } = params;

  const signStr = [
    batch_timestamp,
    currency_id,
    amount,
    payment_method,
    order_id,
    site_order_id,
    transaction_id,
    payment_type,
    rrn,
  ].join('') + secretKey;

  const expected = crypto.createHash('md5').update(signStr, 'utf8').digest('hex');
  return expected === wsb_signature;
}
