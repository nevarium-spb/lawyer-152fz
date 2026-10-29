---
max_turns: 15
timeout_seconds: 600
allowed_tools:
  [
    Skill,
    Agent,
    mcp__plugin_lawyer-152fz_lawyer-152fz__audit_html,
    mcp__plugin_lawyer-152fz_lawyer-152fz__search_norms,
    mcp__plugin_lawyer-152fz_lawyer-152fz__get_norm,
  ]
runs: 1
---

Проверь страницу нашего сайта https://bakery.example/contacts на соответствие 152-ФЗ. Браузер я уже открыл, вот HTML страницы после отрисовки:

```html
<html>
  <head>
    <title>Контакты</title>
  </head>
  <body>
    <div id="cookie-banner">
      Мы используем файлы cookie и Яндекс Метрику для статистики посещений.
      <a href="/privacy">Подробнее в политике</a>. <button>Понятно</button>
    </div>
    <h1>Напишите нам</h1>
    <form id="feedback" method="post" action="https://bakery.example/feedback">
      <label for="n">Имя</label><input id="n" name="name" /> <label for="e">E-mail</label
      ><input id="e" name="email" type="email" />
      <label
        ><input type="checkbox" name="consent" required /> Я даю
        <a href="/consent">согласие на обработку персональных данных</a> и ознакомлен с
        <a href="/privacy">политикой обработки персональных данных</a></label
      >
      <button>Отправить</button>
    </form>
    <footer><a href="/privacy">Политика обработки персональных данных</a></footer>
    <script src="https://mc.yandex.ru/metrika/tag.js"></script>
  </body>
</html>
```
