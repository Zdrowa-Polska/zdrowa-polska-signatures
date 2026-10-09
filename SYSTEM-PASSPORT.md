# Паспорт системи корпоративних Gmail-підписів Zdrowa Polska S.A.

**Стан на:** 18.09.2026  
**Статус:** production  
**Автоматична синхронізація:** активна, 1 раз на годину

## 1. Мета системи

Централізовано керувати корпоративними Gmail-підписами працівників Zdrowa Polska S.A. через Google Workspace / Apps Script без щомісячної оплати за сторонній сервіс.

Підпис формується автоматично з даних профілю Google Workspace і встановлюється через Gmail API.

## 2. Джерело даних

Основне джерело — Google Workspace Directory.

Для кожного користувача використовуються:
- ім’я та прізвище;
- посада;
- телефон;
- email;
- фото профілю;
- custom field `LinkedIn`;
- custom boolean field `EmailSignature`.

Custom schema:
- `SignatureProfile`
- поле `LinkedIn`
- поле `EmailSignature`

Логіка:
- `EmailSignature = true` → користувач отримує централізований корпоративний підпис;
- `EmailSignature = false` → система не встановлює підпис новому користувачу; якщо користувач уже був під керуванням системи, корпоративний підпис видаляється.

## 3. Поточний режим

Система переведена в `production`.

Останній підтверджений ручний запуск:
- active users: 9;
- `EmailSignature = true`: 3;
- `EmailSignature = false`: 6;
- результат: `updated: 3`, `ignored: 6`, `failed: 0`.

Кількість користувачів із `true` може змінюватися в майбутньому.

## 4. Як додати нового користувача до системи

У Google Admin Console:
1. відкрити профіль користувача;
2. знайти custom field `EmailSignature`;
3. встановити `true`;
4. за бажанням заповнити `LinkedIn`.

Після цього:
- або чекати максимум приблизно 1 годину;
- або в Apps Script вручну запустити `syncSignatures`.

## 5. Як прибрати користувача

В Google Admin Console змінити `EmailSignature` на `false`.

Під час наступної синхронізації система прибере централізований підпис, якщо цей користувач раніше був під керуванням системи.

## 6. Основні Apps Script функції

### `syncSignatures`
Звичайна синхронізація. У production обробляє всіх активних користувачів:
- `true` → оновлює/перевіряє підпис;
- `false` → ігнорує або очищає раніше керований підпис.

### `goLive`
Переводить систему в production, виконує синхронізацію і створює погодинний trigger.

**Не потрібно запускати повторно для звичайного оновлення дизайну або користувачів.**

### `backToTest`
Переводить систему в test mode і видаляє погодинний trigger.

Важливо: вже встановлені підписи автоматично не видаляються.

### `systemStatus`
Показує:
- режим;
- кількість hourly triggers;
- кількість активних користувачів;
- кількість enabled / disabled.

### `launchReadinessCheck`
Перевіряє готовність системи до запуску.

### `prepareSystem`
Підготовча функція. Переводить систему в test mode, прибирає production trigger, перевіряє конфігурацію, готує assets і синхронізує лише тестового користувача.

**Не запускати в робочій production-системі без причини**, бо вона переводить систему назад у test mode.

## 7. Test user

Тестовий користувач:

`dhyk@zdrowapolskagroup.pl`

LinkedIn:
`https://www.linkedin.com/in/dhyk/`

У test mode реальна Gmail-зміна виконується лише для цього користувача.

## 8. Google Cloud / Gmail API

Використовується service account:

**Gmail Signature Manager**

Використовується Domain-Wide Delegation.

Gmail API scope:
`https://www.googleapis.com/auth/gmail.settings.basic`

Service account impersonates конкретного Workspace-користувача і змінює його primary send-as signature через Gmail API.

Секрети не зберігаються в GitHub.

