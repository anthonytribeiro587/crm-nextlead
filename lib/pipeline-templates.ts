export type PipelineTemplateKey = "comercial" | "prototipos" | "os" | "personalizado";

export const PIPELINE_TEMPLATES: Record<PipelineTemplateKey, { label: string; description: string; stages: Array<{ title: string; color: string }> }> = {
  comercial: {
    label: "Comercial",
    description: "Venda, proposta e fechamento.",
    stages: [
      { title: "Novo lead", color: "#3b82f6" },
      { title: "Contato feito", color: "#06b6d4" },
      { title: "Diagnóstico", color: "#8b5cf6" },
      { title: "Proposta enviada", color: "#f59e0b" },
      { title: "Negociação", color: "#ec4899" },
      { title: "Fechado", color: "#22c55e" },
    ],
  },
  prototipos: {
    label: "Protótipos",
    description: "Controle de prévias, ajustes e aprovação do cliente.",
    stages: [
      { title: "Briefing recebido", color: "#38bdf8" },
      { title: "Em criação", color: "#8b5cf6" },
      { title: "Revisão interna", color: "#f59e0b" },
      { title: "Enviado ao cliente", color: "#06b6d4" },
      { title: "Ajustes solicitados", color: "#ec4899" },
      { title: "Aprovado", color: "#22c55e" },
    ],
  },
  os: {
    label: "Ordem de serviço",
    description: "Execução operacional depois da venda.",
    stages: [
      { title: "Aberta", color: "#3b82f6" },
      { title: "Em diagnóstico", color: "#8b5cf6" },
      { title: "Aguardando aprovação", color: "#f59e0b" },
      { title: "Em execução", color: "#06b6d4" },
      { title: "Aguardando material", color: "#ec4899" },
      { title: "Entregue", color: "#22c55e" },
    ],
  },
  personalizado: {
    label: "Personalizado",
    description: "Etapas simples para ajustar depois.",
    stages: [
      { title: "Entrada", color: "#3b82f6" },
      { title: "Em andamento", color: "#06b6d4" },
      { title: "Revisão", color: "#f59e0b" },
      { title: "Concluído", color: "#22c55e" },
    ],
  },
};
