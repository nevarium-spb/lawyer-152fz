/**
 * Проверка базы норм (T2.6): схема, хеши, нумерация частей и давность сверки.
 * Запускается в `pnpm check` и CI. Код выхода 1 — база некорректна или устарела.
 */
import { MAX_VERIFICATION_AGE_DAYS, findStaleNorms } from '../src/kb-health';
import { loadKnowledgeBase } from '../src/load-from-dir';

const say = (line: string) => process.stdout.write(`${line}\n`);

const knowledgeBase = await loadKnowledgeBase();
if (!knowledgeBase.ok) {
  for (const issue of knowledgeBase.error.issues) say(`✖ ${issue.path}: ${issue.message}`);
  process.exit(1);
}

const { acts, norms, kbVersion } = knowledgeBase.value;
for (const act of acts) {
  const count = norms.filter((norm) => norm.act === act.id).length;
  say(`✔ ${act.id}: ${String(count)} норм, редакция от ${act.editionDate}`);
}

const stale = findStaleNorms(norms, new Date());
if (stale.length > 0) {
  say(
    `✖ ${String(stale.length)} норм сверены больше ${String(MAX_VERIFICATION_AGE_DAYS)} дней назад — запустите pnpm kb:import`,
  );
  process.exit(1);
}

say(`База ${kbVersion}: ${String(norms.length)} норм, всё в порядке`);
