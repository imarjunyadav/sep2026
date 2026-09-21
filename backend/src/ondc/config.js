export const ondcConfig = {
  subscriberId: process.env.ONDC_SUBSCRIBER_ID || null,
  subscriberUrl: process.env.ONDC_SUBSCRIBER_URL || null,
  uniqueKeyId: process.env.ONDC_UNIQUE_KEY_ID || null,
  signingPrivateKey: process.env.ONDC_SIGNING_PRIVATE_KEY || null,
  signingPublicKey: process.env.ONDC_SIGNING_PUBLIC_KEY || null,
  encryptionPrivateKey: process.env.ONDC_ENCRYPTION_PRIVATE_KEY || null,
  encryptionPublicKey: process.env.ONDC_ENCRYPTION_PUBLIC_KEY || null,
  registryUrl: process.env.ONDC_REGISTRY_URL || 'https://preprod.registry.ondc.org',
  gatewayUrl: process.env.ONDC_GATEWAY_URL || 'https://preprod.gateway.ondc.org',
  env: process.env.ONDC_ENV || 'uat',
  // When true, confirm uses a generated UUID as payment transaction_id (for Pramaan testing)
  mockPayment: process.env.ONDC_MOCK_PAYMENT === 'true',
  // BUYER_FINDER_FEES from TRV11 2.0.0 spec examples (1% configurable)
  buyerFinderFeesPct: process.env.ONDC_BUYER_FINDER_FEES_PCT || '1',
  staticTermsUrl: process.env.ONDC_STATIC_TERMS_URL || null,
  courtJurisdiction: process.env.ONDC_COURT_JURISDICTION || 'Mumbai',
};
