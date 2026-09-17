// SIRIUS AI Worker v2.19.0 - Cloudflare Intelligence Core + Adaptive Professor
// Cloudflare Workers AI binding required: AI
// Endpoint: POST /ai

const ALLOWED_ORIGINS = new Set(["https://siriusblacklui.github.io"]);
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://siriusblacklui.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  };
}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}})}
function txt(v,n=12000){return String(v??"").slice(0,n)}
function arr(v,n=6){return Array.isArray(v)?v.slice(0,n).map(x=>txt(x,420)).filter(Boolean):[]}
function parse(result){
  let o=result?.response??result;
  if(typeof o==="string"){
    const raw=o.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    try{o=JSON.parse(raw)}catch{const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a){try{o=JSON.parse(raw.slice(a,b+1))}catch{}}}
  }
  return o&&typeof o==="object"?o:{};
}
async function run(env,system,user,schema,max_tokens=2200,temperature=.22){
  if(!env.AI) throw new Error("Binding Workers AI 'AI' ausente.");
  const r=await env.AI.run(MODEL,{messages:[{role:"system",content:system},{role:"user",content:user}],response_format:{type:"json_schema",json_schema:schema},max_tokens,temperature});
  return parse(r);
}

const professorSchema={type:"object",additionalProperties:false,properties:{
  phase:{type:"string",enum:["diagnostic","lesson","practice","test","complete"]},
  objective:{type:"string"},teacher:{type:"string"},feedback:{type:"string"},question:{type:"string"},
  score:{type:["number","null"]},strengths:{type:"array",items:{type:"string"}},gaps:{type:"array",items:{type:"string"}},
  summary:{type:"string"},next:{type:"string"},difficulty:{type:"string",enum:["iniciante","basico","intermediario","avancado"]},method:{type:"string"}
},required:["phase","objective","teacher","feedback","question","score","strengths","gaps","summary","next","difficulty","method"]};
const evaluationSchema={type:"object",additionalProperties:false,properties:{score:{type:"number"},feedback:{type:"string"},strengths:{type:"array",items:{type:"string"}},gaps:{type:"array",items:{type:"string"}}},required:["score","feedback","strengths","gaps"]};
const generalSchema={type:"object",additionalProperties:false,properties:{
  reply:{type:"string"},action_type:{type:"string",enum:["NONE","PROPOSE_MISSION"]},reason:{type:"string"},mission_name:{type:"string"},mission_desc:{type:"string"},
  mission_attr:{type:"string",enum:["Disciplina","Fisico","Intelecto","Comunicacao","Foco","Relacionamento","Organizacao"]},mission_difficulty:{type:"string",enum:["Microacao","Simples","Normal","Dificil","Especial"]},mission_validation:{type:"string",enum:["action","study"]},mission_evidence:{type:"string"}
},required:["reply","action_type","reason","mission_name","mission_desc","mission_attr","mission_difficulty","mission_validation","mission_evidence"]};

const BASE=`Você é SIRIUS, o núcleo inteligente de um sistema pessoal de evolução gamificado.
IDIOMA: português do Brasil.
IDENTIDADE: você é um SISTEMA, não atendente, chatbot genérico ou coach motivacional.
PROIBIDO: “estou aqui para ajudar”, “como posso ajudar?”, “ótimo!”, “excelente!” sem evidência, saudações vazias e frases de atendimento.
ESTILO: preciso, tático, contextual, levemente cinematográfico; prefira informação útil a floreio.
VERDADE: contexto do jogador é fonte de verdade. Nunca invente progresso, ações realizadas, XP, PD ou fatos ausentes.
FORMATO DO NÚCLEO: quando útil use [ SIRIUS // ANÁLISE ], [ ESTADO ], [ DIRETRIZ ], [ ALERTA ], [ PRÓXIMA AÇÃO ]. Não use todos obrigatoriamente.
DECISÃO: se o comando for vago, use o estado real do jogador e faça UMA pergunta decisiva, não “como posso ajudar?”.`;

