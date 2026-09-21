// Static catalog of Mumbai Suburban Railway stations.
// Station codes are verified against the RailRadar API (August 2026).
// Coordinates are WGS84 centre-of-platform approximations.
// Lines: CR = Central Railway, WR = Western Railway, HL = Harbour Line
// CR/HL marks stations shared by both lines (CSMT–Sandhurst Road corridor).

export const MUMBAI_LOCAL_STATIONS = [
  // ── Central Railway – Main Line ───────────────────────────────────────────
  // Codes verified via train 97399 (CSMT→TNA) and 97251 (CSMT→DI) routes
  { code: 'CSMT', name: 'Mumbai CST',       lat: 18.9398, lng: 72.8354, line: 'CR/HL' },
  { code: 'MSD',  name: 'Masjid',           lat: 18.9461, lng: 72.8374, line: 'CR/HL' },
  { code: 'SNRD', name: 'Sandhurst Road',   lat: 18.9534, lng: 72.8377, line: 'CR/HL' },
  { code: 'BY',   name: 'Byculla',          lat: 18.9617, lng: 72.8365, line: 'CR'    },
  { code: 'CHG',  name: 'Chinchpokli',      lat: 18.9693, lng: 72.8362, line: 'CR'    },
  { code: 'CRD',  name: 'Currey Road',      lat: 18.9761, lng: 72.8351, line: 'CR'    },
  { code: 'PR',   name: 'Parel',            lat: 18.9904, lng: 72.8369, line: 'CR'    },
  { code: 'DR',   name: 'Dadar (CR)',       lat: 19.0181, lng: 72.8421, line: 'CR'    },
  { code: 'MTN',  name: 'Matunga (CR)',     lat: 19.0287, lng: 72.8511, line: 'CR'    },
  { code: 'SION', name: 'Sion',             lat: 19.0444, lng: 72.8566, line: 'CR'    },
  { code: 'CLA',  name: 'Kurla',            lat: 19.0653, lng: 72.8799, line: 'CR/HL' },
  { code: 'VVH',  name: 'Vidyavihar',       lat: 19.0773, lng: 72.9025, line: 'CR'    },
  { code: 'GC',   name: 'Ghatkopar',        lat: 19.0868, lng: 72.9095, line: 'CR'    },
  { code: 'VK',   name: 'Vikhroli',         lat: 19.1093, lng: 72.9254, line: 'CR'    },
  { code: 'KJRD', name: 'Kanjurmarg',       lat: 19.1295, lng: 72.9403, line: 'CR'    },
  { code: 'BND',  name: 'Bhandup',          lat: 19.1443, lng: 72.9455, line: 'CR'    },
  { code: 'NHU',  name: 'Nahur',            lat: 19.1546, lng: 72.9467, line: 'CR'    },
  { code: 'MLND', name: 'Mulund',           lat: 19.1724, lng: 72.9601, line: 'CR'    },
  { code: 'TNA',  name: 'Thane',            lat: 19.1891, lng: 72.9756, line: 'CR'    },
  { code: 'KLVA', name: 'Kalwa',            lat: 19.2048, lng: 72.9886, line: 'CR'    },
  { code: 'MBQ',  name: 'Mumbra',           lat: 19.2038, lng: 73.0175, line: 'CR'    },
  { code: 'DIVA', name: 'Diva',             lat: 19.2111, lng: 73.0422, line: 'CR'    },
  { code: 'KOPR', name: 'Kopar',            lat: 19.2196, lng: 73.0585, line: 'CR'    },
  { code: 'DI',   name: 'Dombivli',         lat: 19.2186, lng: 73.0869, line: 'CR'    },

  // ── Western Railway ───────────────────────────────────────────────────────
  // Codes verified via train 91037 (CCG→BVI) and 92169 (ADH→VR) routes
  { code: 'CCG',  name: 'Churchgate',       lat: 18.9322, lng: 72.8264, line: 'WR' },
  { code: 'MEL',  name: 'Marine Lines',     lat: 18.9393, lng: 72.8268, line: 'WR' },
  { code: 'CYR',  name: 'Charni Road',      lat: 18.9499, lng: 72.8220, line: 'WR' },
  { code: 'GTR',  name: 'Grant Road',       lat: 18.9645, lng: 72.8155, line: 'WR' },
  { code: 'BCL',  name: 'Mumbai Central',   lat: 18.9696, lng: 72.8185, line: 'WR' },
  { code: 'MX',   name: 'Mahalaxmi',        lat: 18.9829, lng: 72.8196, line: 'WR' },
  { code: 'PL',   name: 'Lower Parel',      lat: 18.9920, lng: 72.8198, line: 'WR' },
  { code: 'PBHD', name: 'Prabhadevi',       lat: 18.9964, lng: 72.8215, line: 'WR' },
  { code: 'DDR',  name: 'Dadar (WR)',       lat: 19.0176, lng: 72.8413, line: 'WR' },
  { code: 'MRU',  name: 'Matunga Road',     lat: 19.0283, lng: 72.8368, line: 'WR' },
  { code: 'MM',   name: 'Mahim Junction',   lat: 19.0437, lng: 72.8458, line: 'WR' },
  { code: 'BA',   name: 'Bandra',           lat: 19.0548, lng: 72.8393, line: 'WR' },
  { code: 'KHAR', name: 'Khar Road',        lat: 19.0726, lng: 72.8398, line: 'WR' },
  { code: 'STC',  name: 'Santacruz',        lat: 19.0816, lng: 72.8359, line: 'WR' },
  { code: 'VLP',  name: 'Vile Parle',       lat: 19.0980, lng: 72.8330, line: 'WR' },
  { code: 'ADH',  name: 'Andheri',          lat: 19.1120, lng: 72.8487, line: 'WR' },
  { code: 'JOS',  name: 'Jogeshwari',       lat: 19.1337, lng: 72.8500, line: 'WR' },
  { code: 'RMAR', name: 'Ram Mandir',       lat: 19.1460, lng: 72.8552, line: 'WR' },
  { code: 'GMN',  name: 'Goregaon',         lat: 19.1619, lng: 72.8472, line: 'WR' },
  { code: 'MDD',  name: 'Malad',            lat: 19.1869, lng: 72.8484, line: 'WR' },
  { code: 'KILE', name: 'Kandivali',        lat: 19.2041, lng: 72.8498, line: 'WR' },
  { code: 'BVI',  name: 'Borivali',         lat: 19.2321, lng: 72.8563, line: 'WR' },
  { code: 'DIC',  name: 'Dahisar',          lat: 19.2584, lng: 72.8563, line: 'WR' },
  { code: 'MIRA', name: 'Mira Road',        lat: 19.2956, lng: 72.8663, line: 'WR' },
  { code: 'BYR',  name: 'Bhayander',        lat: 19.3035, lng: 72.8642, line: 'WR' },
  { code: 'NIG',  name: 'Naigaon',          lat: 19.3521, lng: 72.8539, line: 'WR' },
  { code: 'BSR',  name: 'Vasai Road',       lat: 19.3773, lng: 72.8278, line: 'WR' },
  { code: 'NSP',  name: 'Nala Sopara',      lat: 19.4142, lng: 72.8096, line: 'WR' },
  { code: 'VR',   name: 'Virar',            lat: 19.4648, lng: 72.8031, line: 'WR' },

  // ── Harbour Line ─────────────────────────────────────────────────────────
  // Codes verified via train 98176 (PNVL→CSMT) route
  // CSMT, MSD, SNRD, CLA are shared with CR above; not duplicated here
  { code: 'DKRD', name: 'Dockyard Road',    lat: 18.9479, lng: 72.8438, line: 'HL' },
  { code: 'RRD',  name: 'Reay Road',        lat: 18.9552, lng: 72.8468, line: 'HL' },
  { code: 'CTGN', name: 'Cotton Green',     lat: 18.9634, lng: 72.8537, line: 'HL' },
  { code: 'SVE',  name: 'Sewri',            lat: 18.9729, lng: 72.8582, line: 'HL' },
  { code: 'VDLR', name: 'Wadala Road',      lat: 19.0149, lng: 72.8520, line: 'HL' },
  { code: 'GTBN', name: 'GTB Nagar',        lat: 19.0256, lng: 72.8592, line: 'HL' },
  { code: 'CHF',  name: 'Chunnabhatti',     lat: 19.0400, lng: 72.8730, line: 'HL' },
  { code: 'TKNG', name: 'Tilaknagar',       lat: 19.0693, lng: 72.8879, line: 'HL' },
  { code: 'CMBR', name: 'Chembur',          lat: 19.0618, lng: 72.8998, line: 'HL' },
  { code: 'GV',   name: 'Govandi',          lat: 19.0495, lng: 72.9134, line: 'HL' },
  { code: 'MNKD', name: 'Mankhurd',         lat: 19.0396, lng: 72.9259, line: 'HL' },
  { code: 'VSH',  name: 'Vashi',            lat: 19.0754, lng: 72.9989, line: 'HL' },
  { code: 'SNCR', name: 'Sanpada',          lat: 19.0656, lng: 73.0124, line: 'HL' },
  { code: 'JNJ',  name: 'Jui Nagar',        lat: 19.0408, lng: 73.0155, line: 'HL' },
  { code: 'NEU',  name: 'Nerul',            lat: 19.0319, lng: 73.0148, line: 'HL' },
  { code: 'SWDV', name: 'Seawoods',         lat: 19.0175, lng: 73.0150, line: 'HL' },
  { code: 'BEPR', name: 'Belapur CBD',      lat: 19.0241, lng: 73.0349, line: 'HL' },
  { code: 'KHAG', name: 'Kharghar',         lat: 19.0475, lng: 73.0698, line: 'HL' },
  { code: 'MANR', name: 'Mansarovar',       lat: 19.0614, lng: 73.0809, line: 'HL' },
  { code: 'KNDS', name: 'Khandeshwar',      lat: 19.0742, lng: 73.0928, line: 'HL' },
  { code: 'PNVL', name: 'Panvel',           lat: 18.9965, lng: 73.1100, line: 'HL' },
];

export const STATION_BY_CODE = Object.fromEntries(
  MUMBAI_LOCAL_STATIONS.map(s => [s.code, s])
);