У Apps Script Script Properties зберігаються:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GITHUB_TOKEN`

GitHub owner тепер зафіксований у коді як `Zdrowa-Polska`; у Script Properties зберігається лише `GITHUB_TOKEN` для GitHub-доступу. Значення секретів не повинні потрапляти в репозиторій або документацію.

## 9. GitHub

Repository:
`Zdrowa-Polska/zdrowa-polska-signatures`

GitHub Pages base:
`https://zdrowa-polska.github.io/zdrowa-polska-signatures`

GitHub використовується як публічне сховище assets для HTML-підпису:
- company logo;
- social icons;
- employee photos;
- neutral avatar.

Вихідні assets:
- `assets/logo.svg`
- `assets/neutral-avatar.svg`
- `assets/icons/*.svg`

GitHub Pages build перетворює SVG у PNG для Gmail:
- `/assets/logo.png`
- `/assets/neutral-avatar.png`
- `/assets/icons/linkedin.png`
- `/assets/icons/facebook.png`
- `/assets/icons/youtube.png`

Фото працівників:
`data/photos/<slug>.<ext>`

GitHub Pages workflow публікує assets. Фото працівників під час build автоматично перетворюються на реальні круглі PNG 192×192 px із прозорими кутами. Gmail отримує вже круглий файл і не залежить від підтримки CSS border-radius.

## 10. Важливий принцип щодо фото

Фото береться з Google Workspace profile.

Якщо фото змінилося:
- Apps Script визначає новий hash;
- оновлює вихідний файл у GitHub;
- GitHub Pages build обрізає його по центру до квадрата та створює круглий PNG із прозорими кутами;
- Gmail використовує `/photos/<slug>.png?v=<hash>`, тому кругла форма не залежить від CSS;
- query `?v=<hash>` обходить кеш.

Якщо фото немає:
- використовується neutral avatar.

Якщо фото видалене:
- система може прибрати старий published photo asset.

## 11. Поточний дизайн підпису

Фінальна версія була оптимізована під мобільний Gmail.

Структура:
- зліва кругле фото;
- під фото логотип `Zdrowa Polska` — два слова в один рядок;
- вузький лівий блок;
- синя вертикальна лінія;
- справа:
  - ім’я;
  - посада;
  - Zdrowa Polska S.A.;
  - телефон;
  - email;
  - сайт;
  - social icons;
- нижче горизонтальна лінія;
- польський і англійський disclaimer.

Остання мобільна оптимізація:
- displayed photo: 132×132 px;
- published employee photo asset: real circular PNG 192×192 px with transparent corners;
- logo HTML width: 165 px; source PNG is built with trimmed transparent margins, so the visible wordmark is larger while the table/column geometry stays unchanged;
- left block width: 165 px;
- right padding before divider: 8 px;
- left padding contact block: 12 px;
- divider: 3 px.

Це було зроблено, щоб на мобільному вертикальна синя лінія та контактний блок були ближче до лівого краю.

## 12. Website

Display:
`www.zdrowapolskagroup.pl`

Direct href:
`https://zdrowapolskagroup.pl/`

## 13. Social icons

LinkedIn:
- персональний URL із Workspace custom field `LinkedIn`;
- якщо URL є — icon clickable.

Facebook:
- corporate URL наразі не заданий;
- icon може бути видимий, але не clickable.

YouTube:
- corporate URL наразі не заданий;
- icon може бути видимий, але не clickable.

## 14. Disclaimer

### PL

Niniejsza wiadomość wraz z załącznikami zawiera ściśle poufne i prawnie chronione informacje. Jeśli są Państwo jej omyłkowym odbiorcą, prosimy o jej usunięcie i niezwłoczne poinformowanie nadawcy. Kopiowanie, ujawnianie lub rozpowszechnianie materiału zawartego w tym e-mailu jest zabronione.

### EN

This email with all its attachments is confidential and may be subject to legal privilege. If it is not intended for you, please notify the sender immediately and delete this e-mail. Any unauthorized copying, disclosure or distribution of the material in this e-mail is strictly forbidden.

## 15. Preview

Окремий Apps Script Web App використовується для безпечного перегляду всіх підписів без зміни Gmail.

Preview показує всіх non-suspended / non-archived користувачів, включно з тими, в кого `EmailSignature = false`.