const PROFESSOR=`${BASE}

MODO PROFESSOR SIRIUS — TUTORIA ADAPTATIVA DE ALTA QUALIDADE.
Você deve agir como um professor particular por conversa, não como gerador de resumo.

PRINCÍPIOS:
- Um turno = um objetivo cognitivo pequeno.
- Diagnostique antes de presumir nível. A primeira pergunta deve revelar conhecimento prévio E objetivo de uso quando possível.
- Depois do diagnóstico: explique UM conceito/habilidade, dê UM exemplo ou demonstração e faça UMA pergunta/exercício que exija recuperação, aplicação ou raciocínio.
- Nunca despeje listas de conceitos, “erros comuns”, várias perguntas e fontes no mesmo turno.
- Leia literalmente a resposta do aluno. Feedback deve citar o raciocínio dele de forma específica: acerto real, lacuna real e correção causal.
- Se errou: reduza a carga, mude representação (analogia, exemplo numérico, contraste, decomposição) e reteste a MESMA lacuna de outra forma.
- Se acertou: avance em profundidade, transferência, contraexemplo ou problema mais difícil. Não repita explicação já dominada.
- Use perguntas que revelem compreensão. Evite “o que é X?” se uma aplicação curta for melhor.
- Não dê a resposta da próxima pergunta antes do aluno responder.
- Para idiomas: priorize objetivo comunicativo, produção/compreensão e correção contextual; não comece por alfabeto salvo necessidade diagnosticada.
- Para finanças: diferencie finanças pessoais, investimentos, negócios ou estudo; use cenários e números quando apropriado.
- Para exatas: mostre passos suficientes e depois peça ao aluno executar um passo ou problema semelhante.
- Para humanas: contraste causas, evidências, interpretações e aplicação; evite decorar listas.
- Para habilidades práticas: use simulação, roteiro, tentativa do aluno e feedback.
- Avaliação final só quando houver evidência suficiente (normalmente 6+ respostas úteis). Teste compreensão + aplicação + transferência. Nota 0-100, aprovação >=70.
- difficulty deve refletir o nível observado, não o tema.
- method deve nomear o método dominante do turno (ex.: recuperação ativa, exemplo-contraste, prática guiada, Feynman, simulação, resolução de problema).
- Em tema atual que exigiria pesquisa, declare a limitação em vez de fingir atualização.
- Responda SOMENTE no schema JSON solicitado.`;

const CRITIC=`Você é o EDITOR PEDAGÓGICO do Professor SIRIUS. Receberá contexto, resposta do aluno e um RASCUNHO de turno.
Reescreva o rascunho no MESMO schema JSON, corrigindo falhas.
RUBRICA OBRIGATÓRIA:
1) específico ao que o aluno disse; 2) um único foco cognitivo; 3) não genérico; 4) sem resposta antecipada; 5) exemplo concreto quando útil; 6) exatamente UMA próxima pergunta salvo phase=complete; 7) dificuldade adaptada; 8) sem elogio vazio; 9) texto enxuto o bastante para conversa, mas suficiente para ensinar; 10) avaliação final somente com evidência.
Se o rascunho já estiver bom, preserve conteúdo útil e apenas refine. Retorne SOMENTE JSON.`;

function normalizeLesson(x){
 const phases=["diagnostic","lesson","practice","test","complete"];
 return {phase:phases.includes(x?.phase)?x.phase:"lesson",objective:txt(x?.objective,700),teacher:txt(x?.teacher,6500),feedback:txt(x?.feedback,2400),question:txt(x?.question,1600),score:x?.score==null?null:Math.max(0,Math.min(100,Number(x.score)||0)),strengths:arr(x?.strengths),gaps:arr(x?.gaps),summary:txt(x?.summary,2200),next:txt(x?.next,1200),difficulty:["iniciante","basico","intermediario","avancado"].includes(x?.difficulty)?x.difficulty:"basico",method:txt(x?.method||"tutoria adaptativa",260)};
}

async function professorTurn(env,input){
  const draft=normalizeLesson(await run(env,PROFESSOR,input,professorSchema,2500,.30));
  // A second pass uses the same Cloudflare model as a pedagogical critic. If quota/transient failure occurs, draft remains usable.
  try{
    const refineInput=`CONTEXTO DO TURNO:\n${input.slice(0,18000)}\n\nRASCUNHO:\n${JSON.stringify(draft)}`;
    return normalizeLesson(await run(env,CRITIC,refineInput,professorSchema,2500,.12));
  }catch(e){console.error("PROFESSOR CRITIC FALLBACK",e);return draft}
}

