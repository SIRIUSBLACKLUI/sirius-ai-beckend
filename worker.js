// SIRIUS AI Worker v2.18.0 - OpenAI Professor + System Core
// Cloudflare Workers AI binding: AI
// Optional secret: OPENAI_API_KEY (recommended for Professor SIRIUS)
// Optional variable: OPENAI_MODEL (default: gpt-5.6-terra)
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set(["https://siriusblacklui.github.io"]);

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://siriusblacklui.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

function clampText(v, n = 12000) { return String(v ?? "").slice(0, n); }
function safeArray(v, n = 6) { return Array.isArray(v) ? v.slice(0, n).map(x => clampText(x, 400)) : []; }

function parseAIResponse(result) {
  let output = result?.response ?? result;
  if (typeof output === "string") {
    const raw = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try { output = JSON.parse(raw); }
    catch {
      const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
      if (a >= 0 && b > a) { try { output = JSON.parse(raw.slice(a, b + 1)); } catch {} }
      if (typeof output === "string") return { reply: raw };
    }
  }
  return output && typeof output === "object" ? output : {};
}

async function runCloudflareStructured(env, systemPrompt, userPrompt, schema, max_tokens = 1600, temperature = 0.25) {
  if (!env.AI) throw new Error("Binding Workers AI 'AI' ausente.");
  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    response_format: { type: "json_schema", json_schema: schema },
    max_tokens,
    temperature
  });
  return parseAIResponse(result);
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    if (item?.type === "message") {
      for (const c of item.content || []) if ((c?.type === "output_text" || c?.type === "text") && c.text) return String(c.text).trim();
    }
  }
  return "";
}

async function runOpenAIStructured(env, instructions, input, schema, name, max_output_tokens = 2200, reasoning = "medium") {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada.");
  const model = clampText(env.OPENAI_MODEL || "gpt-5.6-terra", 80);
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input,
      reasoning: { effort: reasoning },
      max_output_tokens,
      store: false,
      text: { format: { type: "json_schema", name, strict: true, schema } }
    })
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(p?.error?.message || `OpenAI HTTP ${r.status}`);
  const raw = extractOpenAIText(p);
  if (!raw) throw new Error("OpenAI retornou resposta vazia.");
  try { return JSON.parse(raw); }
  catch { throw new Error("Resposta estruturada da OpenAI não pôde ser interpretada."); }
}

async function runBestStructured(env, instructions, input, schema, name, opts = {}) {
  if (env.OPENAI_API_KEY) {
    try { return { data: await runOpenAIStructured(env, instructions, input, schema, name, opts.max || 2200, opts.reasoning || "medium"), engine: "openai" }; }
    catch (e) { console.error("OPENAI FALLBACK", e); }
  }
  return { data: await runCloudflareStructured(env, instructions, input, schema, opts.max || 1800, opts.temp ?? 0.25), engine: "cloudflare" };
}

const professorSchema = {
  type: "object", additionalProperties: false,
  properties: {
    phase: { type: "string", enum: ["diagnostic", "lesson", "practice", "test", "complete"] },
    objective: { type: "string" },
    teacher: { type: "string" },
    feedback: { type: "string" },
    question: { type: "string" },
    score: { type: ["number", "null"] },
    strengths: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    next: { type: "string" },
    difficulty: { type: "string", enum: ["iniciante", "basico", "intermediario", "avancado"] },
    method: { type: "string" }
  },
  required: ["phase","objective","teacher","feedback","question","score","strengths","gaps","summary","next","difficulty","method"]
};

const evaluationSchema = {
  type: "object", additionalProperties: false,
  properties: {
    score: { type: "number" }, feedback: { type: "string" },
    strengths: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } }
  },
  required: ["score","feedback","strengths","gaps"]
};

const generalSchema = {
  type: "object", additionalProperties: false,
  properties: {
    reply: { type: "string" },
    action_type: { type: "string", enum: ["NONE", "PROPOSE_MISSION"] },
    reason: { type: "string" }, mission_name: { type: "string" }, mission_desc: { type: "string" },
    mission_attr: { type: "string", enum: ["Disciplina","Fisico","Intelecto","Comunicacao","Foco","Relacionamento","Organizacao"] },
    mission_difficulty: { type: "string", enum: ["Microacao","Simples","Normal","Dificil","Especial"] },
    mission_validation: { type: "string", enum: ["action","study"] }, mission_evidence: { type: "string" }
  },
  required: ["reply","action_type","reason","mission_name","mission_desc","mission_attr","mission_difficulty","mission_validation","mission_evidence"]
};

