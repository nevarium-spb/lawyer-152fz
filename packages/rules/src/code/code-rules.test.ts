import { runRules } from '@lawyer-152fz/core';
import type { CodebaseRule, SourceFile } from '@lawyer-152fz/core';
import { makeCodebaseSnapshot } from '@lawyer-152fz/core/testing';
import { describe, expect, it } from 'vitest';

import { CODEBASE_RULES } from '../index';
import { foreignSdkRule } from './foreign-sdk';
import { loggingRule } from './logging';
import { storageRegionRule } from './storage-region';

const repo = (files: Record<string, string>) =>
  makeCodebaseSnapshot({
    files: Object.entries(files).map(([path, content]): SourceFile => ({ path, content })),
  });

function check(rule: CodebaseRule, files: Record<string, string>) {
  const outcome = runRules([rule], repo(files));
  expect(outcome.notChecked).toEqual([]);
  return outcome.findings;
}

/** Мини-репозиторий без нарушений: российское облако, Метрика, аккуратные логи. */
const CLEAN_REPO = {
  'package.json': JSON.stringify(
    {
      name: 'shop',
      dependencies: { react: '19.0.0', 'yandex-metrika-react': '1.0.0', pino: '10.0.0' },
    },
    null,
    2,
  ),
  '.env.example':
    'S3_ENDPOINT=https://storage.yandexcloud.net\nS3_REGION=ru-central1\nDB_HOST=rc1a.mdb.yandexcloud.net',
  'src/api/lead.ts': [
    "import pino from 'pino';",
    'const logger = pino();',
    'export function saveLead(lead: { id: string; email: string }) {',
    "  logger.info({ leadId: lead.id }, 'lead saved');",
    '  console.log(`telegram bot started, user ${lead.id}`);',
    '}',
  ].join('\n'),
  'src/ui/Contacts.tsx': '<a href="tel:+78120000000">Позвонить</a>',
};

/** Мини-репозиторий с нарушениями. */
const VIOLATING_REPO = {
  'package.json': JSON.stringify(
    {
      name: 'saas',
      dependencies: { '@sentry/react': '10.0.0', firebase: '12.0.0', openai: '6.0.0' },
      devDependencies: { typescript: '7.0.2' },
    },
    null,
    2,
  ),
  'requirements.txt': 'django==6.0\nsentry-sdk==3.0\nmixpanel>=5',
  'docker-compose.yml': 'services:\n  app:\n    environment:\n      AWS_REGION: eu-central-1',
  'src/db.ts': "export const MONGO_URL = 'mongodb+srv://app:pass@cluster0.ab12c.mongodb.net/shop';",
  'src/firebase.ts': "import { initializeApp } from 'firebase/app';\nimport OpenAI from 'openai';",
  'src/api/register.ts': [
    'export async function register(req, res) {',
    "  console.log('new user', req.body);",
    "  logger.info('phone', user.phone);",
    '}',
  ].join('\n'),
  'worker/tasks.py': 'import sentry_sdk\nfrom mixpanel import Mixpanel\nprint(f"send to {email}")',
};

describe('правила кода на мини-репозиториях (T5.5)', () => {
  it('чистый репозиторий — ни одной находки от всех правил', () => {
    expect(runRules(CODEBASE_RULES, repo(CLEAN_REPO))).toEqual({ findings: [], notChecked: [] });
  });

  it('репозиторий с нарушениями — находки всех трёх правил', () => {
    const { findings, notChecked } = runRules(CODEBASE_RULES, repo(VIOLATING_REPO));

    expect(notChecked).toEqual([]);
    expect(new Set(findings.map((finding) => finding.ruleId))).toEqual(
      new Set(['PD-CODE-FOREIGN-SDK', 'PD-CODE-STORAGE-REGION', 'PD-CODE-LOGGING']),
    );
  });
});

