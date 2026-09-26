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
  mockPayment: process.env.ONDC_MOCK_PAYMENT === 'true',
  buyerFinderFeesPct: process.env.ONDC_BUYER_FINDER_FEES_PCT || '1',
  staticTermsUrl: process.env.ONDC_STATIC_TERMS_URL || null,
  courtJurisdiction: process.env.ONDC_COURT_JURISDICTION || 'Mumbai',
  // Skip inbound signature verification (for Workbench/Pramaan testing where
  // the sender's key may not be in the preprod registry)
  skipAuthVerification: process.env.ONDC_SKIP_AUTH_VERIFICATION === 'true',
};
