export type CountryCode = {
  code: string;
  name: string;
  dial: string;
};

/** Regional indicator symbol for a country code: "ID" -> the flag emoji. */
export function countryFlag(code: string) {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

/**
 * The dialing list for the application phone field. Indonesia leads because
 * the lab recruits mostly from Universitas Brawijaya, and +62 is the default.
 */
export const COUNTRY_CODES: CountryCode[] = [
  { code: "ID", name: "Indonesia", dial: "+62" },
  { code: "MY", name: "Malaysia", dial: "+60" },
  { code: "SG", name: "Singapore", dial: "+65" },
  { code: "TH", name: "Thailand", dial: "+66" },
  { code: "VN", name: "Vietnam", dial: "+84" },
  { code: "PH", name: "Philippines", dial: "+63" },
  { code: "JP", name: "Japan", dial: "+81" },
  { code: "KR", name: "South Korea", dial: "+82" },
  { code: "CN", name: "China", dial: "+86" },
  { code: "TW", name: "Taiwan", dial: "+886" },
  { code: "IN", name: "India", dial: "+91" },
  { code: "AU", name: "Australia", dial: "+61" },
  { code: "NZ", name: "New Zealand", dial: "+64" },
  { code: "US", name: "United States", dial: "+1" },
  { code: "CA", name: "Canada", dial: "+1" },
  { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "IE", name: "Ireland", dial: "+353" },
  { code: "DE", name: "Germany", dial: "+49" },
  { code: "FR", name: "France", dial: "+33" },
  { code: "NL", name: "Netherlands", dial: "+31" },
  { code: "ES", name: "Spain", dial: "+34" },
  { code: "IT", name: "Italy", dial: "+39" },
  { code: "CH", name: "Switzerland", dial: "+41" },
  { code: "SE", name: "Sweden", dial: "+46" },
  { code: "AE", name: "United Arab Emirates", dial: "+971" },
  { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "EG", name: "Egypt", dial: "+20" },
  { code: "TR", name: "Turkey", dial: "+90" },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0];