const BASE_SYSTEM = `
Você é SIRIUS, o núcleo inteligente de um sistema pessoal de evolução gamificado.
Fale em português do Brasil. Você NÃO é um assistente genérico e não deve dizer frases como “estou aqui para ajudar”, “como posso ajudar?” ou elogios vazios.
Sua presença deve parecer uma interface de sistema: precisa, estratégica, concisa e contextual.
Use o contexto do jogador como fonte de verdade para nível, XP, atributos, missões, biblioteca e progresso.
Nunca invente progresso, atividades realizadas ou recompensas. Você não concede XP/PD diretamente.
Quando for útil, estruture a resposta com marcadores curtos como [ SIRIUS // ANÁLISE ], [ DIRETRIZ ], [ ALERTA ], [ PRÓXIMA AÇÃO ].
`.trim();

const PROFESSOR_SYSTEM = `
${BASE_SYSTEM}

Você está em MODO PROFESSOR SIRIUS. Seu padrão de qualidade deve se aproximar de uma boa tutoria individual por chat.
OBJETIVO: ensinar o aluno a compreender e usar o conhecimento, não apenas produzir um resumo.

PROTOCOLO PEDAGÓGICO:
1. Na primeira interação, faça um diagnóstico curto e útil. Em vez de assumir nível, descubra nível/objetivo com UMA pergunta que seja respondível em poucas linhas. Você pode incluir uma microexplicação de 2-4 frases para contextualizar.
2. Depois do diagnóstico, ensine em MICRO-BLOCOS. Cada turno deve ter apenas um conceito central ou habilidade, uma explicação clara, um exemplo concreto e UMA pergunta/exercício.
3. Nunca despeje “conceitos essenciais + erros + fontes + várias perguntas” de uma vez. A aula é uma conversa progressiva.
4. Corrija exatamente o que o aluno escreveu: aponte acertos específicos, erro/lacuna específica e explique por que.
5. Se houver dificuldade, simplifique, use analogia ou novo exemplo e teste novamente. Se houver domínio, aumente profundidade, transferência e dificuldade.
6. Varie métodos: recuperação ativa, exemplo/contraexemplo, Feynman, aplicação, comparação, resolução de problema, mini-simulação. Informe em method o método dominante do turno.
7. Não infantilize adultos. Evite elogios automáticos como “muito bem” sem evidência.
8. Para idiomas, não ensine alfabeto automaticamente. Primeiro descubra objetivo e nível; priorize uso real, compreensão, produção e correção contextual.
9. Para finanças, não trate “finanças” como lista genérica. Descubra objetivo (pessoal, investimentos, negócio, prova etc.) e avance por conceitos encadeados e problemas reais.
10. Avaliação final somente após material suficiente (normalmente 6+ interações úteis). Deve testar compreensão, aplicação e transferência, sem dar resposta antes.
11. Nota final 0-100. Aprovação mínima 70. strengths e gaps devem ser concretos.
12. Em assuntos atuais/factuais, não finja pesquisa. Se não houver ferramenta de pesquisa nessa execução, sinalize limites.
13. Retorne SOMENTE o JSON do schema solicitado.
`.trim();

