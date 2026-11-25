// Postman dynamic variables ({{$guid}}, {{$randomEmail}}, …). Each reference yields a fresh value.

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const int = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const hex = (n: number) => Array.from({ length: n }, () => int(0, 15).toString(16)).join('');
const alnum = (n: number) => Array.from({ length: n }, () => pick('abcdefghijklmnopqrstuvwxyz0123456789'.split(''))).join('');

const FIRST = ['James', 'Mary', 'John', 'Linda', 'Ahmad', 'Siti', 'Budi', 'Dewi', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'Rizky', 'Putri', 'David', 'Sarah', 'Agus', 'Rina', 'Daniel', 'Laura'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Santoso', 'Wijaya', 'Hidayat', 'Pratama', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Saputra', 'Kurniawan', 'Taylor', 'Anderson'];
const WORDS = ['alpha', 'bravo', 'cloud', 'delta', 'ember', 'falcon', 'galaxy', 'harbor', 'island', 'jungle', 'kernel', 'lunar', 'matrix', 'nebula', 'orbit', 'pixel', 'quartz', 'river', 'signal', 'tundra', 'vector', 'willow', 'zenith'];
const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
const CITIES = ['Jakarta', 'Bandung', 'Surabaya', 'London', 'Paris', 'Tokyo', 'New York', 'Berlin', 'Sydney', 'Singapore', 'Toronto', 'Seoul'];
const COUNTRIES: [string, string][] = [['Indonesia', 'ID'], ['United States', 'US'], ['United Kingdom', 'GB'], ['Japan', 'JP'], ['Germany', 'DE'], ['France', 'FR'], ['Australia', 'AU'], ['Singapore', 'SG'], ['Canada', 'CA'], ['Brazil', 'BR']];
const STREETS = ['Main St', 'Oak Ave', 'Jl. Sudirman', 'Jl. Merdeka', 'Park Lane', 'Maple Rd', 'Elm St', 'Sunset Blvd'];
const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark Industries', 'Wayne Enterprises', 'Nusantara Digital'];
const SUFFIX = ['Inc', 'LLC', 'Group', 'Ltd', 'PT', 'Corp'];
const JOBS = ['Engineer', 'Designer', 'Manager', 'Analyst', 'Developer', 'Consultant', 'Architect', 'Director'];
const DOMAINS = ['com', 'net', 'org', 'io', 'dev', 'co.id'];
const COLORS = ['red', 'green', 'blue', 'orange', 'purple', 'yellow', 'teal', 'black', 'white', 'gray'];
const CURRENCIES = ['USD', 'EUR', 'IDR', 'JPY', 'GBP', 'SGD', 'AUD'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EXTS: [string, string][] = [['pdf', 'application/pdf'], ['png', 'image/png'], ['jpg', 'image/jpeg'], ['json', 'application/json'], ['txt', 'text/plain'], ['csv', 'text/csv'], ['zip', 'application/zip']];
const AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'
];

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
}

const days = (n: number) => n * 86400000;

