import { normId } from '@lawyer-152fz/core';
import type { CodebaseRule, Finding, SourceFile } from '@lawyer-152fz/core';

import { MAX_EVIDENCE, fileEvidence, inFiles, isCode, matchingLines } from './shared';
import type { LineMatch } from './shared';

const CROSS_BORDER_NOTICE = normId('152-fz/art-12/part-3');
const LOCALIZATION = normId('152-fz/art-18/part-5');

const ID = 'PD-CODE-FOREIGN-SDK';

interface Sdk {
  readonly vendor: string;
  /** Что сервис получает — для понятного заголовка. */
  readonly receives: string;
  /** Хранит профили пользователей — выше важность. */
  readonly storesUsers?: boolean;
  /** Имена пакетов npm и PyPI; `*` в конце — префикс (`@sentry/*`). */
  readonly packages: readonly string[];
}

const SDKS: readonly Sdk[] = [
  {
    vendor: 'Sentry',
    receives: 'ошибки вместе с данными пользователей',
    packages: ['@sentry/*', 'sentry-sdk', 'raven'],
  },
  {
    vendor: 'Firebase',
    receives: 'данные пользователей и базы',
    storesUsers: true,
    packages: ['firebase', 'firebase-admin', '@firebase/*'],
  },
  {
    vendor: 'Supabase (облако)',
    receives: 'данные пользователей и базы',
    storesUsers: true,
    packages: ['@supabase/*', 'supabase'],
  },
  {
    vendor: 'Auth0',
    receives: 'учётные записи пользователей',
    storesUsers: true,
    packages: ['auth0', '@auth0/*'],
  },
  {
    vendor: 'Clerk',
    receives: 'учётные записи пользователей',
    storesUsers: true,
    packages: ['@clerk/*'],
  },
  {
    vendor: 'Google Analytics',
    receives: 'данные о поведении посетителей',
    packages: ['react-ga', 'react-ga4', 'vue-gtag', 'ga-4-react'],
  },
  {
    vendor: 'Mixpanel',
    receives: 'данные о поведении пользователей',
    packages: ['mixpanel', 'mixpanel-browser'],
  },
  {
    vendor: 'Amplitude',
    receives: 'данные о поведении пользователей',
    packages: ['@amplitude/*', 'amplitude'],
  },
  {
    vendor: 'Segment',
    receives: 'данные о поведении пользователей',
    packages: ['@segment/*', 'analytics-node'],
  },
  {
    vendor: 'PostHog',
    receives: 'данные о поведении пользователей',
    packages: ['posthog-js', 'posthog-node', 'posthog'],
  },
  { vendor: 'LogRocket', receives: 'записи сессий пользователей', packages: ['logrocket'] },
  { vendor: 'FullStory', receives: 'записи сессий пользователей', packages: ['@fullstory/*'] },
  { vendor: 'Hotjar', receives: 'записи сессий пользователей', packages: ['@hotjar/*'] },
  { vendor: 'Vercel Analytics', receives: 'данные о посетителях', packages: ['@vercel/analytics'] },
  {
    vendor: 'Intercom',
    receives: 'переписку и контакты пользователей',
    packages: ['@intercom/*', 'react-use-intercom'],
  },
  {
    vendor: 'HubSpot',
    receives: 'контакты клиентов',
    storesUsers: true,
    packages: ['@hubspot/*', 'hubspot-api-client'],
  },
  {
    vendor: 'Mailchimp',
    receives: 'e-mail подписчиков',
    storesUsers: true,
    packages: ['@mailchimp/*', 'mailchimp3', 'mailchimp-marketing'],
  },
  {
    vendor: 'SendGrid',
    receives: 'e-mail и письма пользователям',
    packages: ['@sendgrid/*', 'sendgrid'],
  },
  { vendor: 'Twilio', receives: 'номера телефонов и сообщения', packages: ['twilio'] },
  {
    vendor: 'Stripe',
    receives: 'платёжные и контактные данные',
    packages: ['stripe', '@stripe/*'],
  },
  {
    vendor: 'OpenAI',
    receives: 'тексты запросов, в которых могут быть персональные данные',
    packages: ['openai', '@ai-sdk/openai'],
  },
  {
    vendor: 'Anthropic',
    receives: 'тексты запросов, в которых могут быть персональные данные',
    packages: ['@anthropic-ai/sdk', 'anthropic', '@ai-sdk/anthropic'],
  },
  {
    vendor: 'Google Gemini',
    receives: 'тексты запросов, в которых могут быть персональные данные',
    packages: ['@google/generative-ai', '@google/genai', 'google-generativeai', 'google-genai'],
  },
];

