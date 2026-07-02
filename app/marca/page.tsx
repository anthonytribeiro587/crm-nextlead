export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MarcaPage() {
  return (
    <>
      <div className="topbar page-heading-v14">
        <div>
          <p className="eyebrow">Marca e empresa</p>
          <h1>White label do CRM.</h1>
          <p className="description">Base preparada para personalizar nome, logo, cores e identidade por cliente.</p>
        </div>
      </div>
      <section className="standard-grid-v14 two">
        <article className="card standard-card-v14">
          <p className="eyebrow-small">Personalização</p>
          <h2>Identidade visual</h2>
          <p className="muted">A estrutura SaaS já suporta marca por empresa. A edição visual completa entra na próxima etapa do painel administrativo.</p>
          <div className="flow-line">
            <span className="flow-chip">Nome do app</span>
            <span className="flow-chip">Logo</span>
            <span className="flow-chip">Tema claro/escuro</span>
            <span className="flow-chip">Cor principal</span>
          </div>
        </article>
        <article className="card standard-card-v14">
          <p className="eyebrow-small">Tema</p>
          <h2>Modo claro como padrão</h2>
          <p className="muted">Para clientes finais, o tema claro tende a ser mais familiar. O modo escuro continua disponível no botão da barra lateral.</p>
        </article>
      </section>
    </>
  );
}
