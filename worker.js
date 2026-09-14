// SIRIUS AI Worker v2.17.1
// Mission Proposal Action Fix
// Cloudflare Workers AI binding required: AI
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set([
  "https://siriusblacklui.github.io"
]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://siriusblacklui.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isExplicitMissionRequest(message) {
  const t = normalizeText(message);
  const hasMissionWord = t.includes("missao") || t.includes("tarefa") || t.includes("quest");
  const hasCreateVerb = t.includes("crie") || t.includes("criar") || t.includes("gere") || t.includes("gerar") || t.includes("proponha") || t.includes("propor") || t.includes("me de");
  return hasMissionWord && hasCreateVerb;
}

function mapAttrToFrontend(value) {
  const t = normalizeText(value);
  const map = {
    "disciplina": "Disciplina",
    "fisico": "Físico",
    "intelecto": "Intelecto",
    "comunicacao": "Comunicação",
    "foco": "Foco",
    "relacionamento": "Relacionamento",
    "organizacao": "Organização"
  };
  return map[t] || "Disciplina";
}

function safeDifficulty(value) {
  const t = normalizeText(value);
  if (t === "microacao") return "Microacao";
  if (t === "simples") return "Simples";
  if (t === "normal") return "Normal";
  if (t === "dificil") return "Dificil";
  if (t === "especial") return "Especial";
  return "Normal";
}