const GENERATORS: Record<string, () => string> = {
  $guid: uuid,
  $uuid: uuid,
  $randomUUID: uuid,
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(int(0, 1000)),
  $randomAlphaNumeric: () => alnum(1),
  $randomBoolean: () => String(Math.random() < 0.5),
  $randomColor: () => pick(COLORS),
  $randomHexColor: () => `#${hex(6)}`,
  $randomAbbreviation: () => pick(['API', 'HTTP', 'JSON', 'SQL', 'TCP', 'XML', 'SMS', 'RAM', 'CSS']),
  $randomIP: () => `${int(1, 254)}.${int(0, 255)}.${int(0, 255)}.${int(1, 254)}`,
  $randomIPV6: () => Array.from({ length: 8 }, () => hex(4)).join(':'),
  $randomMACAddress: () => Array.from({ length: 6 }, () => hex(2)).join(':'),
  $randomPassword: () => alnum(15),
  $randomLocale: () => pick(['en', 'id', 'fr', 'de', 'ja', 'es']),
  $randomUserAgent: () => pick(AGENTS),
  $randomProtocol: () => pick(['http', 'https']),
  $randomSemver: () => `${int(0, 9)}.${int(0, 20)}.${int(0, 30)}`,
  $randomFirstName: () => pick(FIRST),
  $randomLastName: () => pick(LAST),
  $randomFullName: () => `${pick(FIRST)} ${pick(LAST)}`,
  $randomNamePrefix: () => pick(['Mr.', 'Mrs.', 'Ms.', 'Dr.']),
  $randomNameSuffix: () => pick(['Jr.', 'Sr.', 'II', 'III', 'PhD']),
  $randomJobTitle: () => `${pick(['Senior', 'Lead', 'Junior', 'Principal'])} ${pick(JOBS)}`,
  $randomJobType: () => pick(JOBS),
  $randomEmail: () => `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${int(1, 99)}@example.${pick(['com', 'net', 'org'])}`,
  $randomExampleEmail: () => `${pick(FIRST).toLowerCase()}${int(1, 999)}@example.com`,
  $randomUserName: () => `${pick(FIRST).toLowerCase()}_${pick(LAST).toLowerCase()}${int(1, 99)}`,
  $randomUrl: () => `https://${pick(WORDS)}.${pick(DOMAINS)}`,
  $randomDomainName: () => `${pick(WORDS)}.${pick(DOMAINS)}`,
  $randomDomainSuffix: () => pick(DOMAINS),
  $randomDomainWord: () => pick(WORDS),
  $randomPhoneNumber: () => `${int(200, 999)}-${int(200, 999)}-${int(1000, 9999)}`,
  $randomPhoneNumberExt: () => `${int(1, 99)}-${int(200, 999)}-${int(200, 999)}-${int(1000, 9999)}`,
  $randomCity: () => pick(CITIES),
  $randomCountry: () => pick(COUNTRIES)[0],
  $randomCountryCode: () => pick(COUNTRIES)[1],
  $randomStreetName: () => pick(STREETS),
  $randomStreetAddress: () => `${int(1, 9999)} ${pick(STREETS)}`,
  $randomLatitude: () => (Math.random() * 180 - 90).toFixed(4),
  $randomLongitude: () => (Math.random() * 360 - 180).toFixed(4),
  $randomCompanyName: () => `${pick(COMPANIES)} ${pick(SUFFIX)}`,
  $randomCompanySuffix: () => pick(SUFFIX),
  $randomWord: () => pick(WORDS),
  $randomWords: () => Array.from({ length: int(2, 5) }, () => pick(WORDS)).join(' '),
  $randomNoun: () => pick(WORDS),
  $randomLoremWord: () => pick(LOREM),
  $randomLoremWords: () => Array.from({ length: 3 }, () => pick(LOREM)).join(' '),
  $randomLoremSentence: () => {
    const s = Array.from({ length: int(6, 12) }, () => pick(LOREM)).join(' ');
    return s[0].toUpperCase() + s.slice(1) + '.';
  },
  $randomLoremParagraph: () => Array.from({ length: 3 }, () => GENERATORS.$randomLoremSentence()).join(' '),
  $randomLoremSlug: () => Array.from({ length: 3 }, () => pick(LOREM)).join('-'),
  $randomPrice: () => (Math.random() * 1000).toFixed(2),
  $randomCurrencyCode: () => pick(CURRENCIES),
  $randomBankAccount: () => String(int(10000000, 99999999)),
  $randomCreditCardMask: () => String(int(1000, 9999)),
  $randomDateFuture: () => new Date(Date.now() + days(int(1, 365))).toUTCString(),
  $randomDatePast: () => new Date(Date.now() - days(int(1, 365))).toUTCString(),
  $randomDateRecent: () => new Date(Date.now() - days(int(0, 2))).toUTCString(),
  $randomWeekday: () => pick(WEEKDAYS),
  $randomMonth: () => pick(MONTHS),
  $randomImageUrl: () => `https://picsum.photos/${int(200, 800)}/${int(200, 800)}`,
  $randomAvatarImage: () => `https://i.pravatar.cc/150?u=${alnum(8)}`,
  $randomFileName: () => `${pick(WORDS)}.${pick(EXTS)[0]}`,
  $randomFileExt: () => pick(EXTS)[0],
  $randomFileType: () => pick(['application', 'image', 'text', 'video']),
  $randomMimeType: () => pick(EXTS)[1],
  $randomFilePath: () => `/${pick(WORDS)}/${pick(WORDS)}.${pick(EXTS)[0]}`,
  $randomDirectoryPath: () => `/${pick(WORDS)}/${pick(WORDS)}`,
  $randomProduct: () => pick(['Chair', 'Laptop', 'Shoes', 'Keyboard', 'Coffee', 'Bag']),
  $randomProductName: () => `${pick(['Ergonomic', 'Rustic', 'Sleek', 'Smart'])} ${pick(['Steel', 'Wooden', 'Cotton'])} ${pick(['Chair', 'Laptop', 'Shoes', 'Keyboard'])}`,
  $randomDepartment: () => pick(['Electronics', 'Books', 'Garden', 'Sports', 'Toys']),
  $randomCatchPhrase: () => `${pick(['Seamless', 'Robust', 'Scalable'])} ${pick(['real-time', 'cloud-native', 'zero-trust'])} ${pick(['platform', 'solution', 'framework'])}`,
  $randomPhrase: () => GENERATORS.$randomLoremSentence()
};

export function dynamicVar(name: string): string | undefined {
  const g = GENERATORS[name];
  return g ? g() : undefined;
}

export const DYNAMIC_VAR_NAMES = Object.keys(GENERATORS);
