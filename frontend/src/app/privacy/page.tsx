import Link from 'next/link';

export const metadata = {
  title: 'Политика конфиденциальности — NeuroGrid',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
            ← NeuroGrid
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Политика конфиденциальности</h1>
          <p className="text-slate-500 text-sm mb-8">Последнее обновление: сентябрь 2026 г.</p>

          <div className="prose prose-slate max-w-none space-y-6 text-slate-700">

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">1. Общие положения</h2>
              <p>
                NeuroGrid («Сервис», «мы») предоставляет платформу автоматизации маркетплейсов.
                Настоящая политика описывает, какие данные мы собираем, как используем и защищаем их.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">2. Какие данные мы собираем</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Адрес электронной почты и имя при регистрации</li>
                <li>Данные Google-аккаунта при входе через Google (email, имя, Google ID)</li>
                <li>API-ключи маркетплейсов (Wildberries, Ozon), которые вы добавляете — хранятся в зашифрованном виде</li>
                <li>История запусков сценариев и результаты работы</li>
                <li>Технические данные: IP-адрес, браузер, дата и время запросов</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">3. Как мы используем данные</h2>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Для предоставления функций сервиса (генерация контента, аналитика маркетплейсов)</li>
                <li>Для аутентификации и безопасности аккаунта</li>
                <li>Для отправки транзакционных писем (сброс пароля)</li>
                <li>Для улучшения качества сервиса</li>
              </ul>
              <p className="text-sm mt-2">
                Мы не продаём и не передаём ваши данные третьим лицам в маркетинговых целях.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">4. Хранение и защита данных</h2>
              <p className="text-sm">
                API-ключи маркетплейсов шифруются алгоритмом AES-256-GCM перед сохранением в базу данных.
                Пароли хранятся в виде bcrypt-хэша. Передача данных осуществляется по протоколу HTTPS.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">5. Данные Google</h2>
              <p className="text-sm">
                При входе через Google мы получаем ваш email, имя и уникальный Google ID.
                Мы не запрашиваем доступ к вашей почте, контактам или другим Google-сервисам.
                Использование данных Google соответствует{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  политике Google API Services User Data Policy
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">6. Файлы cookie</h2>
              <p className="text-sm">
                Мы используем только технически необходимые данные в localStorage браузера для хранения токена авторизации.
                Сторонние аналитические или рекламные cookie не используются.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">7. Ваши права</h2>
              <p className="text-sm">
                Вы можете запросить удаление своего аккаунта и всех связанных данных, написав на адрес поддержки.
                После удаления данные не подлежат восстановлению.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">8. Контакты</h2>
              <p className="text-sm">
                По вопросам конфиденциальности: <a href="mailto:support@neurogrid.network" className="text-purple-600 hover:underline">support@neurogrid.network</a>
              </p>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
