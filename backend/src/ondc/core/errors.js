// ONDC error codes from TRV11 2.0.0 error_codes/index.yaml
export const ErrCode = Object.freeze({
  INVALID_REQUEST: '30000',
  INVALID_SIGNATURE: '30001',
  INTERNAL_ERROR: '50000',
  POLICY_ERROR: '40000',
  INVALID_ORDER_STATE: '91201',
  INVALID_FULFILLMENT_STATE: '91202',
  INVALID_FULFILLMENT_ID: '91203',
  INVALID_ITEM_ID: '91204',
  INVALID_QUANTITY: '91205',
  INVALID_CATEGORY_ID: '91206',
  INVALID_STOP: '91207',
  INVALID_LOCATION: '91208',
  INVALID_PAYMENT_STATUS: '91209',
  ORDER_CONFIRMATION_FAILED: '91210',
  INVALID_VEHICLE: '91211',
  INVALID_PROVIDER: '91212',
  DUPLICATE_MESSAGE_ID: '91213',
  DUPLICATE_TRANSACTION_ID: '91214',
  INVALID_TIME: '91215',
  INVALID_DESCRIPTOR: '91216',
  INVALID_AGENT: '91217',
});

export function ack() {
  return { message: { ack: { status: 'ACK' } } };
}

export function nack(type, code, message) {
  return {
    message: { ack: { status: 'NACK' } },
    error: { type, code: String(code), message },
  };
}
