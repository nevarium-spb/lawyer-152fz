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

Проверь страницу нашего сайта https://klinika.example/zapis на соответствие 152-ФЗ. Браузер я уже открыл, вот HTML страницы после отрисовки:

```html
<html>
  <body>
    <h1>Запись на приём</h1>
    <form id="visit" method="post" action="https://klinika.example/visit">
      <input name="name" placeholder="Имя" />
      <input name="phone" type="tel" placeholder="Телефон" />
      <textarea name="symptoms" placeholder="Опишите симптомы"></textarea>
      <label
        ><input type="checkbox" name="agree" /> Согласен на обработку персональных данных,
        <a href="/privacy">политика</a></label
      >
      <button>Записаться</button>
    </form>
  </body>
</html>
```