function buildFallbackMission(context = {}) {
  const attrs = context.attributes || {};
  let chosen = "Disciplina";
  let lowestScore = Infinity;
  for (const [name, info] of Object.entries(attrs)) {
    const level = Number(info?.level || 1);
    const pd = Number(info?.pd || 0);
    const score = level * 100 + pd;
    if (score < lowestScore) {
      lowestScore = score;
      chosen = name;
    }
  }
  const attr = mapAttrToFrontend(chosen);
  const missions = Array.isArray(context.activeMissions) ? context.activeMissions : [];
  if (missions.length >= 4) {
    return {
      name: "Retomar Controle",
      desc: "Escolha uma missão ativa prioritária e execute 20 minutos de trabalho focado sem iniciar uma nova tarefa.",
      attr: "Foco",
      difficulty: "Simples",
      validation: "action",
      evidence: "Informe qual missão foi escolhida e o que avançou durante os 20 minutos."
    };
  }
  return {
    name: `Avanço de ${attr}`,
    desc: `Execute uma ação concreta de 20 minutos que desenvolva ${attr} e produza um resultado observável.`,
    attr,
    difficulty: "Simples",
    validation: attr === "Intelecto" ? "study" : "action",
    evidence: attr === "Intelecto"
      ? "Explique com suas próprias palavras o que aprendeu e dê um exemplo de aplicação."
      : "Descreva objetivamente o que foi realizado e qual foi o resultado."
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("SIRIUS AI ONLINE // v2.17.1 // MISSION ACTION FIX ACTIVE", { status: 200, headers });
    }

    if (request.method !== "POST" || url.pathname !== "/ai") {
      return new Response("Not found", { status: 404, headers });
    }

    if (!env.AI) return json({ error: "Binding Workers AI 'AI' ausente." }, 500, headers);

    try {
      const body = await request.json();
      const message = String(body.message || "").trim().slice(0, 5000);
      const context = body.context || {};
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];

      if (!message) return json({ error: "Mensagem vazia." }, 400, headers);

      const missionRequested = isExplicitMissionRequest(message);

      const systemPrompt = `
Voce e SIRIUS, o nucleo inteligente de um sistema pessoal de evolucao gamificado.

PERSONALIDADE:
- Fale em portugues do Brasil.
- Soe como uma interface de Sistema inteligente: preciso, estrategico, firme e levemente cinematografico.
- Evite tom de assistente generico, elogios vazios e excesso de entusiasmo.
- Respostas normalmente curtas e objetivas.

VERDADE E AUTORIDADE:
- O contexto enviado pelo app e a fonte de verdade para nivel, XP, atributos, missoes, biblioteca e progresso.
- Nunca invente progresso, atividades realizadas ou recompensas.
- Voce NAO concede XP/PD e NAO registra missoes diretamente.
- Quando sugerir uma missao, ela e apenas uma PROPOSTA. O aplicativo exige aprovacao do jogador.

MISSOES:
- Se o comando atual pedir uma missao explicitamente, action_type DEVE ser "PROPOSE_MISSION".
- Se o jogador pedir uma missao para hoje, proponha uma missao concreta imediatamente. Nao pergunte primeiro qual objetivo ele quer.
- Use o contexto atual para escolher algo relevante.
- Evite duplicar uma missao ativa muito parecida.
- Atributos permitidos: Disciplina, Fisico, Intelecto, Comunicacao, Foco, Relacionamento, Organizacao.
- Dificuldades permitidas: Microacao, Simples, Normal, Dificil, Especial.
- mission_validation deve ser "study" para estudo/aprendizagem; caso contrario "action".
- Toda missao deve ter uma condicao observavel de conclusao e uma evidencia clara.
- Se nao houver proposta, use action_type = "NONE".
`.trim();

      const transcript = history.map((h) => {
        const role = h.role === "assistant" ? "SIRIUS" : "JOGADOR";
        return `${role}: ${String(h.text || "").slice(0, 2000)}`;
      }).join("\n");

      const userPrompt = `
CONTEXTO ATUAL:
${JSON.stringify(context)}

HISTORICO RECENTE:
${transcript || "(sem historico)"}

COMANDO ATUAL:
${message}

PEDIDO_EXPLICITO_DE_MISSAO:
${missionRequested ? "SIM" : "NAO"}
`.trim();

      const schema = {
        type: "object",
        properties: {
          reply: { type: "string" },
          action_type: { type: "string", enum: ["NONE", "PROPOSE_MISSION"] },
          reason: { type: "string" },
          mission_name: { type: "string" },
          mission_desc: { type: "string" },
          mission_attr: { type: "string", enum: ["Disciplina", "Fisico", "Intelecto", "Comunicacao", "Foco", "Relacionamento", "Organizacao"] },
          mission_difficulty: { type: "string", enum: ["Microacao", "Simples", "Normal", "Dificil", "Especial"] },
          mission_validation: { type: "string", enum: ["action", "study"] },
          mission_evidence: { type: "string" }
        },
        required: ["reply", "action_type", "reason", "mission_name", "mission_desc", "mission_attr", "mission_difficulty", "mission_validation", "mission_evidence"]
      };

      const result = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_schema", json_schema: schema },
          max_tokens: 1100,
          temperature: 0.25
        }
      );

      let output = result?.response;
      if (typeof output === "string") {
        try { output = JSON.parse(output); } catch { output = null; }
      }

      if (!output || typeof output.reply !== "string") {
        if (missionRequested) {
          const fallback = buildFallbackMission(context);
          return json({
            reply: "[ SIRIUS // MISSAO ] Proposta gerada com base no seu estado atual. Aguardo sua aprovacao.",
            action: {
              type: "PROPOSE_MISSION",
              reason: "Pedido explícito de missão detectado. Foi usada uma proposta segura baseada no estado atual do jogador.",
              mission: fallback
            }
          }, 200, headers);
        }
        return json({ reply: "[ SIRIUS // FALHA DE FORMATO ] A resposta nao pôde ser interpretada com seguranca.", action: null }, 200, headers);
      }

      let action = null;
      const shouldPropose = missionRequested || output.action_type === "PROPOSE_MISSION";

      if (shouldPropose) {
        const fallback = buildFallbackMission(context);
        action = {
          type: "PROPOSE_MISSION",
          reason: String(output.reason || "Missão proposta a partir do estado atual do jogador.").slice(0, 500),
          mission: {
            name: String(output.mission_name || fallback.name).slice(0, 80),
            desc: String(output.mission_desc || fallback.desc).slice(0, 500),
            attr: mapAttrToFrontend(output.mission_attr || fallback.attr),
            difficulty: safeDifficulty(output.mission_difficulty || fallback.difficulty),
            validation: output.mission_validation === "study" ? "study" : fallback.validation,
            evidence: String(output.mission_evidence || fallback.evidence).slice(0, 300)
          }
        };
      }

      return json({ reply: String(output.reply || "").trim(), action }, 200, headers);

    } catch (err) {
      console.error("SIRIUS AI ERROR", err);
      return json({ error: "Falha interna do nucleo de inteligencia.", details: String(err?.message || err) }, 500, headers);
    }
  }
};