const matchesPackage = (pattern: string, name: string) =>
  pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;

const sdkOf = (name: string) =>
  SDKS.find((sdk) => sdk.packages.some((pattern) => matchesPackage(pattern, name)));

/** `firebase/app` → `firebase`, `@sentry/react/hooks` → `@sentry/react`. */
const packageOf = (specifier: string) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

/** Модуль Python `sentry_sdk` — пакет PyPI `sentry-sdk`. */
const pythonPackageOf = (module: string) => module.toLowerCase().replace(/_/g, '-');

/** Имя пакета из строки: зависимость в package.json, requirements.txt, import/require/from. */
function packagesInLine(file: SourceFile, line: string): string[] {
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  if (name === 'package.json') {
    const dependency = /^\s*"(@?[\w.-]+(?:\/[\w.-]+)?)"\s*:\s*"[^"]*"/.exec(line);
    return dependency?.[1] ? [dependency[1]] : [];
  }
  if (name === 'requirements.txt') {
    const requirement = /^\s*([A-Za-z0-9][\w.-]*)/.exec(line);
    return requirement?.[1] ? [requirement[1].toLowerCase()] : [];
  }
  if (!isCode(file)) return [];
  const found: string[] = [];
  for (const match of line.matchAll(
    /(?:from\s+|import\s+|require\(\s*)["'](@?[\w.-]+(?:\/[\w.-]+)?)/g,
  )) {
    if (match[1]) found.push(packageOf(match[1]));
  }
  const python = /^\s*(?:from|import)\s+([A-Za-z_][\w]*)/.exec(line);
  if (python?.[1] && file.path.endsWith('.py')) found.push(pythonPackageOf(python[1]));
  return found;
}

/** Зависимости и импорты иностранных сервисов, которые получают данные пользователей. */
export const foreignSdkRule: CodebaseRule = {
  id: ID,
  title: 'Иностранные SDK, получающие персональные данные',
  normRefs: [CROSS_BORDER_NOTICE, LOCALIZATION],
  check(snapshot) {
    const usages = new Map<Sdk, LineMatch[]>();
    for (const file of snapshot.files) {
      for (const match of matchingLines(file, (line) =>
        packagesInLine(file, line).some((name) => sdkOf(name)),
      )) {
        for (const name of packagesInLine(file, match.text)) {
          const sdk = sdkOf(name);
          if (sdk) usages.set(sdk, [...(usages.get(sdk) ?? []), match]);
        }
      }
    }

    return [...usages].map(([sdk, matches]): Finding => {
      const files = new Set(matches.map(({ file }) => file.path)).size;
      return {
        ruleId: ID,
        kind: 'risk',
        severity: sdk.storesUsers ? 'high' : 'medium',
        confidence: 'needs-review',
        title: `Иностранный сервис ${sdk.vendor} получает ${sdk.receives}${inFiles(files)}`,
        evidence: matches.slice(0, MAX_EVIDENCE).map(fileEvidence),
        normRefs: [CROSS_BORDER_NOTICE, LOCALIZATION],
        remediation:
          'Если сервис получает персональные данные граждан РФ, это трансграничная передача: до её начала уведомите ' +
          'Роскомнадзор и укажите сервис в политике. Первичная запись данных при сборе должна идти в базу в России. ' +
          'Где возможно, используйте российский аналог, собственный сервер (self-hosted) или передавайте данные без ' +
          'персональной части (обезличенно).',
      };
    });
  },
};
