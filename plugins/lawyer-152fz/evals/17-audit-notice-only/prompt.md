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

Проверь страницу нашего сайта https://shop.example/order на соответствие 152-ФЗ. Браузер я уже открыл, вот HTML страницы после отрисовки:

```html
<html>
  <head>
    <title>Заявка</title>
  </head>
  <body>
    <h1>Оставьте заявку</h1>
    <form id="lead" method="post" action="/api/lead">
      <input name="name" placeholder="Ваше имя" />
      <input name="phone" type="tel" placeholder="Телефон" />
      <input name="email" type="email" placeholder="E-mail" />
      <button type="submit">Отправить</button>
      <p>Нажимая кнопку «Отправить», вы соглашаетесь на обработку персональных данных.</p>
    </form>
  </body>
</html>
```
