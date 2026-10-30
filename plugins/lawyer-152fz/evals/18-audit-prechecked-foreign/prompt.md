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

Проверь страницу нашего сайта https://clinic.example/booking на соответствие 152-ФЗ. Браузер я уже открыл, вот HTML страницы после отрисовки:

```html
<html>
  <head>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());
      gtag('config', 'G-TEST123');
    </script>
  </head>
  <body>
    <h1>Запись на приём</h1>
    <form id="booking" method="post" action="/booking">
      <label>ФИО <input name="fullname" /></label>
      <label>Телефон <input name="phone" type="tel" /></label>
      <label
        ><input type="checkbox" name="agree" checked /> Я согласен на обработку персональных данных
        в соответствии с <a href="/privacy">политикой</a></label
      >
      <button>Записаться</button>
    </form>
  </body>
</html>
```