describe('PD-CODE-FOREIGN-SDK', () => {
  it('зависимости npm и PyPI, импорты JS и Python; один сервис — одна находка', () => {
    const findings = check(foreignSdkRule, VIOLATING_REPO);

    expect(findings.map((finding) => [finding.severity, finding.title])).toEqual([
      ['high', 'Иностранный сервис Firebase получает данные пользователей и базы — в 2 файлах'],
      [
        'medium',
        'Иностранный сервис Sentry получает ошибки вместе с данными пользователей — в 3 файлах',
      ],
      [
        'medium',
        'Иностранный сервис OpenAI получает тексты запросов, в которых могут быть персональные данные — в 2 файлах',
      ],
      [
        'medium',
        'Иностранный сервис Mixpanel получает данные о поведении пользователей — в 2 файлах',
      ],
    ]);
    const sentry = findings.find((finding) => finding.title.includes('Sentry'));
    expect(sentry?.evidence).toEqual([
      {
        type: 'file',
        path: 'package.json',
        line: 4,
        untrustedExcerpt: '"@sentry/react": "10.0.0",',
      },
      { type: 'file', path: 'requirements.txt', line: 2, untrustedExcerpt: 'sentry-sdk==3.0' },
      { type: 'file', path: 'worker/tasks.py', line: 1, untrustedExcerpt: 'import sentry_sdk' },
    ]);
  });

  it('подпуть scoped-пакета, несколько импортов в строке, комментарии в requirements.txt', () => {
    const findings = check(foreignSdkRule, {
      'requirements.txt': '# зависимости\n\nflask==3.1\nopenai>=2',
      'src/app.ts': "import React from 'react'; import { Clerk } from '@clerk/clerk-js';",
      'src/errors.ts': "const Sentry = require('@sentry/react/hooks');",
    });

    expect(findings.map((finding) => finding.title.split(' получает')[0])).toEqual([
      'Иностранный сервис Clerk',
      'Иностранный сервис OpenAI',
      'Иностранный сервис Sentry',
    ]);
  });

  it('российские и обычные пакеты не считаются; сервис в комментарии к коду — не импорт', () => {
    expect(
      check(foreignSdkRule, { ...CLEAN_REPO, 'src/notes.ts': '// TODO: попробовать firebase' }),
    ).toEqual([]);
  });
});

describe('PD-CODE-STORAGE-REGION', () => {
  it('регион AWS и MongoDB Atlas — одна находка со всеми признаками', () => {
    const [finding] = check(storageRegionRule, VIOLATING_REPO);

    expect(finding?.title).toBe(
      'В конфигурации есть хранилища или облака за пределами РФ (регион AWS, MongoDB Atlas) — в 2 файлах',
    );
    expect(
      finding?.evidence.map(
        (evidence) => evidence.type === 'file' && `${evidence.path}:${String(evidence.line)}`,
      ),
    ).toEqual(['docker-compose.yml:4', 'src/db.ts:1']);
  });

  it.each([
    ['GCP', 'region = "europe-west1"'],
    ['Azure', 'location: westeurope'],
    ['Supabase', 'SUPABASE_URL=https://abc.supabase.co'],
    ['S3', 'https://bucket.s3.us-east-1.amazonaws.com/key'],
  ])('находит %s', (_name, line) => {
    expect(check(storageRegionRule, { 'config.yml': line })).toHaveLength(1);
  });

  it('Яндекс Облако и российские хостинги — без находок', () => {
    expect(check(storageRegionRule, CLEAN_REPO)).toEqual([]);
  });
});

describe('PD-CODE-LOGGING', () => {
  it('тело запроса и телефон в логах — находка на файл со строками', () => {
    const findings = check(loggingRule, VIOLATING_REPO);

    expect(findings.map((finding) => finding.title)).toEqual([
      'Персональные данные могут попадать в логи: src/api/register.ts',
      'Персональные данные могут попадать в логи: worker/tasks.py',
    ]);
    expect(
      findings[0]?.evidence.map((evidence) => evidence.type === 'file' && evidence.line),
    ).toEqual([2, 3]);
  });

  it('логирование идентификатора и упоминание telegram — без находок; конфиги не проверяются', () => {
    expect(check(loggingRule, { ...CLEAN_REPO, 'app.yml': 'log: console.log(email)' })).toEqual([]);
  });
});

describe('реестр правил кода', () => {
  it('идентификаторы уникальны и не пересекаются с правилами сайта', () => {
    const ids = CODEBASE_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('PD-CODE-'))).toBe(true);
  });
});
