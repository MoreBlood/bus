#!/bin/sh
# Vercel «Ignored Build Step»: exit 1 — собирать, exit 0 — пропустить сборку.
# Экономим лимит Hobby (деплои в день, одна сборка за раз): продакшен собираем всегда,
# превью — только если изменилось само приложение.

# main — всегда продакшен
[ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 1

# зависимости от Dependabot проверяет CI, живое превью им не нужно
case "$VERCEL_GIT_COMMIT_REF" in dependabot/*) echo "Dependabot — без превью"; exit 0 ;; esac

# только документация и настройки GitHub — без превью
# (git diff: 0 — изменений нет → пропуск; 1 — есть → сборка; ошибка, например нет HEAD^ → сборка)
git diff --quiet HEAD^ HEAD -- . ':(exclude)*.md' ':(exclude).github' ':(exclude).impeccable' ':(exclude)docs' \
  && { echo "Только документация — без превью"; exit 0; }
exit 1