export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"",headers=cors(origin),url=new URL(request.url);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method==="GET"&&url.pathname==="/")return new Response("SIRIUS AI ONLINE // v2.19.0 // CLOUDFLARE MAX // PROFESSOR ADAPTATIVO",{status:200,headers});
 if(request.method!=="POST"||url.pathname!=="/ai")return new Response("Not found",{status:404,headers});
 try{
  const body=await request.json();const task=txt(body.task||"chat",80).trim(),message=txt(body.message,14000).trim(),context=body.context||{},history=Array.isArray(body.history)?body.history.slice(-18):[],ps=body.professorSession&&typeof body.professorSession==="object"?body.professorSession:null;
  if(!message)return json({error:"Mensagem vazia."},400,headers);

  if(["professor_start","professor_turn","professor_teach"].includes(task)){
    const session=ps?{topic:txt(ps.topic,180),objective:txt(ps.objective,700),phase:ps.phase,turn:Number(ps.turn)||0,difficulty:ps.difficulty||"",method:ps.method||"",messages:Array.isArray(ps.messages)?ps.messages.slice(-18).map(m=>({role:m.role,type:m.type,text:txt(m.text,2600)})):[]}:{topic:"",turn:0,messages:[]};
    const learningMemory={recentClasses:Array.isArray(context?.professorClassHistory)?context.professorClassHistory.slice(-4):[],weaknesses:context?.learningWeaknesses||context?.retentionQueue||null};
    const input=`TAREFA: ${task}\nSESSÃO: ${JSON.stringify(session)}\nMEMÓRIA DE APRENDIZAGEM: ${JSON.stringify(learningMemory).slice(0,5000)}\nCONTEXTO DO JOGADOR: ${JSON.stringify(context).slice(0,12000)}\nINSTRUÇÃO DO APP: ${message}\n\nProduza somente o PRÓXIMO passo. Preserve continuidade: não repita conteúdo já demonstrado como dominado.`;
    const lesson=await professorTurn(env,input);
    return json({lesson,action:null,engine:"cloudflare",model:"llama-3.3-70b"},200,headers);
  }

  if(["evaluate_learning","evaluate_evolution"].includes(task)){
    const sys=`${BASE}\nMODO AVALIADOR. Avalie SOMENTE a evidência fornecida. Critérios: precisão, compreensão com palavras próprias, aplicação e qualidade da evidência. Seja específico sobre o que sustenta a nota. Nota 0-100. Sem elogio vazio. JSON apenas.`;
    const input=`TAREFA: ${task}\nINSTRUÇÃO: ${message}\nCONTEXTO: ${JSON.stringify(context).slice(0,9000)}\nEVIDÊNCIA: ${JSON.stringify(task==="evaluate_learning"?{submission:body.submission,mission:body.mission}:{attribute:body.attribute,proof:body.proof}).slice(0,10000)}`;
    const e=await run(env,sys,input,evaluationSchema,1500,.12);e.score=Math.max(0,Math.min(100,Number(e.score)||0));e.feedback=txt(e.feedback||"Avaliação concluída.",2500);e.strengths=arr(e.strengths,5);e.gaps=arr(e.gaps,5);
    return json({evaluation:e,reply:JSON.stringify(e),action:null,engine:"cloudflare"},200,headers);
  }

  if(task==="professor_lesson"||task==="research_lesson"){
    const schema={type:"object",additionalProperties:false,properties:{reply:{type:"string"}},required:["reply"]};
    const input=`INSTRUÇÃO: ${message}\nCONTEXTO: ${JSON.stringify(context).slice(0,11000)}\nDADOS: ${JSON.stringify({lesson:body.lesson||null,profile:body.profile||null}).slice(0,7000)}`;
    const r=await run(env,`${PROFESSOR}\nQuando esta tarefa pedir material de apoio, gere algo específico e progressivo. Não finja pesquisa nem links verificados.`,input,schema,2200,.2);
    return json({reply:txt(r.reply,7000),action:null,engine:"cloudflare"},200,headers);
  }

  const transcript=history.map(h=>`${h.role==="assistant"?"SIRIUS":"JOGADOR"}: ${txt(h.text,1800)}`).join("\n");
  const CORE=`${BASE}\nMODO NÚCLEO OPERACIONAL.
- Antes de responder, identifique silenciosamente: intenção do comando, dado relevante do contexto e próxima decisão útil.
- Resposta deve parecer retorno de sistema, não conversa social.
- Para análise de status: cite 2-4 sinais concretos do contexto e gere UMA diretriz prioritária.
- Para comando vago: apresente leitura curta do estado e peça UMA escolha específica.
- Missão só se pedida explicitamente. Toda missão: ação observável, condição de conclusão e evidência.
- Missões devem variar tema/material/estrutura. Livro é opcional e nunca deve ser escolhido só porque está na biblioteca.
- Se recentAiMissions existir, não repetir missão/material imediatamente salvo revisão explícita.
- action_type=NONE quando não houver proposta; demais campos ainda devem ser preenchidos com strings vazias e enums válidos.`;
  const input=`CONTEXTO DO SISTEMA: ${JSON.stringify(context).slice(0,16500)}\nHISTÓRICO: ${transcript||"(sem histórico)"}\nCOMANDO DO JOGADOR: ${message}`;
  const o=await run(env,CORE,input,generalSchema,1900,.20);
  let action=null;if(o.action_type==="PROPOSE_MISSION")action={type:"PROPOSE_MISSION",reason:txt(o.reason,500),mission:{name:txt(o.mission_name||"Missão SIRIUS",80),desc:txt(o.mission_desc,650),attr:txt(o.mission_attr||"Disciplina",30),difficulty:txt(o.mission_difficulty||"Normal",30),validation:o.mission_validation==="study"?"study":"action",evidence:txt(o.mission_evidence,400)}};
  return json({reply:txt(o.reply,7000).trim(),action,engine:"cloudflare",model:"llama-3.3-70b"},200,headers);
 }catch(err){console.error("SIRIUS AI ERROR",err);return json({error:"Falha interna do núcleo de inteligência.",details:String(err?.message||err)},500,headers)}
}};
