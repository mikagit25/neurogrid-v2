import Link from 'next/link';

export const metadata = {
  title: 'Условия использования — NeuroGrid',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-purple-600 hover:text-purple-700 text-sm font-medium">
            ← NeuroGrid
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Условия использования</h1>
          <p className="text-slate-500 text-sm mb-8">Последнее обновление: сентябрь 2026 г.</p>

          <div className="prose prose-slate max-w-none space-y-8 text-sm text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">1. Общие положения</h2>
              <p>Настоящие Условия использования (далее — «Условия») регулируют порядок доступа и использования платформы NeuroGrid (далее — «Платформа»), расположенной по адресу neurogrid.network. Использование Платформы означает полное и безоговорочное принятие настоящих Условий.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">2. Учётная запись</h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600">
                <li>Для использования Платформы необходима регистрация и создание учётной записи.</li>
                <li>Пользователь несёт ответственность за сохранность своих учётных данных (логина и пароля).</li>
                <li>Запрещается передача учётной записи третьим лицам без предварительного письменного согласия NeuroGrid.</li>
                <li>NeuroGrid вправе заблокировать учётную запись при нарушении настоящих Условий.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">3. Допустимое использование</h2>
              <p className="mb-3">Пользователь обязуется использовать Платформу исключительно в законных целях и не вправе:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-600">
                <li>нарушать законодательство Республики Беларусь и международное право;</li>
                <li>осуществлять несанкционированный доступ к системам Платформы;</li>
                <li>распространять вредоносное программное обеспечение;</li>
                <li>осуществлять автоматизированные запросы (scraping), не предусмотренные API Платформы;</li>
                <li>использовать Платформу для спама или мошеннических действий;</li>
                <li>нарушать права третьих лиц, включая права интеллектуальной собственности.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">4. Подключение к маркетплейсам</h2>
              <p>Пользователь самостоятельно несёт ответственность за соблюдение условий использования API маркетплейсов (WildBerries, Ozon, Яндекс Маркет, Мегамаркет) при подключении их учётных записей к Платформе. NeuroGrid не несёт ответственности за блокировку аккаунтов маркетплейсов, возникшую вследствие действий пользователя.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">5. Тарифы и оплата</h2>
              <ul className="list-disc list-inside space-y-2 text-slate-600">
                <li>Актуальные тарифы опубликованы на странице <Link href="/#pricing" className="text-purple-600 hover:underline">Тарифы</Link>.</li>
                <li>Оплата производится путём пополнения баланса Платформы. Списание средств происходит при использовании платных функций.</li>
                <li>NeuroGrid вправе в одностороннем порядке изменять стоимость услуг с уведомлением пользователей за 7 дней.</li>
                <li>Возврат средств осуществляется в соответствии с <Link href="/oferta" className="text-purple-600 hover:underline">Публичным договором оказания услуг</Link>.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">6. Интеллектуальная собственность</h2>
              <p>Все права на Платформу, включая программный код, дизайн, логотипы, алгоритмы и контент, принадлежат NeuroGrid. Пользователю предоставляется ограниченная, неисключительная, непередаваемая лицензия на использование Платформы в личных или коммерческих целях в соответствии с настоящими Условиями.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">7. Отказ от ответственности</h2>
              <p>Платформа предоставляется «как есть». NeuroGrid не гарантирует непрерывную доступность сервиса и точность аналитических данных. Рекомендации AI-советников носят информационный характер и не являются финансовыми советами. Решения о ценообразовании, закупках и продажах пользователь принимает самостоятельно.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">8. Ограничение ответственности</h2>
              <p>NeuroGrid не несёт ответственности за косвенные, случайные или штрафные убытки, включая упущенную выгоду, возникшие в результате использования или невозможности использования Платформы.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">9. Изменение условий</h2>
              <p>NeuroGrid вправе обновлять настоящие Условия. При существенных изменениях пользователи получат уведомление по email. Продолжение использования Платформы после публикации изменений означает согласие с новыми Условиями.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">10. Расторжение</h2>
              <p>Пользователь вправе в любой момент удалить учётную запись. NeuroGrid вправе прекратить предоставление доступа при нарушении настоящих Условий. При расторжении остаток баланса возвращается в соответствии с Публичным договором.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">11. Применимое право</h2>
              <p>Настоящие Условия регулируются законодательством Республики Беларусь. Все споры разрешаются в соответствии с процедурой, предусмотренной <Link href="/oferta" className="text-purple-600 hover:underline">Публичным договором оказания услуг</Link>.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">12. Контакты</h2>
              <p>По вопросам, связанным с настоящими Условиями, обращайтесь:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 mt-2">
                <li>Email: <a href="mailto:support@neurogrid.network" className="text-purple-600 hover:underline">support@neurogrid.network</a></li>
                <li>Telegram: <a href="https://t.me/neurogrid_support" className="text-purple-600 hover:underline">@neurogrid_support</a></li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
