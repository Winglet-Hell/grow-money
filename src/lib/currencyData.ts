// Small hand-maintained tables that complement the live currency catalogue.
//
// The full list of codes and their display names is NOT kept here — it is fetched at
// runtime from currency-api (see currencies.ts), the same source already used for rates.
// That way a newly listed coin or currency shows up in the pickers on its own, without a
// code change. These tables only cover what the API cannot tell us: which codes are fiat
// vs. tokens, which are dead, and which deserve to be pinned to the top of the list.

// Codes are stored as space-separated strings purely to keep this file readable.
const list = (s: string) => s.trim().split(/\s+/);

// Precious metals, quoted per troy ounce. ISO-like codes, but not spendable money.
export const METAL_CODES = list('XAU XAG XPT XPD');

// Real circulating money that Intl's ISO 4217 table does not include, so it would
// otherwise be mistaken for a token.
export const EXTRA_FIAT_CODES = list('CNH GGP IMP JEP TVD SPL XDR');

// Withdrawn currencies the API still serves for historical conversions. Hidden from the
// pickers unless an account already uses one.
export const LEGACY_CODES = list(`
  ATS AZM BEF BYR CYP DEM EEK ESP FIM FRF GHC GRD IEP ITL LTL LUF LVL MGF MRO MTL MZM
  NLG PTE ROL SDD SIT SKK SRG STD TMM TRL VAL VEB VED VEF MXV ZMK ZWD
`);

// Aliases the API serves alongside their canonical code.
export const ALIAS_CODES: Record<string, string> = { XBT: 'BTC' };

// Pinned to the top of every picker: what this app is actually used with day to day.
export const POPULAR_CODES = list('RUB THB USD USDT USDC EUR BTC ETH GEL AED MYR IDR VND PHP KRW HKD GBP TRY KZT AMD RSD');

// Enough of a catalogue to keep the pickers usable before the network responds, or when
// it is unreachable. Everything else is filled in from the API.
export const FALLBACK_NAMES: Record<string, string> = {
    RUB: 'Russian Ruble', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound',
    THB: 'Thai Baht', GEL: 'Georgian Lari', AED: 'Emirati Dirham', TRY: 'Turkish Lira',
    MYR: 'Malaysian Ringgit', IDR: 'Indonesian Rupiah', VND: 'Vietnamese Dong',
    PHP: 'Philippine Peso', KRW: 'South Korean Won', HKD: 'Hong Kong Dollar',
    SGD: 'Singapore Dollar', JPY: 'Japanese Yen', CNY: 'Chinese Yuan', INR: 'Indian Rupee',
    KZT: 'Kazakhstani Tenge', AMD: 'Armenian Dram', RSD: 'Serbian Dinar', UAH: 'Ukrainian Hryvnia',
    CHF: 'Swiss Franc', CAD: 'Canadian Dollar', AUD: 'Australian Dollar', PLN: 'Polish Zloty',
    USDT: 'Tether', USDC: 'USD Coin', BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana',
    TON: 'Toncoin', TRX: 'TRON', BNB: 'Binance Coin', XMR: 'Monero', DAI: 'DAI',
    XAU: 'Gold Ounce', XAG: 'Silver Ounce',
};

// Codes the app should offer even when the rates API does not carry them. They get a
// "no live rate" marker instead of a bogus 1:1 valuation.
export const EXTRA_CRYPTO_CODES = list('TON WBTC WETH TIA SEI JUP WLD FET PYUSD USDE ENA RENDER NOT');

// Three-letter codes that double as ordinary English words. Never inferred from an
// account name — only honoured when explicitly chosen.
export const AMBIGUOUS_CODES = new Set(list('ALL ANG BOB CUP LAK MOP PAB SOS TOP TRY WST GEL ONE NFT VAL HOT AMP APE'));

// ISO 4217 currencies with no minor unit, plus the three-decimal Gulf dinars.
export const ZERO_DECIMAL_FIAT = new Set(list('BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX VND VUV XAF XOF XPF'));
export const THREE_DECIMAL_FIAT = new Set(list('BHD IQD JOD KWD LYD OMR TND'));
