# Changelog

Что менялось в «Бусе». Записи ведёт release-please по заголовкам PR — руками не правьте.

## [0.3.0](https://github.com/MoreBlood/bus/compare/v0.2.1...v0.3.0) (2026-11-18)


### Новое

* **ассистент:** история задним числом — импорт пачкой, даты совладельцев, «рассчитались до» ([#21](https://github.com/MoreBlood/bus/issues/21)) ([1240e7e](https://github.com/MoreBlood/bus/commit/1240e7e09d719b8238ff804720e9e2908b39a303))
* **деньги:** понятный расчёт поездки — ставки с даты, тип топлива, расходы в дороге ([#19](https://github.com/MoreBlood/bus/issues/19)) ([de54950](https://github.com/MoreBlood/bus/commit/de54950c6785b13e56f837ce8aaa1a959e4a31f6))
* **деньги:** ремонт и ТО — гасятся из резерва амортизации ([#20](https://github.com/MoreBlood/bus/issues/20)) ([6acb65b](https://github.com/MoreBlood/bus/commit/6acb65b3cb41858ce1e81b5a5ca69bd670d52bbb))
* **интерфейс:** пиктограммы из набора Phosphor ([#18](https://github.com/MoreBlood/bus/issues/18)) ([07c8153](https://github.com/MoreBlood/bus/commit/07c8153f794d8fb47d2f60e8f01de2dc61fd86b7))
* несколько человек и гости в поездке, амортизация и бензин, пошаговая запись ([#15](https://github.com/MoreBlood/bus/issues/15)) ([dc1e0b4](https://github.com/MoreBlood/bus/commit/dc1e0b4f5272ca84bf2ded0bea100241e7ca62da))


### Исправления

* плотнее мобильная вёрстка и пустые состояния ([#17](https://github.com/MoreBlood/bus/issues/17)) ([fbc521c](https://github.com/MoreBlood/bus/commit/fbc521c6a8ae351f2734097d69958c70b9729667))

## [0.2.1](https://github.com/MoreBlood/bus/compare/v0.2.0...v0.2.1) (2026-11-18)


### Исправления

* закрыть уязвимости — угон логина, кликджекинг, CSRF, злоупотребление регистрацией OAuth ([#11](https://github.com/MoreBlood/bus/issues/11)) ([c31f4e3](https://github.com/MoreBlood/bus/commit/c31f4e3694926007d00a7cfe418544fce6e701d9))
* редирект со старых адресов деплоя без служебного ?path ([#13](https://github.com/MoreBlood/bus/issues/13)) ([c958c32](https://github.com/MoreBlood/bus/commit/c958c32e615d10ed118c81b94b8de6ab5475b538))

## [0.2.0](https://github.com/MoreBlood/bus/compare/v0.1.0...v0.2.0) (2026-11-18)


### Новое

* превью PR на демо-базе, версии и чейнджлог ([#8](https://github.com/MoreBlood/bus/issues/8)) ([e24c974](https://github.com/MoreBlood/bus/commit/e24c9749c62c74dd6a7d2cb2754968332213d67c))

## [0.1.0](https://github.com/MoreBlood/bus/releases/tag/v0.1.0) (2026-11-18)

Первая версия на https://bus.akapps.click.

### Новое

* **Бортжурнал поездок**: личные и общие поездки, пробег по одометру или километрами, «одометр до» подставляется из последней записи, разрывы одометра видны всем прямо в ленте.
* **Итоги года**: общий, личный и общий пробег, личные км и дни по каждому участнику (день — один раз, многодневная поездка — каждым днём).
* **Участники**: вход через GitHub только для участников, админы выдают доступ по GitHub-логину и назначают других админов, выбывших можно отключить с сохранением истории.
* **Ассистент (MCP)**: каждый участник подключает Claude, ChatGPT или Claude Code и ведёт журнал разговором.
* Интерфейс «жёлтые указатели» для телефона у буса и десктопа.
* Защищённый `main`: только PR с зелёным CI и одобрением; CI на каждом PR — типы, тесты API и MCP, линтер, миграции, сборка как на Vercel.