Preview використовує inline profile photos і не потребує публікувати всі фото лише для перегляду.

Preview URL на момент налаштування:
`https://script.google.com/a/macros/zdrowapolskagroup.pl/s/AKfycbz--j94ed6qDK_-fgG4FY9kWiEfrLTWYZ30E-rQZ9FDh2SZNdxsM26fkRdDupQiodsW/exec`

## 16. Apps / clients

Цільова підтримка:
- Gmail web;
- офіційний Gmail app на iPhone / iPad / Android.

Інші mail clients не є частиною поточної архітектури.

## 17. Aliases

Aliases не входять до централізованого rollout.

Система керує primary Workspace mailbox signature.

Окремі send-as адреси в іншому Gmail account можуть вимагати ручного налаштування.

## 18. Погодинний trigger і витрати

Trigger запускає `syncSignatures` приблизно раз на годину.

У поточному масштабі це не створює практичних витрат.

Скрипт перевіряє поточний стан і не повинен без потреби переписувати підпис.

## 19. Аварійна зупинка

Якщо потрібно негайно припинити автоматичні зміни:

1. відкрити Apps Script;
2. вибрати `backToTest`;
3. натиснути `Uruchom`.

Це:
- переводить систему в test;
- видаляє hourly trigger;
- не стирає вже встановлені підписи.

## 20. Важлива примітка про canonical code

Робоча production-версія зараз знаходиться в Apps Script.

Після останньої мобільної оптимізації дизайну код в Apps Script був змінений вручну. GitHub-файл `apps-script/Combined.gs` синхронізовано з компактною production-версією дизайну (logo 165 px, left block 150 px, padding 8/12 px) і механізмом круглих PNG. Після наступних ручних змін Apps Script знову перевіряти синхронність.

Не вважати GitHub-код автоматично актуальнішим за production Apps Script без перевірки.

## 21. Правило для майбутніх змін

Перед будь-якою масовою зміною:
1. не чіпати `EmailSignature=false` users;
2. тестувати дизайн на одному / кількох enabled users;
3. запускати `syncSignatures`;
4. перевіряти log на `failed:0`;
5. перевіряти Gmail web + mobile;
6. тільки після цього розширювати `EmailSignature=true`.

## 22. Поточне стратегічне рішення

Розглядалася відмова від GitHub на користь Google Drive з public images.

Рішення станом на 18.09.2026:
**залишити GitHub**, тому що поточна схема стабільно працює і GitHub Pages дає надійні прямі HTTPS URL для Gmail images.

Міграцію на Google Drive наразі не робити.


## 23. Автоматична синхронізація зовнішнього Gmail send-as

Додано підтримку окремого Gmail mailbox, у якому корпоративна адреса використовується як `Send mail as`.

Поточний mapping:
- mailbox: `dg@vitagramma.com`
- send-as address: `dhyk@zdrowapolskagroup.pl`
- source profile/signature: `dhyk@zdrowapolskagroup.pl`

Логіка:
- основний корпоративний підпис формується з профілю `dhyk@zdrowapolskagroup.pl`;
- той самий HTML автоматично записується в send-as signature всередині mailbox `dg@vitagramma.com`;
- після увімкнення extra send-as sync він виконується разом із погодинним `syncSignatures`;
- якщо source user має `EmailSignature=false`, раніше керований extra send-as signature очищається.

Функції:
- `testExtraSendAsAccess` — перевіряє, що service account має доступ до mailbox і send-as;
- `enableExtraSendAs` — перевіряє доступ, вмикає extra send-as sync і одразу синхронізує підпис;
- `disableExtraSendAs` — вимикає подальшу автоматичну синхронізацію extra send-as, не видаляючи вже встановлений підпис.

Важливо:
- service account `Gmail Signature Manager` повинен мати Domain-Wide Delegation не лише в Workspace `zdrowapolskagroup.pl`, а й у Workspace-tenant, якому належить `dg@vitagramma.com`;
- у другому tenant потрібно авторизувати той самий OAuth Client ID:
  `106022844431384752578`
