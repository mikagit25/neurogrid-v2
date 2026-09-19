INSERT INTO scenarios (slug, title, description, platforms, price) VALUES
  (
    'photo-generator',
    'Генерация фото товара',
    'Создаёт профессиональное фото товара (белый фон, студийное или лайфстайл) с помощью ИИ FLUX.',
    ARRAY['ozon', 'wb'],
    29.90
  ),
  (
    'infographic-generator',
    'Генератор инфографики',
    'Берёт фото товара и создаёт инфографику с характеристиками в формате WB/Ozon (1200×900 PNG).',
    ARRAY['ozon', 'wb'],
    19.90
  )
ON CONFLICT (slug) DO NOTHING;
