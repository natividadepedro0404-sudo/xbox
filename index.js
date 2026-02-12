const { Client, MessageEmbed } = require('discord.js-selfbot-v13');
const axios = require('axios');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const port = process.env.PORT || 4000;

const client = new Client();
const checkedUsers = new Set();

// Configurações automáticas
let totalScanned = 0;
let totalFound = 0;

// Listas específicas para detecção Xbox
const XBOX_GAMERTAG_PATTERNS = [
    /xbox/i,
    /xbl/i,
    /xbox.*live/i,
    /live.*xbox/i,
    /gamertag.*xbox/i,
    /xbox.*gamertag/i,
    /gt.*xbox/i,
    /xbox.*gt/i,
    /\[xbox\]/i,
    /\[xbl\]/i,
    /\(xbox\)/i,
    /\(xbl\)/i,
    /xbox\s*\.\s*com/i,
    /xbox\s*gamer/i,
    /microsoft\s*gamer/i,
    /xbox\s*club/i,
    /xbox\s*pass/i,
    /xbox\s*game\s*pass/i
];

const XBOX_GAMES = [
    'Xbox Live',
    'Xbox App',
    'Xbox Game Pass',
    'Xbox Cloud Gaming',
    'Xbox Console Companion',
    'Xbox Game Bar',
    'Xbox Network'
];

client.on('ready', async () => {
    console.clear();
    console.log('='.repeat(60));
    console.log('🎮 XBOX GAMERTAG SCANNER 🎮');
    console.log('='.repeat(60));
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
    console.log(`🏠 Servidores disponíveis: ${client.guilds.cache.size}`);
    console.log('='.repeat(60));
    console.log('\n🚀 INICIANDO SCAN AUTOMÁTICO...');
    console.log('='.repeat(60));
    
    // Começar o scan imediatamente
    await startXboxScan();
});

