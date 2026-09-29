/**
 * Metro TRV11 2.0.0 — ONDC catalog ↔ CityOne domain mapper.
 *
 * Translates raw ONDC message structures into CityOne-friendly objects
 * for storage in the order store and serving to the frontend.
 */

/**
 * Parse on_search catalog into a list of route options for the frontend.
 *
 * Each option is:
 * {
 *   bppId, bppUri,
 *   providerId, providerName,
 *   itemId, itemName, itemCode, fareValue, fareCurrency,
 *   fulfillmentId,
 *   fromStation: { code, name, gps },
 *   toStation:   { code, name, gps },
 *   validityDuration,
 * }
 */
export function parseOnSearch(body) {
  const catalog = body?.message?.catalog;
  if (!catalog) return [];

  const { bpp_id: bppId, bpp_uri: bppUri } = body.context ?? {};
  const options = [];

  for (const provider of catalog.providers ?? []) {
    const providerId = provider.id;
    const providerName = provider.descriptor?.name ?? providerId;

    const fulfillmentMap = buildFulfillmentMap(provider.fulfillments ?? []);

    for (const item of provider.items ?? []) {
      const itemId = item.id;
      const itemName = item.descriptor?.name ?? itemId;
      const itemCode = item.descriptor?.code ?? null;
      const fareValue = item.price?.value ?? null;
      const fareCurrency = item.price?.currency ?? 'INR';
      const validityDuration = item.time?.duration ?? null;

      const fIds = item.fulfillment_ids ?? [item.fulfillment_id].filter(Boolean);
      if (fIds.length === 0) fIds.push(null);

      for (const fId of fIds) {
        const ful = fId ? fulfillmentMap.get(fId) : null;

        const stops = ful?.stops ?? [];
        const startStop = stops.find(s => s.type === 'START');
        const endStop = stops.find(s => s.type === 'END');

        options.push({
          bppId,
          bppUri,
          providerId,
          providerName,
          itemId,
          itemName,
          itemCode,
          fareValue,
          fareCurrency,
          fulfillmentId: fId,
          fromStation: extractStation(startStop),
          toStation: extractStation(endStop),
          validityDuration,
        });
      }
    }
  }

  return options;
}

/**
 * Parse on_select quote into a structured fare breakdown.
 */
export function parseOnSelect(body) {
  const order = body?.message?.order;
  if (!order) return null;

  const quote = order.quote ?? null;
  const payment = (order.payments ?? [])[0] ?? null;

  return {
    totalAmount: quote?.price?.value ?? null,
    currency: quote?.price?.currency ?? 'INR',
    breakup: (quote?.breakup ?? []).map(b => ({
      title: b.title,
      amount: b.price?.value,
      currency: b.price?.currency ?? 'INR',
    })),
    payment,
  };
}

/**
 * Parse on_init into billing, quote, and payment info.
 */
export function parseOnInit(body) {
  const order = body?.message?.order;
  if (!order) return null;

  const payment = (order.payments ?? [])[0] ?? null;

  return {
    billing: order.billing ?? null,
    totalAmount: order.quote?.price?.value ?? null,
    currency: order.quote?.price?.currency ?? 'INR',
    payment,
  };
}

/**
 * Parse on_confirm into order ID and QR ticket data.
 *
 * The QR ticket lives in fulfillments[0].stops[0].authorization:
 * { type: 'QR', token: '<base64 PNG>', valid_to: 'ISO timestamp', status: 'UNCLAIMED' }
 */
export function parseOnConfirm(body) {
  const order = body?.message?.order;
  if (!order) return null;

  const fulfillments = order.fulfillments ?? [];
  const tickets = [];

  for (const ful of fulfillments) {
    for (const stop of ful.stops ?? []) {
      if (stop.authorization?.type === 'QR') {
        tickets.push({
          fulfillmentId: ful.id,
          stopId: stop.id,
          qrBase64: stop.authorization.token,
          validTo: stop.authorization.valid_to,
          status: stop.authorization.status,
          stationName: stop.location?.descriptor?.name ?? null,
          stationCode: stop.location?.descriptor?.code ?? null,
        });
      }
    }
  }

  return {
    orderId: order.id,
    orderStatus: order.status,
    tickets,
    payment: (order.payments ?? [])[0] ?? null,
  };
}

/**
 * Parse on_status into current order state.
 */
export function parseOnStatus(body) {
  return parseOnConfirm(body); // same structure
}

/**
 * Parse on_cancel into seller-initiated cancellation state.
 */
export function parseOnCancel(body) {
  const order = body?.message?.order;
  if (!order) return null;

  return {
    orderId: order.id,
    orderStatus: order.status ?? 'CANCELLED',
    cancellationTerms: order.cancellation_terms ?? null,
    payment: (order.payments ?? [])[0] ?? null,
  };
}

/**
 * Parse on_update into partial-cancellation state.
 *
 * After SOFT_CANCEL: order.status = 'SOFT_CANCEL', quote has REFUND + CANCELLATION_CHARGES
 * After CONFIRM_CANCEL: order.status = 'ACTIVE', cancelled fulfillment has state CANCELLED
 */
export function parseOnUpdate(body) {
  const order = body?.message?.order;
  if (!order) return null;

  const quote = order.quote ?? null;
  const payment = (order.payments ?? [])[0] ?? null;

  const fulfillments = (order.fulfillments ?? []).map(f => ({
    id: f.id,
    type: f.type,
    state: f.state?.descriptor?.code ?? null,
    stops: (f.stops ?? []).map(s => ({
      type: s.type,
      stationName: s.location?.descriptor?.name ?? null,
      stationCode: s.location?.descriptor?.code ?? null,
    })),
  }));

  return {
    orderId: order.id,
    orderStatus: order.status,
    items: (order.items ?? []).map(item => ({
      id: item.id,
      name: item.descriptor?.name ?? null,
      code: item.descriptor?.code ?? null,
      price: item.price?.value ?? null,
      quantity: item.quantity?.selected?.count ?? null,
      fulfillmentIds: item.fulfillment_ids ?? [],
    })),
    fulfillments,
    quote: quote ? {
      totalAmount: quote.price?.value ?? null,
      currency: quote.price?.currency ?? 'INR',
      breakup: (quote.breakup ?? []).map(b => ({
        title: b.title,
        amount: b.price?.value,
        currency: b.price?.currency ?? 'INR',
        itemId: b.item?.id ?? null,
        itemQuantity: b.item?.quantity?.selected?.count ?? null,
        fulfillmentIds: b.item?.fulfillment_ids ?? [],
      })),
    } : null,
    payment,
    cancellationTerms: order.cancellation_terms ?? null,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildFulfillmentMap(fulfillments) {
  const map = new Map();
  for (const f of fulfillments) {
    map.set(f.id, f);
  }
  return map;
}

function extractStation(stop) {
  if (!stop) return null;
  return {
    code: stop.location?.descriptor?.code ?? null,
    name: stop.location?.descriptor?.name ?? null,
    gps: stop.location?.gps ?? null,
  };
}
