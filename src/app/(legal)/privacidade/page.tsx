export const metadata = {
  title: "Política de Privacidade",
};

export default function PrivacidadePage() {
  return (
    <article className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>
      </div>
      
      <Section title="1. Quem trata seus dados">
        <p>
          Esta política é mantida por Samuel Anderson de Amorim Martins,
          inscrito no CNPJ sob o nº 50.879.523/0001-28, operador da
          plataforma Clientizza (&quot;Clientizza&quot;, &quot;nós&quot;).
        </p>
      </Section>

      <Section title="2. Dois papéis diferentes: seus dados x dados dos seus contatos">
        <p>
          É importante entender que o Clientizza lida com dados pessoais em
          dois contextos distintos:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Dados da sua conta</strong> (nome, e-mail, empresa,
            dados de uso da plataforma): aqui o Clientizza é{" "}
            <strong>controlador</strong>, ou seja, decide como e por que
            esses dados são tratados.
          </li>
          <li>
            <strong>Dados dos contatos que você atende pelo WhatsApp</strong>{" "}
            (nomes, números, conteúdo das conversas): aqui o Clientizza atua
            como <strong>operador</strong>, processando esses dados apenas
            conforme as suas instruções e configurações. Você (Cliente) é o
            controlador desses dados e é responsável por ter base legal
            adequada para tratá-los.
          </li>
        </ul>
      </Section>

      <Section title="3. Quais dados coletamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados de cadastro: nome, e-mail, empresa, cargo;</li>
          <li>
            Dados de uso da plataforma: logs de acesso, ações realizadas,
            configurações;
          </li>
          <li>
            Dados de conversas processadas em nome do Cliente através da API
            oficial do WhatsApp (Meta Cloud API): mensagens, contatos,
            mídias trocadas;
          </li>
          <li>
            Dados técnicos: endereço IP, tipo de navegador, cookies
            estritamente necessários ao funcionamento da plataforma.
          </li>
        </ul>
      </Section>

      <Section title="4. Para que usamos esses dados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Viabilizar o funcionamento da plataforma e das automações;</li>
          <li>Autenticação e segurança da conta;</li>
          <li>Suporte técnico e comunicação sobre o serviço;</li>
          <li>Cumprimento de obrigações legais e regulatórias.</li>
        </ul>
        <p className="mt-2">
          Não vendemos dados pessoais a terceiros, nem os usamos para
          publicidade de terceiros.
        </p>
      </Section>

      <Section title="5. Com quem compartilhamos dados">
        <p>Para operar a plataforma, dados podem ser processados por:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Meta/WhatsApp</strong> — como provedora da API oficial
            usada para envio e recebimento de mensagens;
          </li>
          <li>
            <strong>Supabase</strong> — banco de dados e autenticação;
          </li>
          <li>
            <strong>Hostinger</strong> — hospedagem da infraestrutura do
            servidor.
          </li>
        </ul>
        <p className="mt-2">
          Não compartilhamos dados com outros terceiros além dos necessários
          para o funcionamento do serviço, salvo obrigação legal.
        </p>
      </Section>

      <Section title="6. Seus direitos (LGPD, art. 18)">
        <p>Como titular de dados, você pode solicitar a qualquer momento:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            Anonimização, bloqueio ou eliminação de dados desnecessários ou
            tratados em desconformidade com a lei;
          </li>
          <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
          <li>
            Eliminação dos dados tratados com o seu consentimento, quando
            aplicável;
          </li>
          <li>Revogação do consentimento, quando este for a base legal.</li>
        </ul>
        <p className="mt-2">
          Para exercer qualquer um desses direitos, entre em contato pelo
          e-mail informado na seção 9.
        </p>
      </Section>

      <Section title="7. Segurança e retenção">
        <p>
          Adotamos medidas técnicas e organizacionais para proteger os dados
          tratados, incluindo criptografia de credenciais sensíveis e
          controle de acesso por conta (isolamento entre clientes). Mantemos
          os dados pelo tempo necessário para cumprir as finalidades desta
          política ou obrigações legais, e os eliminamos ou anonimizamos após
          esse período.
        </p>
      </Section>

      <Section title="8. Encarregado de dados (DPO)">
        <p>
          Para questões relacionadas à proteção de dados pessoais e à LGPD,
          entre em contato com nosso encarregado de dados pelo e-mail{" "}
          <a
            href="mailto:suporte@clientizza.com"
            className="text-primary hover:underline"
          >
            suporte@clientizza.com
          </a>
          .
        </p>
      </Section>

      <Section title="9. Alterações desta política">
        <p>
          Podemos atualizar esta Política periodicamente. Mudanças relevantes
          serão comunicadas por e-mail ou aviso na plataforma antes de
          entrarem em vigor.
        </p>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