function normalizeLesson(x) {
  const phases = ["diagnostic","lesson","practice","test","complete"];
  return {
    phase: phases.includes(x?.phase) ? x.phase : "lesson",
    objective: clampText(x?.objective, 700), teacher: clampText(x?.teacher, 7000), feedback: clampText(x?.feedback, 2500),
    question: clampText(x?.question, 1800), score: x?.score == null ? null : Math.max(0, Math.min(100, Number(x.score) || 0)),
    strengths: safeArray(x?.strengths), gaps: safeArray(x?.gaps), summary: clampText(x?.summary, 2200), next: clampText(x?.next, 1200),
    difficulty: ["iniciante","basico","intermediario","avancado"].includes(x?.difficulty) ? x.difficulty : "basico",
    method: clampText(x?.method || "tutoria adaptativa", 300)
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method === "GET" && url.pathname === "/") {
      const engine = env.OPENAI_API_KEY ? `OPENAI ${env.OPENAI_MODEL || "gpt-5.6-terra"}` : "CLOUDFLARE FALLBACK";
      return new Response(`SIRIUS AI ONLINE // v2.18.0 // PROFESSOR ADAPTATIVO // ${engine}`, { status: 200, headers });
    }
    if (request.method !== "POST" || url.pathname !== "/ai") return new Response("Not found", { status: 404, headers });

    try {
      const body = await request.json();
      const task = clampText(body.task || "chat", 80).trim();
      const message = clampText(body.message, 12000).trim();
      const context = body.context || {};
      const history = Array.isArray(body.history) ? body.history.slice(-16) : [];
      const professorSession = body.professorSession && typeof body.professorSession === "object" ? body.professorSession : null;
      if (!message) return json({ error: "Mensagem vazia." }, 400, headers);

      if (["professor_start","professor_turn","professor_teach"].includes(task)) {
        const session = professorSession ? {
          topic: professorSession.topic, objective: professorSession.objective, phase: professorSession.phase, turn: professorSession.turn,
          messages: Array.isArray(professorSession.messages) ? professorSession.messages.slice(-16) : []
        } : { topic: "", turn: 0, messages: [] };
        const input = `TAREFA: ${task}\nSESSÃO: ${JSON.stringify(session)}\nCONTEXTO DO JOGADOR: ${JSON.stringify(context).slice(0,14000)}\nINSTRUÇÃO DO APP: ${message}\n\nConduza apenas o PRÓXIMO passo da tutoria. Não transforme a aula em artigo.`;
        const res = await runBestStructured(env, PROFESSOR_SYSTEM, input, professorSchema, "sirius_professor_turn", { max: 2800, reasoning: "medium", temp: 0.25 });
        return json({ lesson: normalizeLesson(res.data), action: null, engine: res.engine }, 200, headers);
      }

      if (["evaluate_learning","evaluate_evolution"].includes(task)) {
        const instructions = `${BASE_SYSTEM}\nMODO AVALIADOR: avalie somente a evidência fornecida. Seja rigoroso, específico e pedagógico. Nota 0-100.`;
        const input = `${message}\nCONTEXTO: ${JSON.stringify(context).slice(0,10000)}\nDADOS: ${JSON.stringify(task === "evaluate_learning" ? { submission: body.submission, mission: body.mission } : { attribute: body.attribute, proof: body.proof }).slice(0,10000)}`;
        const res = await runBestStructured(env, instructions, input, evaluationSchema, "sirius_evaluation", { max: 1300, reasoning: "medium", temp: 0.15 });
        const e = res.data || {}; e.score = Math.max(0, Math.min(100, Number(e.score)||0)); e.feedback = clampText(e.feedback || "Avaliação concluída.", 2500); e.strengths=safeArray(e.strengths,5); e.gaps=safeArray(e.gaps,5);
        return json({ evaluation:e, reply:JSON.stringify(e), action:null, engine:res.engine }, 200, headers);
      }

      if (task === "professor_lesson" || task === "research_lesson") {
        const schema = { type:"object", additionalProperties:false, properties:{ reply:{type:"string"} }, required:["reply"] };
        const input = `${message}\nCONTEXTO: ${JSON.stringify(context).slice(0,12000)}\nDADOS: ${JSON.stringify({lesson:body.lesson||null,profile:body.profile||null}).slice(0,8000)}`;
        const res = await runBestStructured(env, `${PROFESSOR_SYSTEM}\nProduza orientação didática específica, sem inventar pesquisa.`, input, schema, "sirius_lesson_support", { max:2200, reasoning:"medium" });
        return json({ reply:clampText(res.data?.reply,7000), action:null, engine:res.engine },200,headers);
      }

      const transcript = history.map(h => `${h.role === "assistant" ? "SIRIUS" : "JOGADOR"}: ${clampText(h.text,2000)}`).join("\n");
      const instructions = `${BASE_SYSTEM}\n
MODO NÚCLEO:
- Responda como um SISTEMA, não como chatbot de atendimento.
- Use dados concretos do contexto quando existirem. Se o comando for vago, dê uma leitura curta do estado e peça UMA decisão específica.
- Só proponha missão se o jogador pedir explicitamente. Evite repetir material/estrutura recente.
- Atributos: Disciplina, Fisico, Intelecto, Comunicacao, Foco, Relacionamento, Organizacao.
- Toda missão deve ter condição observável e evidência. Livro é opcional.
- Se não houver missão, action_type=NONE e ainda preencha os campos de missão com strings vazias e valores válidos.`;
      const input = `CONTEXTO: ${JSON.stringify(context).slice(0,16000)}\nHISTÓRICO: ${transcript || "(sem histórico)"}\nCOMANDO: ${message}`;
      const res = await runBestStructured(env, instructions, input, generalSchema, "sirius_core_response", { max:1800, reasoning:"low", temp:0.25 });
      const o = res.data || {};
      let action = null;
      if (o.action_type === "PROPOSE_MISSION") action = { type:"PROPOSE_MISSION", reason:clampText(o.reason,500), mission:{ name:clampText(o.mission_name||"Missão SIRIUS",80), desc:clampText(o.mission_desc,650), attr:clampText(o.mission_attr||"Disciplina",30), difficulty:clampText(o.mission_difficulty||"Normal",30), validation:o.mission_validation === "study" ? "study" : "action", evidence:clampText(o.mission_evidence,400) } };
      return json({ reply:clampText(o.reply,7000).trim(), action, engine:res.engine },200,headers);
    } catch (err) {
      console.error("SIRIUS AI ERROR", err);
      return json({ error:"Falha interna do núcleo de inteligência.", details:String(err?.message || err) },500,headers);
    }
  }
};
