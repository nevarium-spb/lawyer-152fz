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

Проверь страницу нашего сайта https://autoservice.example/ на соответствие 152-ФЗ. Браузер я уже открыл, вот HTML страницы после отрисовки:

```html
<html>
  <body>
    <h1>Запись на ремонт</h1>
    <form id="repair" method="post" action="http://crm.autoservice.example/lead">
      <input name="name" placeholder="Имя" />
      <input name="phone" type="tel" placeholder="Телефон" />
      <label
        ><input type="checkbox" name="agree" /> Согласен на обработку персональных данных,
        <a href="/privacy">политика</a></label
      >
      <button>Записаться</button>
    </form>
  </body>
</html>
```
