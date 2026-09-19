INSERT INTO scenarios (slug, title, description, platforms, price) VALUES
  (
    'multi-photo-studio',
    '3D Studio — фото с нескольких ракурсов',
    'Загрузите 1–5 фото товара с разных сторон. ИИ анализирует форму, материалы и цвета, затем создаёт профессиональный studio hero shot с объёмной перспективой, готовый для карточки WB/Ozon.',
    ARRAY['ozon', 'wb'],
    39.90
  )
ON CONFLICT (slug) DO NOTHING;
