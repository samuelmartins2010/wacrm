export const metadata = {
  title: "Termos de Uso",
};

export default function TermosPage() {
  return (
    <article className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Termos de Uso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {new Date().toLocaleDateString("pt-BR")}
        </p>
      </div>
           
      <Section title="1. Quem somos">
        <p>
          A plataforma Clientizza (&quot;Clientizza&quot;, &quot;nós&quot;) é
          operada por Samuel Anderson de Amorim Martins, inscrito no CNPJ sob
          o nº 50.879.523/0001-28 (&quot;Prestador&quot;). Ao criar uma conta
          ou utilizar a plataforma, você (&quot;Cliente&quot;) concorda com
          estes Termos de Uso.
        </p>
      </Section>

      <Section title="2. O que é o Clientizza">
        <p>
          O Clientizza é uma plataforma de CRM (gestão de relacionamento com
          clientes) para WhatsApp, que permite centralizar conversas,
          organizar contatos, automatizar mensagens e acompanhar funis de
          atendimento e vendas através da API oficial do WhatsApp (Meta Cloud
          API).
        </p>
      </Section>

      <Section title="3. Cadastro e contas">
        <p>
          O acesso à plataforma é concedido por convite do administrador da
          conta contratante. Cada pessoa convidada é responsável por manter a
          confidencialidade de sua senha e por todas as atividades realizadas
          através do seu login. O Cliente deve nos avisar imediatamente sobre
          qualquer uso não autorizado da sua conta.
        </p>
      </Section>

      <Section title="4. Uso aceitável">
        <p>Ao usar o Clientizza, você concorda em não:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Enviar mensagens em massa não solicitadas (spam) ou violar as
            políticas comerciais e de uso da Meta/WhatsApp;
          </li>
          <li>
            Usar a plataforma para fins ilegais, fraudulentos, discriminatórios
            ou que violem direitos de terceiros;
          </li>
          <li>
            Tentar acessar áreas, dados ou contas de outros clientes sem
            autorização, ou comprometer a segurança da plataforma;
          </li>
          <li>
            Realizar engenharia reversa, copiar ou revender a plataforma sem
            autorização prévia por escrito.
          </li>
        </ul>
        <p className="mt-2">
          O descumprimento destas regras pode levar à suspensão ou
          encerramento da conta, sem prejuízo de outras medidas cabíveis.
        </p>
      </Section>

      <Section title="5. Responsabilidades do Cliente">
        <p>
          O Cliente é o responsável legal (controlador, nos termos da LGPD)
          pelos dados de seus próprios contatos e clientes finais que trata
          através da plataforma — o Clientizza atua como operador desses
          dados, processando-os apenas conforme as instruções e configurações
          definidas pelo Cliente. Cabe ao Cliente garantir que possui base
          legal adequada para enviar mensagens aos seus contatos via WhatsApp.
        </p>
      </Section>

      <Section title="6. Disponibilidade do serviço">
        <p>
          Empregamos esforços razoáveis para manter a plataforma disponível e
          funcionando corretamente, mas não garantimos disponibilidade
          ininterrupta. Manutenções programadas, falhas de infraestrutura de
          terceiros (incluindo a API do WhatsApp/Meta) ou eventos fora do
          nosso controle podem causar indisponibilidade temporária.
        </p>
      </Section>

      <Section title="7. Planos e pagamento">
        <p>
          Os valores, formas de pagamento e condições de cada plano são os
          informados no momento da contratação. Alterações de preço serão
          comunicadas com antecedência razoável.
        </p>
      </Section>

      <Section title="8. Propriedade intelectual">
        <p>
          A marca Clientizza, o software da plataforma e todo o seu conteúdo
          visual pertencem ao Prestador. O Cliente mantém todos os direitos
          sobre os dados e conteúdos que insere na plataforma (contatos,
          mensagens, automações configuradas, etc.).
        </p>
      </Section>

      <Section title="9. Cancelamento e encerramento">
        <p>
          O Cliente pode cancelar sua conta a qualquer momento entrando em
          contato pelo suporte. Reservamo-nos o direito de suspender ou
          encerrar contas que violem estes Termos, mediante aviso sempre que
          possível.
        </p>
      </Section>

      <Section title="10. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela lei, o Clientizza não se
          responsabiliza por danos indiretos, lucros cessantes ou perda de
          dados decorrentes do uso da plataforma, incluindo interrupções
          causadas por terceiros (Meta/WhatsApp, provedores de hospedagem,
          etc.).
        </p>
      </Section>

      <Section title="11. Alterações destes Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. Alterações relevantes
          serão comunicadas por e-mail ou aviso na plataforma antes de
          entrarem em vigor.
        </p>
      </Section>

      <Section title="12. Legislação aplicável">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do
          Brasil. Fica eleito o foro do domicílio do Prestador para dirimir
          quaisquer controvérsias, salvo disposição legal em contrário.
        </p>
      </Section>

      <Section title="13. Contato">
        <p>
          Dúvidas sobre estes Termos podem ser enviadas para{" "}
          <a
            href="mailto:suporte@clientizza.com"
            className="text-primary hover:underline"
          >
            suporte@clientizza.com
          </a>
          .
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


