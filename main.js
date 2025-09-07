require("dotenv").config();
const { Client } = require("discord.js-selfbot-v13");
const axios = require("axios");

// ======================
// CONFIGURAÇÕES
// ======================
const token = process.env.TOKEN;
const monitorChannelIds = (process.env.MONITOR_CHANNEL_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);
const webhookLow = process.env.WEBHOOK_LOW;
const webhookHigh = process.env.WEBHOOK_HIGH;

// ======================
// CLIENT
// ======================
const client = new Client({ checkUpdate: false });

// ======================
// HELPERS
// ======================
function sanitizeId(id) {
  if (id === null || id === undefined) return "N/A";
  return String(id)
    .replace(/["'\\\n\r]/g, "") // remove aspas e quebras
    .replace(/[\u2018\u2019\u201C\u201D`]/g, "") // remove aspas unicode
    .replace(/\s+/g, "") // remove espaços
    .trim() || "N/A";
}

function sanitizeShort(text) {
  return (text || "N/A").replace(/[\[\]]/g, "").trim();
}

// converte valores como "15M/s" em número real (15000000)
function parsePower(str) {
  if (!str) return NaN;
  let txt = str.toUpperCase().replace(/\s/g, "").replace(/[^0-9.KMBT]/g, "");
  let multiplier = 1;

  if (txt.includes("K")) {
    multiplier = 1e3;
    txt = txt.replace("K", "");
  } else if (txt.includes("M")) {
    multiplier = 1e6;
    txt = txt.replace("M", "");
  } else if (txt.includes("B")) {
    multiplier = 1e9;
    txt = txt.replace("B", "");
  } else if (txt.includes("T")) {
    multiplier = 1e12;
    txt = txt.replace("T", "");
  }

  const num = parseFloat(txt);
  return isNaN(num) ? NaN : num * multiplier;
}

// ======================
// EVENTS
// ======================
client.on("ready", () => {
  console.log(`✅ Logado como ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  try {
    if (!monitorChannelIds.includes(msg.channel.id)) return;
    if (!msg.webhookId) return;
    if (!msg.embeds.length) return;

    const embed = msg.embeds[0];
    const description = embed.description || "";

    // Nome bruto
    const topBrainrotMatch = description.match(/Top Brainrot:\s*([^\n]+)/i);
    let rawName = topBrainrotMatch ? topBrainrotMatch[1].replace(/\*\*/g, "").trim() : "N/A";

    // Mutation
    const mutationMatch = rawName.match(/\[([^\]]+)\]/);
    let mutation = mutationMatch ? mutationMatch[1].trim() : "None";

    // Nome limpo
    let name = rawName.replace(/\[.*?\]/g, "").trim();

    // Power
    const powerMatch = description.match(/Power:\s*([^\n]+)/i);
    const power = powerMatch ? powerMatch[1].replace(/\*\*/g, "").trim() : "N/A";

    // ======================
    // Server ID (Job ID correto)
    // ======================
    let serverId = null;
    const lines = description.split("\n").map(l => l.trim());

    for (let i = 0; i < lines.length; i++) {
      if (/Server ID:/i.test(lines[i]) && lines[i + 1]) {
        const idLine = lines[i + 1].trim();
        if (idLine.length > 0) {
          serverId = idLine;
          break;
        }
      }
    }

    // Se ainda não tiver, tenta pegar do Script Join
    if (!serverId || serverId === "**" || serverId === "N/A") {
      const scriptMatch = description.match(/game:GetService\("TeleportService"\):TeleportToPlaceInstance\([0-9]+,\s*"([^"]+)"/i);
      serverId = scriptMatch ? scriptMatch[1].trim() : "N/A";
    }

    const cleanServerId = sanitizeId(serverId);

    const scriptJoinPC = cleanServerId !== "N/A"
      ? `game:GetService("TeleportService"):TeleportToPlaceInstance(109983668079237, "${cleanServerId}", game.Players.LocalPlayer)`
      : "Server ID não encontrado";

    // ======================
    // Extra Brainrots
    // ======================
    let brainrotExtras = "Nenhum";
    let otherBrainrots = [];
    let inOtherSection = false;

    for (const line of lines) {
      if (/^Other Brainrots/i.test(line)) {
        inOtherSection = true;
        continue;
      }
      if (inOtherSection) {
        if (line.startsWith("•")) {
          const match = line.match(/•\s*(?:\[([^\]]+)\]\s*)?(.+?)\s*\(\d+\).*?→\s*(.+)/);
          if (match) {
            otherBrainrots.push({
              mutation: match[1] ? match[1].trim() : "None",
              name: match[2].trim(),
              power: match[3].trim(),
            });
          }
        } else if (line === "" || !line.startsWith("•")) {
          break;
        }
      }
    }

    if (otherBrainrots.length) {
      brainrotExtras = otherBrainrots
        .map(b => `🧬 ${b.mutation} ｜ ${b.name} ｜ 💰 ${b.power}`)
        .join("\n");
    }

    // ======================
    // HIGH VALUE OU LOW VALUE
    // ======================
    let embedColor = 0x9b59b6; // roxo
    let title = "🔮 LOW VALUE PETS";
    let footerText = "⚡ Shadow Hub Finder";
    let targetWebhook = webhookLow;

    if (power !== "N/A") {
      const numPower = parsePower(power);
      if (!isNaN(numPower) && numPower >= 10_000_000) { // 10M+
        embedColor = 0xf1c40f;
        title = "⚡ HIGH VALUE PETS";
        footerText = "🔥 Shadow Hub Premium Dashboard";
        targetWebhook = webhookHigh;
      }
    }

    // ======================
    // EMBED FINAL
    // ======================
    const imageUrl = "https://media.discordapp.net/attachments/1408963499723329680/1410709871300575353/14374f6454e77e82c48051a3bb61dd9c.jpg?format=webp&width=839&height=839";
    const mutationClean = sanitizeShort(mutation);

    const mobileJobValue = cleanServerId !== "N/A" ? '```\n' + cleanServerId + '\n```' : 'Server ID não encontrado';
    const pcJobValue = cleanServerId !== "N/A" ? '```\n' + cleanServerId + '\n```' : 'Server ID não encontrado';
    const scriptJoinValue = '```lua\n' + scriptJoinPC + '\n```'; // manter highlight no script

    const newEmbed = {
      title,
      color: embedColor,
      description: `🏷️ **${name}** ｜ 💰 ${power}`,
      fields: [
        { name: "🧬 Mutation", value: `${mutationClean}`, inline: true },
        { name: "📱 Mobile Job", value: mobileJobValue, inline: true },
        { name: "💻 PC Job", value: pcJobValue, inline: true },
        { name: "🚀 Quick Join", value: `[👉 Click Here](https://krkrkrkrkrkrkrkrkrkrkrk.github.io/shadowhub.github.io/?placeId=${encodeURIComponent(cleanServerId)}&gameInstanceId=${encodeURIComponent(cleanServerId)})`, inline: false },
        { name: "💻 Script Join (PC)", value: scriptJoinValue, inline: false },
      ],
      thumbnail: { url: imageUrl },
      timestamp: new Date(),
      footer: { text: footerText, icon_url: imageUrl },
    };

    await axios.post(targetWebhook, { embeds: [newEmbed] });
    console.log(`📤 Enviado: ${name} (${title})`);

  } catch (err) {
    console.error("❌ Erro:", err && err.message ? err.message : err);
  }
});

// ======================
// LOGIN
// ======================
client.login(token);