- scopes у tenant `vitagramma.com`:
  `https://www.googleapis.com/auth/gmail.settings.basic`
  `https://www.googleapis.com/auth/gmail.settings.sharing`
- `gmail.settings.sharing` потрібен саме для PATCH non-primary SendAs;
- у tenant `zdrowapolskagroup.pl` для primary mailbox signatures достатньо `gmail.settings.basic`;
- жодних додаткових secret keys створювати не потрібно.


## 24. Автоматичні vCard та QR-коди для паперових візиток

Додано автоматичне формування цифрових контактних карток для працівників з `EmailSignature=true`.

Джерело даних:
- Google Workspace Directory;
- ім’я та прізвище;
- посада;
- компанія `Zdrowa Polska S.A.`;
- службовий телефон;
- корпоративний e-mail;
- сайт;
- LinkedIn;
- фото профілю.

Формат:
- vCard 3.0;
- фото профілю конвертується в JPEG і вбудовується безпосередньо в `.vcf` як Base64 (`PHOTO;TYPE=JPEG;ENCODING=b`) для сумісності з iPhone/iOS;
- QR-код не містить персональних даних напряму, а веде на стабільний URL `.vcf`.

Публічні URL:
- vCard: `https://zdrowa-polska.github.io/zdrowa-polska-signatures/contacts/<slug>.vcf`
- QR PNG: `https://zdrowa-polska.github.io/zdrowa-polska-signatures/qr/<slug>.png`
- QR SVG (для друку): `https://zdrowa-polska.github.io/zdrowa-polska-signatures/qr/<slug>.svg`

`<slug>` = частина корпоративної e-mail адреси до символу @.

Приклад Mateusz:
- vCard: `.../contacts/mateusz.vcf`
- QR PNG: `.../qr/mateusz.png`
- QR SVG: `.../qr/mateusz.svg`

Автоматизація:
- `syncBusinessCards()` — ручна синхронізація всіх vCard;
- production `syncSignatures()` також запускає синхронізацію vCard під час погодинного trigger;
- зміни профілю в Admin Console потрапляють у vCard при найближчому погодинному запуску;
- якщо `EmailSignature=false`, відповідний source vCard видаляється;
- GitHub Pages build копіює vCard у `/contacts/` та генерує QR у PNG 1200 px і SVG;
- QR на вже надрукованій візитці не змінюється при зміні телефону, посади, фото тощо, бо URL vCard залишається сталим.


### Корекція сумісності фото з iPhone
Під час тесту iPhone відкривав vCard коректно, але показував ініціали замість фото. Причина: попередня версія вбудовувала PNG як `PHOTO;ENCODING=b;TYPE=PNG`. Для iOS введено більш сумісний формат: Apps Script конвертує фото в JPEG і записує `PHOTO;TYPE=JPEG;ENCODING=b`. QR та URL vCard при цьому не змінюються.


## 25. Мобільні цифрові візитки

Для кожного працівника, для якого існує vCard, GitHub Pages автоматично генерує персональну мобільну сторінку:

`https://zdrowa-polska.github.io/zdrowa-polska-signatures/card/<slug>/`

Приклад:
`https://zdrowa-polska.github.io/zdrowa-polska-signatures/card/dhyk/`

Сторінка містить:
- фото працівника;
- логотип Zdrowa Polska;
- ім’я;
- посаду;
- компанію;
- великий QR, який веде на той самий постійний vCard URL, що й QR на паперовій візитці;
- кнопку `Dodaj do kontaktów`;
- кнопку дзвінка;
- кнопку e-mail;
- LinkedIn, якщо він заданий у Google Workspace Directory;
- телефон, e-mail і сайт.

Дані сторінки беруться з того самого автоматично оновлюваного vCard, тому зміни Google Workspace Directory потрапляють також у мобільну візитку після синхронізації та GitHub Pages build.

На iPhone сторінку можна додати на Home Screen:
Safari → Udostępnij → Dodaj do ekranu początkowego.

Це дозволяє працівнику одним натисканням відкрити персональний QR на телефоні та показати його клієнту для сканування.