async function startXboxScan() {
    console.log('\n🎮 BUSCANDO GAMERTAGS XBOX...');
    console.log('='.repeat(50));
    
    const guilds = client.guilds.cache;
    const guildCount = guilds.size;
    
    console.log(`🔍 Escaneando ${guildCount} servidores...\n`);
    
    for (const [guildId, guild] of guilds) {
        try {
            const result = await scanGuild(guild);
            console.log(`📊 ${guild.name}: ${result.scanned} membros | ${result.found} gamertags encontradas`);
        } catch (error) {
            console.error(`❌ Erro em ${guild.name}:`, error.message);
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎮 SCAN FINALIZADO!');
    console.log(`👥 Total escaneado: ${totalScanned} usuários`);
    console.log(`✅ Gamertags encontradas: ${totalFound}`);
    console.log('='.repeat(50));
    console.log('\n📊 RESULTADOS ENVIADOS PARA O WEBHOOK');
    console.log('='.repeat(50));
}

async function scanGuild(guild) {
    let scanned = 0;
    let found = 0;
    
    try {
        await guild.members.fetch();
        
        for (const [memberId, member] of guild.members.cache) {
            if (member.user.bot) continue;
            
            scanned++;
            totalScanned++;
            
            // Pular se já foi verificado
            if (checkedUsers.has(memberId)) {
                continue;
            }
            
            // Verificar se tem gamertag Xbox
            const gamertag = await checkForXboxGamertag(member);
            
            if (gamertag) {
                found++;
                totalFound++;
                checkedUsers.add(memberId);
                
                await sendGamertagInfo(member, guild, gamertag);
                
                // Pequena pausa para evitar rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return { scanned, found };
        
    } catch (error) {
        console.error(`Erro ao escanear ${guild.name}:`, error.message);
        return { scanned: 0, found: 0 };
    }
}

async function checkForXboxGamertag(member) {
    const user = member.user;
    const username = user.username;
    const displayName = member.displayName;
    
    // Verificar ambos: username e display name
    const namesToCheck = [username];
    if (displayName && displayName !== username) {
        namesToCheck.push(displayName);
    }
    
    for (const name of namesToCheck) {
        // 1. Verificar padrões específicos de Xbox
        for (const pattern of XBOX_GAMERTAG_PATTERNS) {
            if (pattern.test(name)) {
                return {
                    gamertag: name,
                    type: 'xbox_keyword',
                    keyword: name.match(pattern)[0],
                    source: name
                };
            }
        }
        
        // 2. Verificar formato de gamertag com prefixos/sufixos
        const gamertagMatch = extractGamertagFromName(name);
        if (gamertagMatch) {
            return {
                gamertag: gamertagMatch.gamertag,
                type: gamertagMatch.type,
                prefix: gamertagMatch.prefix,
                source: name
            };
        }
    }
    
    return null;
}

function extractGamertagFromName(name) {
    // Padrões comuns de gamertags em nomes
    const patterns = [
        // GT: Gamertag
        /^(?:gt|gamertag)[:\s]+([A-Za-z0-9_]{3,15})$/i,
        // [GT] Gamertag
        /^\[(?:gt|gamertag)\]\s*([A-Za-z0-9_]{3,15})$/i,
        // (GT) Gamertag
        /^\((?:gt|gamertag)\)\s*([A-Za-z0-9_]{3,15})$/i,
        // Gamertag | GT
        /^([A-Za-z0-9_]{3,15})\s*[|\-]\s*(?:gt|gamertag)$/i,
        // Xbox: Gamertag
        /^xbox[:\s]+([A-Za-z0-9_]{3,15})$/i,
        // XBL: Gamertag
        /^xbl[:\s]+([A-Za-z0-9_]{3,15})$/i,
        // Gamertag (Xbox)
        /^([A-Za-z0-9_]{3,15})\s*\((?:xbox|xbl)\)$/i
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const match = name.match(patterns[i]);
        if (match) {
            return {
                gamertag: match[1],
                type: 'formatted_gamertag'
            };
        }
    }
    
    return null;
}

async function sendGamertagInfo(member, guild, gamertagInfo) {
    const user = member.user;
    const username = user.username;
    const userId = user.id;
    const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });
    
    // Informações da conta
    const createdAt = user.createdAt ? user.createdAt.toLocaleDateString('pt-BR') : 'Desconhecido';
    const accountAge = Date.now() - user.createdAt.getTime();
    const accountAgeInYears = Math.floor(accountAge / (1000 * 60 * 60 * 24 * 365));
    
    // Status
    const status = member.presence?.status || 'offline';
    const statusEmoji = {
        online: '🟢',
        idle: '🟡',
        dnd: '🔴',
        offline: '⚫'
    }[status] || '⚫';
    
    console.log(`   🎮 ${gamertagInfo.gamertag} - ${gamertagInfo.type}`);
    
    // Buscar banner
    let bannerURL = null;
    try {
        const fetchedUser = await client.users.fetch(userId, { force: true });
        if (fetchedUser.banner) {
            bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });
        }
    } catch (error) {
        // Ignorar erros
    }
    
    // Criar embed
    const embed = new MessageEmbed()
        .setColor('#107C10')
        .setTitle(`🎮 GAMERTAG XBOX DETECTADA 🎮`)
        .addFields([
            { 
                name: '👤 Nome de Usuário', 
                value: `\`${username}\``,
                inline: true 
            },
            { 
                name: '🎮 Gamertag Detectada', 
                value: `\`${gamertagInfo.gamertag}\``, 
                inline: true 
            },
            { 
                name: '🌐 Servidor', 
                value: `\`${guild.name}\``, 
                inline: true 
            },
            { 
                name: `${statusEmoji} Status`, 
                value: `\`${status}\``, 
                inline: true 
            },
            { 
                name: '📅 Conta Criada', 
                value: `\`${createdAt}\` (\`${accountAgeInYears} anos\`)`, 
                inline: true 
            },
            { 
                name: '🆔 ID do Usuário', 
                value: `\`${userId}\``, 
                inline: true 
            }
        ])
        .setThumbnail(avatarURL)
        .setTimestamp()
        .setFooter(`ID: ${userId} | Scanner Automático`);
    
    // Adicionar banner
    if (bannerURL) {
        embed.setImage(bannerURL);
    }
    
    // Adicionar informações da detecção
    embed.addField(
        '🔍 Tipo de Detecção',
        `\`${gamertagInfo.type}\``,
        true
    );
    
    if (gamertagInfo.keyword) {
        embed.addField(
            '🔤 Palavra-chave',
            `\`${gamertagInfo.keyword}\``,
            true
        );
    }
    
    // Adicionar estatísticas
    embed.addField(
        '📊 Estatísticas do Scan',
        `Total escaneado: \`${totalScanned}\`\n` +
        `Gamertags encontradas: \`${totalFound}\``,
        false
    );
    
    const data = {
        content: `🎮 **GAMERTAG XBOX DETECTADA: \`${gamertagInfo.gamertag}\`** 🎮`,
        embeds: [embed],
    };
    
    try {
        await axios.post(WEBHOOK_URL, data);
        console.log(`       ✅ Webhook enviado: ${gamertagInfo.gamertag}`);
    } catch (error) {
        console.error(`       ❌ Erro no webhook: ${error.message}`);
    }
}

// Iniciar o cliente
client.login(DISCORD_TOKEN);

// Tratar encerramento
process.on('SIGINT', () => {
    console.log('\n\n📊 RESUMO FINAL:');
    console.log('='.repeat(50));
    console.log(`👥 Total escaneado: ${totalScanned} usuários`);
    console.log(`✅ Gamertags encontradas: ${totalFound}`);
    console.log('='.repeat(50));
    console.log('👋 Encerrando scanner...');
    process.exit(0);
});

process.on('unhandledRejection', error => {
    console.error('Erro ignorado:', error.message);
});

