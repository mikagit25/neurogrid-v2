INSERT INTO scenarios (slug, title, description, platforms, price) VALUES
  (
    'niche-analysis',
    'Анализ ниши и конкурентов',
    'Введите ключевое слово или категорию. Сервис получает топ товаров из поиска WB/Ozon и формирует AI-отчёт: уровень конкуренции, диапазон цен, топ-бренды, стратегия входа и точки роста.',
    ARRAY['ozon', 'wb'],
    9.90
  )
ON CONFLICT (slug) DO NOTHING;
