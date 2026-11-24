import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GITHUB_USERNAME || "rafaelmm16";
const TOKEN = process.env.GITHUB_TOKEN || "";
const MAX_PROJECTS = 7;

const START_MARKER = "<!-- PROJECTS:START -->";
const END_MARKER = "<!-- PROJECTS:END -->";

const IGNORED_REPOS = new Set([USERNAME.toLowerCase()]);

// Metadados curados para projetos conhecidos (mantém descrições e stacks ricas).
// Novos repositórios públicos são incluídos automaticamente usando os dados da API do GitHub.
const CURATED_PROJECTS = {
  "rafaelmm16.github.io": {
    icon: "🌐",
    title: "Portfólio Pessoal",
    pinned: true,
    description:
      "Portfólio interativo apresentando minha trajetória profissional, formação, certificações e vitrine integrada ao GitHub.",
    technologies: ["Next.js", "TypeScript", "Tailwind CSS"],
  },
  rocketseat: {
    icon: "🚀",
    title: "Rocketseat Hub",
    description:
      "Monorepositório e portal unificado reunindo 8 projetos de cursos e eventos da Rocketseat (pass.in, Cook App, My Goals, nivo.video, Orders, To-Do List API, Proffy e Ecoleta).",
    technologies: ["Next.js", "TypeScript", "React Native", "Node.js", "Java"],
  },
  college: {
    icon: "🎓",
    title: "College",
    description:
      "Monorepositório e vitrine interativa reunindo os códigos e projetos de 19 disciplinas da graduação em Sistemas de Informação (como SGBus, Recicla Capixaba e Delivery Web App).",
    technologies: ["Next.js", "TypeScript", "Tailwind CSS"],
  },
  florescer: {
    icon: "📱",
    title: "Florescer",
    description:
      "Aplicativo mobile offline-first para controle de hábitos diários com streaks, heatmap de constância estilo GitHub, notificações locais e sincronização em nuvem.",
    technologies: [
      "React Native",
      "Expo",
      "TypeScript",
      "Zustand",
      "Node.js",
      "MongoDB",
    ],
  },
  "idlewatch-agent-server": {
    icon: "🖥️",
    title: "Idlewatch Agent Server",
    description:
      "Sistema de monitoramento remoto em tempo real (CPU, memória, processos e tempo ocioso) integrado ao Active Directory (AD) via WinRM/PowerShell com exportação para Google Sheets.",
    technologies: ["Python", "PowerShell", "WinRM", "Active Directory"],
  },
  "web-development": {
    icon: "🎨",
    title: "Web Development",
    description:
      "Diretório interativo com 22 projetos front-end: clones de interfaces (Netflix, YouTube, Pinterest, Apple), landing pages, telas de login, componentes UI e laboratórios JS.",
    technologies: ["HTML5", "CSS3", "JavaScript", "Tailwind CSS", "Bootstrap"],
  },
  "clicker-project": {
    icon: "💻",
    title: "Clicker Project",
    description:
      "Jogo clicker em duas versões no mesmo repositório: versão web com estética Retro Terminal/Cyberpunk (upgrades, prestígio e conquistas) e versão original de terminal em C.",
    technologies: ["Next.js", "TypeScript", "Tailwind CSS", "C"],
  },
};

function escapeMarkdownCell(text) {
  return String(text || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function formatRepoTitle(name) {
  return name.replace(/[-_]+/g, " ");
}

function normalizeTechs(repo, curated) {
  if (curated?.technologies?.length) {
    return curated.technologies;
  }

  const seen = new Set();
  const techs = [];
  const raw = [repo.language, ...(repo.topics || [])].filter(Boolean);

  for (const item of raw) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      techs.push(item);
    }
  }

  return techs.length > 0 ? techs.slice(0, 5) : ["GitHub"];
}

function buildLinks(repo) {
  const links = [];
  const homepage = repo.homepage?.trim();

  if (homepage && /^https?:\/\//i.test(homepage)) {
    links.push(`[Deploy](${homepage})`);
  }

  links.push(`[Código](${repo.html_url})`);
  return links.join(" &bull; ");
}

async function fetchRepos() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${USERNAME}-readme-updater`,
  };

  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=pushed`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `Falha ao consultar GitHub API (${response.status} ${response.statusText})`
    );
  }

  return response.json();
}

function buildProjectsTable(repos) {
  const activeRepos = repos.filter(
    (repo) =>
      !repo.fork &&
      !repo.archived &&
      !repo.private &&
      !IGNORED_REPOS.has(repo.name.toLowerCase())
  );

  activeRepos.sort((a, b) => {
    const curatedA = CURATED_PROJECTS[a.name.toLowerCase()];
    const curatedB = CURATED_PROJECTS[b.name.toLowerCase()];

    if (curatedA?.pinned && !curatedB?.pinned) return -1;
    if (!curatedA?.pinned && curatedB?.pinned) return 1;

    return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
  });

  const selected = activeRepos.slice(0, MAX_PROJECTS);

  const lines = [
    "| Projeto | Descrição | Tecnologias | Links |",
    "| :--- | :--- | :--- | :---: |",
  ];

  for (const repo of selected) {
    const curated = CURATED_PROJECTS[repo.name.toLowerCase()];
    const icon = curated?.icon || "📦";
    const title = curated?.title || formatRepoTitle(repo.name);
    const description = escapeMarkdownCell(
      curated?.description ||
        repo.description ||
        "Projeto desenvolvido e disponível no GitHub."
    );
    const techs = normalizeTechs(repo, curated)
      .map((t) => `\`${escapeMarkdownCell(t)}\``)
      .join(" ");
    const links = buildLinks(repo);

    lines.push(
      `| **${icon} ${escapeMarkdownCell(title)}** | ${description} | ${techs} | ${links} |`
    );
  }

  return lines.join("\n");
}

async function main() {
  const readmePath = path.resolve(process.cwd(), "README.md");
  const currentContent = fs.readFileSync(readmePath, "utf8");
  const eol = currentContent.includes("\r\n") ? "\r\n" : "\n";

  const startIdx = currentContent.indexOf(START_MARKER);
  const endIdx = currentContent.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `Marcadores ${START_MARKER} e ${END_MARKER} não encontrados no README.md.`
    );
  }

  const repos = await fetchRepos();
  const table = buildProjectsTable(repos).replace(/\n/g, eol);

  const before = currentContent.slice(0, startIdx + START_MARKER.length);
  const after = currentContent.slice(endIdx);
  const nextContent = `${before}${eol}${table}${eol}${after}`;

  if (nextContent === currentContent) {
    console.log("README.md já está atualizado.");
    return;
  }

  fs.writeFileSync(readmePath, nextContent, "utf8");
  console.log("README.md atualizado com sucesso!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
